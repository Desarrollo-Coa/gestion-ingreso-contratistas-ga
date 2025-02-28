const jwt = require('jsonwebtoken');
const connection = require('../db/db');  // Asegúrate de que este connection sea el correcto
const SECRET_KEY = process.env.JWT_SECRET || 'secreto';
const { format } = require('date-fns');  // Importamos la función 'format' de date-fns
const QRCode = require('qrcode');

const controller = {};
controller.vistaSeguridad = async (req, res) => {
    const token = req.cookies.token;

    if (!token) return res.redirect('/login');

    try { 
        const decoded = jwt.verify(token, SECRET_KEY);
        if (decoded.role !== 'seguridad') return res.redirect('/login');
 
        const { role, id, username } = decoded;
  
        // Obtener solicitudes y calcular estados 
    const [solicitud] = await connection.execute(`
        SELECT 
            s.id, 
            s.empresa, 
            s.nit, 
            s.estado, 
            us.username AS interventor, 
            s.lugar, 
            l.nombre_lugar,
            DATE_FORMAT(s.inicio_obra, '%d/%m/%Y') AS inicio_obra,
            DATE_FORMAT(s.fin_obra, '%d/%m/%Y') AS fin_obra,
            CASE
                -- Si está aprobada y la fecha de fin ya pasó
                WHEN s.estado = 'aprobada' AND CURDATE() > DATE(s.fin_obra) THEN 'pendiente ingreso - vencido'
                -- Si está aprobada y aún no ha vencido
                WHEN s.estado = 'aprobada' THEN 'pendiente ingreso'
                -- Si está en labor y vencida
                WHEN s.estado = 'en labor' AND CURDATE() > DATE(s.fin_obra) THEN 'en labor - vencida'
                -- Si está en labor
                WHEN s.estado = 'en labor' THEN 'en labor'
                -- Si está detenida
                WHEN s.estado = 'labor detenida' THEN 'labor detenida'
                ELSE s.estado
            END AS estado_actual
        FROM 
            solicitudes s
        JOIN 
            acciones a ON s.id = a.solicitud_id
        JOIN 
            users us ON us.id = s.interventor_id
        JOIN 
            lugares l ON l.nombre_lugar = s.lugar
        JOIN 
            users seguridad ON l.nombre_lugar = seguridad.username
        WHERE 
            s.estado IN ('aprobada', 'en labor', 'labor detenida')
            AND a.accion = 'aprobada'
            AND seguridad.role_id = (SELECT id FROM roles WHERE role_name = 'seguridad')
            AND seguridad.id = ?  -- Filtra por el ID del usuario de seguridad
        ORDER BY 
            s.id DESC;
        `, [id] );


        res.render('seguridad', { solicitud, title: 'Control de Seguridad - Grupo Argos', username: username });
    } catch (err) {
        console.error('Error al verificar el token o al obtener solicitudes:', err);
        res.redirect('/login');
    }
};
 

