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

        // Obtener solicitudes y calcular estados
        const [solicitud] = await connection.execute(`
            SELECT id, empresa, nit, estado,
                DATE_FORMAT(inicio_obra, '%d/%m/%Y') AS inicio_obra,
                DATE_FORMAT(fin_obra, '%d/%m/%Y') AS fin_obra,
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
                END AS estado_actual
            FROM solicitudes
            WHERE estado IN ('aprobada', 'en labor', 'labor detenida' )
            ORDER BY id DESC
        `);
 
        res.render('seguridad', { solicitud, title: 'Control de Seguridad - Grupo Argos' });
    } catch (err) {
        console.error('Error al verificar el token o al obtener solicitudes:', err);
        res.redirect('/login');
    }
};

const BASE_URL = process.env.BASE_URL || 'http://localhost:8800';

controller.getSolicitudDetalles = async (req, res) => {
    


    const { id } = req.params;
    try {
        const [solicitud] = await connection.execute(
            `
            SELECT id, empresa, nit, estado,
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
            FROM solicitudes
            WHERE id = ?  AND  estado IN ('aprobada', 'en labor', 'labor detenida' )
            `,
            [id]
        );

        if (!solicitud.length) {
            return res.status(404).json({ message: 'Solicitud no encontrada' });
        }

        // Obtener colaboradores asociados a la solicitud
        const [colaboradores] = await connection.execute(
            'SELECT nombre, cedula, CONCAT(?, "/", foto) AS foto FROM colaboradores WHERE solicitud_id = ?',
            [`${BASE_URL}`, id]
        );

        res.json({
            ...solicitud[0],
            colaboradores,
        });
    } catch (error) {
        console.error('Error al obtener los detalles de la solicitud:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};



controller.qrAccesosModal = async (req, res) => {
    const { id } = req.params;
    try {
        const token = req.cookies.token;

        if (!token) {
            return res.redirect('/login');
        }

        const decoded = jwt.verify(token, SECRET_KEY);
        if (decoded.role !== 'seguridad') {
            return res.redirect('/login');
        }

        // Primera consulta: Obtener todas las solicitudes y calcular estados
        const [solicitud] = await connection.execute(`
            SELECT id, empresa, nit, estado,
                DATE_FORMAT(inicio_obra, '%d/%m/%Y') AS inicio_obra,
                DATE_FORMAT(fin_obra, '%d/%m/%Y') AS fin_obra,
                CASE
                    WHEN estado = 'aprobada' AND CURDATE() > DATE(fin_obra) THEN 'pendiente ingreso - vencido'
                    WHEN estado = 'aprobada' THEN 'pendiente ingreso'
                    WHEN estado = 'en labor' AND CURDATE() > DATE(fin_obra) THEN 'en labor - vencida'
                    WHEN estado = 'en labor' THEN 'en labor'
                    WHEN estado = 'labor detenida' THEN 'labor detenida'
                    ELSE estado
                END AS estado_actual
            FROM solicitudes
            ORDER BY id DESC
        `);

        // Segunda consulta: Detalles de una solicitud específica
        const [solicitudDetails] = await connection.execute(`
            SELECT id, empresa, nit, estado, 
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
            FROM solicitudes
            WHERE id = ?
        `, [id]);

        // Verificar si la solicitud específica existe
        if (!solicitudDetails.length) {
            return res.status(404).json({ message: 'Solicitud no encontrada' });
        }

        // Obtener colaboradores asociados a la solicitud
        const [colaboradores] = await connection.execute(
            'SELECT nombre, cedula, CONCAT(?, "/", foto) AS foto FROM colaboradores WHERE solicitud_id = ?',
            [`${BASE_URL}`, id]
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
                colaboradores,
            },
            modalId: id,
            title: 'Control de Seguridad - Grupo Argos',
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
