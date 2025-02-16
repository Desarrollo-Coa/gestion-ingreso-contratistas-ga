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
            'SELECT nombre, cedula, foto FROM colaboradores WHERE solicitud_id = ?',
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

        const {  id , username } = decoded; // Obtenemos el nombre de usuario del token
 

        // Primera consulta: Obtener todas las solicitudes y calcular estados
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

        // Segunda consulta: Detalles de una solicitud específica
        const [solicitudDetails] = await connection.execute(`
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
        `, [idS]);

        // Verificar si la solicitud específica existe
        if (!solicitudDetails.length) {
            return res.status(404).json({ message: 'Solicitud no encontrada' });
        }

        
        // Verificar si el lugar de la solicitud coincide con el lugar del usuario de seguridad
        const lugarSolicitud = solicitudDetails[0].lugar;
        const mensajeAdvertencia = lugarSolicitud !== username
            ? 'ADVERTENCIA: El lugar de la solicitud no coincide con tu ubicación. Notifica a la central la novedad.'
            : null;

        // Obtener colaboradores asociados a la solicitud
        const [colaboradores] = await connection.execute(
            'SELECT nombre, cedula, foto FROM colaboradores WHERE solicitud_id = ?',
            [idS]
        );

        // Enviar datos a la vista con el renderizado
        res.render('seguridad', {
            solicitud,
            colaboradores,
            modalData: {
                empresa: solicitudDetails[0].empresa,
                id: solicitudDetails[0].id,
                lugar: solicitudDetails[0].lugar,
                labor: solicitudDetails[0].labor,
                inicio_obra: solicitudDetails[0].inicio_obra,
                fin_obra: solicitudDetails[0].fin_obra,
                estado: solicitudDetails[0].estado_actual,
                interventor: solicitudDetails[0].interventor,
                colaboradores,
                advertencia: mensajeAdvertencia
            },
            modalId: idS,
            title: 'Control de Seguridad - Grupo Argos',
            username: username

        });
    } catch (error) {
        console.error('Error al procesar la solicitud:', error);
        res.status(500).send('Error interno del servidor');
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



module.exports = controller; 