controller.getSolicitudDetalles = async (req, res) => {
    const { id } = req.params;
    try {
        const token = req.cookies.token;
        if (!token) {
            return res.status(401).json({ message: 'No autorizado' });
        }

        const decoded = jwt.verify(token, SECRET_KEY);
        const { username } = decoded; // Obtenemos el nombre de usuario del token



        const [solicitud] = await connection.execute(
            `
             SELECT s.id, s.empresa, s.nit, s.estado, us.username AS interventor,
                DATE_FORMAT(inicio_obra, '%Y-%m-%d') AS inicio_obra,
                DATE_FORMAT(fin_obra, '%Y-%m-%d') AS fin_obra,
                CASE
                    -- Si está aprobada y la fecha de fin ya pasó
                    WHEN estado = 'aprobada' AND CURDATE() > DATE(fin_obra) THEN 'pendiente ingreso - vencido'
                    -- Si está aprobada y aún no ha vencido
                    WHEN estado = 'aprobada' THEN 'pendiente ingreso'
                    -- Si está en labor y vencida
                    WHEN estado = 'en labor' AND CURDATE() > DATE(fin_obra) THEN 'en labor - vencida'
                    -- Si está en labor
                    WHEN estado = 'en labor' THEN 'en labor'
                    -- Si está detenida
                    WHEN estado = 'labor detenida' THEN 'labor detenida'
                    ELSE estado
                END AS estado_actual,
                lugar,
                labor
            FROM solicitudes s
            LEFT JOIN users us ON us.id = s.interventor_id
            LEFT JOIN acciones a ON a.solicitud_id = s.id
            WHERE s.id = ?  AND  estado IN ('aprobada', 'en labor', 'labor detenida' )
            AND a.accion = 'aprobada'
            `,
            [id]
        );

        if (!solicitud.length) {
            return res.status(404).json({ message: 'Solicitud no encontrada' });
        }

        
        // Verificar si el lugar de la solicitud coincide con el lugar del usuario de seguridad
        const lugarSolicitud = solicitud[0].lugar;
        const mensajeAdvertencia = lugarSolicitud !== username
            ? 'ADVERTENCIA: El lugar de la solicitud no coincide con tu ubicación. Notifica a la central la novedad.'
            : null;

        // Obtener colaboradores asociados a la solicitud
        const [colaboradores] = await connection.execute(
            'SELECT id, nombre, cedula, foto FROM colaboradores WHERE solicitud_id = ?',
            [id]
        );

        res.json({
            ...solicitud[0],
            colaboradores,
            advertencia: mensajeAdvertencia,
            username: username
        });
    } catch (error) {
        console.error('Error al obtener los detalles de la solicitud:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};



controller.qrAccesosModal = async (req, res) => {
    const idS  = req.params.id;
 
    try {
        const token = req.cookies.token;

        if (!token) {
            return res.redirect('/login');
        }

        const decoded = jwt.verify(token, SECRET_KEY);
        if (decoded.role !== 'seguridad') {
            return res.redirect('/login');
        }

        const { id, username } = decoded;

        // Obtener todas las solicitudes para la tabla principal
        const [solicitud] = await connection.execute(`
            SELECT 
                s.id, 
                s.empresa, 
                s.nit, 
                s.estado, 
                us.username AS interventor, 
                s.lugar, 
                l.nombre_lugar,
                DATE_FORMAT(s.inicio_obra, '%d/%m/%Y') AS inicio_obra,
                DATE_FORMAT(s.fin_obra, '%d/%m/%Y') AS fin_obra,
                CASE
                    WHEN s.estado = 'aprobada' AND CURDATE() > DATE(s.fin_obra) THEN 'pendiente ingreso - vencido'
                    WHEN s.estado = 'aprobada' THEN 'pendiente ingreso'
                    WHEN s.estado = 'en labor' AND CURDATE() > DATE(s.fin_obra) THEN 'en labor - vencida'
                    WHEN s.estado = 'en labor' THEN 'en labor'
                    WHEN s.estado = 'labor detenida' THEN 'labor detenida'
                    ELSE s.estado
                END AS estado_actual
            FROM solicitudes s
            JOIN acciones a ON s.id = a.solicitud_id
            JOIN users us ON us.id = s.interventor_id
            JOIN lugares l ON l.nombre_lugar = s.lugar
            JOIN users seguridad ON l.nombre_lugar = seguridad.username
            WHERE s.estado IN ('aprobada', 'en labor', 'labor detenida')
            AND a.accion = 'aprobada'
            AND seguridad.role_id = (SELECT id FROM roles WHERE role_name = 'seguridad')
            AND seguridad.id = ?
            ORDER BY s.id DESC
        `, [id]);

        // Obtener detalles de la solicitud específica
        const [solicitudDetails] = await connection.execute(`
            SELECT s.id, s.empresa, s.nit, s.estado, us.username AS interventor,
                DATE_FORMAT(inicio_obra, '%Y-%m-%d') AS inicio_obra,
                DATE_FORMAT(fin_obra, '%Y-%m-%d') AS fin_obra,
                CASE
                    WHEN estado = 'aprobada' AND CURDATE() > DATE(fin_obra) THEN 'pendiente ingreso - vencido'
                    WHEN estado = 'aprobada' THEN 'pendiente ingreso'
                    WHEN estado = 'en labor' AND CURDATE() > DATE(fin_obra) THEN 'en labor - vencida'
                    WHEN estado = 'en labor' THEN 'en labor'
                    WHEN estado = 'labor detenida' THEN 'labor detenida'
                    ELSE estado
                END AS estado_actual,
                lugar,
                labor
            FROM solicitudes s
            LEFT JOIN users us ON us.id = s.interventor_id
            LEFT JOIN acciones a ON a.solicitud_id = s.id
            WHERE s.id = ? AND estado IN ('aprobada', 'en labor', 'labor detenida')
            AND a.accion = 'aprobada'
        `, [idS]);

        if (!solicitudDetails.length) {
            return res.redirect('/vista-seguridad');
        }

        const lugarSolicitud = solicitudDetails[0].lugar;
        const mensajeAdvertencia = lugarSolicitud !== username
            ? 'ADVERTENCIA: El lugar de la solicitud no coincide con tu ubicación. Notifica a la central la novedad.'
            : null;

        const [colaboradores] = await connection.execute(
            'SELECT id, nombre, cedula, foto FROM colaboradores WHERE solicitud_id = ?',
            [idS]
        );

        // Configurar estados de botones
        const estadosNoPermitidosIngreso = [
            'en labor',
            'en labor - vencida',
            'labor detenida',
            'pendiente ingreso - vencido',
            'pendiente ingreso - vencida',
            'en labor - vencida'
        ];

        const estadoActual = solicitudDetails[0].estado_actual;
        const botonesEstado = {
            registrarIngreso: {
                disabled: estadosNoPermitidosIngreso.includes(estadoActual) || mensajeAdvertencia !== null,
                text: estadosNoPermitidosIngreso.includes(estadoActual) || mensajeAdvertencia !== null ? 'No disponible' : 'Registrar Ingreso'
            },
            registrarEntrada: {
                disabled: mensajeAdvertencia !== null || estadoActual === 'pendiente ingreso - vencido' || estadoActual === 'en labor - vencida',
                text: mensajeAdvertencia !== null || estadoActual === 'pendiente ingreso - vencido' || estadoActual === 'en labor - vencida' ? 'No disponible' : 'Registrar Entrada'
            },
            registrarSalida: {
                disabled: mensajeAdvertencia !== null || estadoActual === 'pendiente ingreso - vencido' || estadoActual === 'en labor - vencida',
                text: mensajeAdvertencia !== null || estadoActual === 'pendiente ingreso - vencido' || estadoActual === 'en labor - vencida' ? 'No disponible' : 'Registrar Salida'
            }
        };

        // Renderizar la vista con los datos actualizados
        res.render('seguridad', {
            solicitud,
            modalData: {
                ...solicitudDetails[0],
                colaboradores,
                advertencia: mensajeAdvertencia,
                botonesEstado
            },
            title: 'Control de Seguridad - Grupo Argos',
            username: username
        });

    } catch (error) {
        console.error('Error al procesar la solicitud:', error);
        res.redirect('/vista-seguridad');
    }
};


  controller.registrarIngreso = async (req, res) => {
    const { id } = req.params;

    try {
        console.log(`[CONTROLLER] Intentando registrar ingreso para solicitud con ID: ${id}`);

        // Obtener el estado actual de la solicitud
        const [rows] = await connection.execute(
            'SELECT estado FROM solicitudes WHERE id = ?',
            [id]
        );

        if (rows.length === 0) {
            console.error('[CONTROLLER] Solicitud no encontrada.');
            return res.status(404).send({ message: 'Solicitud no encontrada' });
        }

        const { estado } = rows[0];

        // Verificar si la solicitud está en estado "labor detenida"
        if (estado === 'labor detenida') {
            console.log('[CONTROLLER] La solicitud está en estado "labor detenida".');
            return res.status(400).send({ message: 'No se puede registrar ingreso para una solicitud con estado "labor detenida".' });
        }

        // Actualizar el estado a "en labor"
        const [result] = await connection.execute(
            'UPDATE solicitudes SET estado = "en labor" WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            console.error('[CONTROLLER] Error al actualizar el estado de la solicitud.');
            return res.status(500).send({ message: 'Error al registrar ingreso.' });
        }

        console.log('[CONTROLLER] Solicitud actualizada exitosamente a "en labor".');
        res.status(200).send({ message: 'Ingreso registrado con éxito' });
    } catch (err) {
        console.error('[CONTROLLER] Error al registrar ingreso:', err);
        res.status(500).send({ message: 'Error interno del servidor' });
    }
};





const moment = require('moment-timezone');
const fechaMySQL = moment().tz("America/Bogota").format("YYYY-MM-DD HH:mm:ss");

 
controller.registrarEntrada = async (req, res) => {
    try {
        const token = req.cookies.token;

        if (!token) {
            return res.redirect('/login');
        }

        const decoded = jwt.verify(token, SECRET_KEY);
        if (decoded.role !== 'seguridad') return res.redirect('/login');
 
        const { role, id, username } = decoded;

        const IdUser = id

        const { solicitudId, colaboradores, fecha, estado_actual } = req.body;
        console.log("Cuerpo del registro: ", req.body);

        if (!solicitudId || !colaboradores || colaboradores.length === 0 || !fecha || !estado_actual) {
            console.log('[CONTROLLER] Datos incompletos en la solicitud.');
            return res.status(400).json({ message: 'Datos incompletos en la solicitud.' });
        }

        console.log(`[CONTROLLER] Iniciando registro de entrada para solicitud_id: ${solicitudId}`);
        console.log(`[CONTROLLER] Fecha y hora de entrada: ${fecha}`);

        for (const colaborador of colaboradores) {
            if (!colaborador.id) {
                console.log('[CONTROLLER] ID del colaborador inválido.');
                continue;
            }
            console.log(`[CONTROLLER] Registrando entrada para colaborador_id: ${colaborador.id}`);
            
            const [result] = await connection.execute(
                'INSERT INTO registros (colaborador_id, solicitud_id,usuario_id, tipo, fecha_hora, estado_actual, created_at) VALUES (?, ?, ?, "entrada", ?,?,?)',
                [colaborador.id, solicitudId, IdUser, fecha, estado_actual, fechaMySQL]
            );
            console.log(`[CONTROLLER] Resultado de la inserción para colaborador_id ${colaborador.id}:`, result);
        }
        
        console.log('[CONTROLLER] Entradas registradas correctamente');
        res.status(200).json({ message: 'Entrada registrada correctamente' });
    } catch (error) {
        console.error('[CONTROLLER] Error al registrar entrada:', error);
        res.status(500).json({ message: 'Error al registrar la entrada', error });
    }
};

controller.registrarSalida = async (req, res) => {
    try {
        const token = req.cookies.token;

        if (!token) {
            return res.redirect('/login');
        }
        
        const decoded = jwt.verify(token, SECRET_KEY);
        if (decoded.role !== 'seguridad') return res.redirect('/login');
 
        const { role, id, username } = decoded;
        const IdUser = id;
        
        const { solicitudId, colaboradores, fecha, estado_actual } = req.body;
        const fechaMySQL = moment().tz("America/Bogota").format("YYYY-MM-DD HH:mm:ss"); // Definir aquí fechaMySQL

        console.log("Cuerpo del registro: ", req.body);

        if (!solicitudId || !colaboradores || colaboradores.length === 0 || !fecha || !estado_actual) {
            console.log('[CONTROLLER] Datos incompletos en la solicitud.');
            return res.status(400).json({ message: 'Datos incompletos en la solicitud.' });
        }

        console.log(`[CONTROLLER] Iniciando registro de salida para solicitud_id: ${solicitudId}`);
        console.log(`[CONTROLLER] Fecha y hora de salida: ${fecha}`);

        for (const colaborador of colaboradores) {
            if (!colaborador.id) {
                console.log('[CONTROLLER] ID del colaborador inválido.');
                continue;
            }
            console.log(`[CONTROLLER] Registrando salida para colaborador_id: ${colaborador.id}`);

            const [result] = await connection.execute(
                'INSERT INTO registros (colaborador_id, solicitud_id, usuario_id, tipo, fecha_hora, estado_actual, created_at) VALUES (?, ?, ?, "salida", ?, ?, ?)',
                [colaborador.id, solicitudId, IdUser, fecha, estado_actual, fechaMySQL]
            );
            console.log(`[CONTROLLER] Resultado de la inserción para colaborador_id ${colaborador.id}:`, result);
        }
        
        console.log('[CONTROLLER] Salidas registradas correctamente');
        res.status(200).json({ message: 'Salida registrada correctamente' });
    } catch (error) {
        console.error('[CONTROLLER] Error al registrar salida:', error);
        res.status(500).json({ message: 'Error al registrar la salida', error });
    }
};

// Agregar nuevo controlador para vista-seguridad/:id
controller.vistaSeguridadDetalle = async (req, res) => {
    const idS = req.params.id;
    try {
        const token = req.cookies.token;

        if (!token) {
            return res.redirect('/login');
        }

        const decoded = jwt.verify(token, SECRET_KEY);
        if (decoded.role !== 'seguridad') {
            return res.redirect('/login');
        }

        const { id, username } = decoded;

        // Obtener todas las solicitudes para la tabla principal
        const [solicitud] = await connection.execute(`
            SELECT 
                s.id, 
                s.empresa, 
                s.nit, 
                s.estado, 
                us.username AS interventor, 
                s.lugar, 
                l.nombre_lugar,
                DATE_FORMAT(s.inicio_obra, '%d/%m/%Y') AS inicio_obra,
                DATE_FORMAT(s.fin_obra, '%d/%m/%Y') AS fin_obra,
                CASE
                    WHEN s.estado = 'aprobada' AND CURDATE() > DATE(s.fin_obra) THEN 'pendiente ingreso - vencido'
                    WHEN s.estado = 'aprobada' THEN 'pendiente ingreso'
                    WHEN s.estado = 'en labor' AND CURDATE() > DATE(s.fin_obra) THEN 'en labor - vencida'
                    WHEN s.estado = 'en labor' THEN 'en labor'
                    WHEN s.estado = 'labor detenida' THEN 'labor detenida'
                    ELSE s.estado
                END AS estado_actual
            FROM solicitudes s
            JOIN acciones a ON s.id = a.solicitud_id
            JOIN users us ON us.id = s.interventor_id
            JOIN lugares l ON l.nombre_lugar = s.lugar
            JOIN users seguridad ON l.nombre_lugar = seguridad.username
            WHERE s.estado IN ('aprobada', 'en labor', 'labor detenida')
            AND a.accion = 'aprobada'
            AND seguridad.role_id = (SELECT id FROM roles WHERE role_name = 'seguridad')
            AND seguridad.id = ?
            ORDER BY s.id DESC
        `, [id]);

        // Obtener detalles de la solicitud específica
        const [solicitudDetails] = await connection.execute(`
            SELECT s.id, s.empresa, s.nit, s.estado, us.username AS interventor,
                DATE_FORMAT(inicio_obra, '%Y-%m-%d') AS inicio_obra,
                DATE_FORMAT(fin_obra, '%Y-%m-%d') AS fin_obra,
                CASE
                    WHEN estado = 'aprobada' AND CURDATE() > DATE(fin_obra) THEN 'pendiente ingreso - vencido'
                    WHEN estado = 'aprobada' THEN 'pendiente ingreso'
                    WHEN estado = 'en labor' AND CURDATE() > DATE(fin_obra) THEN 'en labor - vencida'
                    WHEN estado = 'en labor' THEN 'en labor'
                    WHEN estado = 'labor detenida' THEN 'labor detenida'
                    ELSE estado
                END AS estado_actual,
                lugar,
                labor
            FROM solicitudes s
            LEFT JOIN users us ON us.id = s.interventor_id
            LEFT JOIN acciones a ON a.solicitud_id = s.id
            WHERE s.id = ? AND estado IN ('aprobada', 'en labor', 'labor detenida')
            AND a.accion = 'aprobada'
        `, [idS]);

        if (!solicitudDetails.length) {
            return res.status(404).json({ message: 'Solicitud no encontrada' });
        }

        const lugarSolicitud = solicitudDetails[0].lugar;
        const mensajeAdvertencia = lugarSolicitud !== username
            ? 'ADVERTENCIA: El lugar de la solicitud no coincide con tu ubicación. Notifica a la central la novedad.'
            : null;

        const [colaboradores] = await connection.execute(
            'SELECT id, nombre, cedula, foto FROM colaboradores WHERE solicitud_id = ?',
            [idS]
        );

        // Renderizar la vista con los datos
        res.render('seguridad', {
            solicitud,
            modalData: {
                ...solicitudDetails[0],
                colaboradores,
                advertencia: mensajeAdvertencia
            },
            title: 'Control de Seguridad - Grupo Argos',
            username: username
        });

    } catch (error) {
        console.error('Error al procesar la solicitud:', error);
        res.status(500).send('Error interno del servidor');
    }
};

module.exports = controller; 