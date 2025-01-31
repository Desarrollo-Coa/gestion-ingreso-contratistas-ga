const jwt = require('jsonwebtoken');
const connection = require('../db/db');  // Asegúrate de que este connection sea el correcto
const SECRET_KEY = process.env.JWT_SECRET || 'secreto';
const { format } = require('date-fns');  // Importamos la función 'format' de date-fns
const QRCode = require('qrcode');


const controller = {}; 
 
controller.vistaInterventor = async (req, res) => {
  const token = req.cookies.token;

  console.log('[DEBUG] Token recibido:');  // Depuración: Ver el token recibido

  // Verificación del token
  if (!token) {
    console.log('[DEBUG] No se proporcionó token, redirigiendo al login.');
    return res.redirect('/login');
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    console.log('[DEBUG] Token decodificado:');  // Depuración: Ver el token decodificado

    const { role, id } = decoded;

    // Verificar si el rol es 'interventor'
    if (role !== 'interventor') {
      console.log('[DEBUG] El usuario no es interventor, redirigiendo al login.');
      return res.redirect('/login');
    }

    // Obtener las acciones y solicitudes procesadas desde la base de datos
    const [acciones] = await connection.execute(`
      SELECT 
        a.id AS accion_id,
        a.solicitud_id,
        a.accion,
        a.comentario,
        DATE_FORMAT(s.inicio_obra, '%d/%m/%Y') AS inicio_obra,
        DATE_FORMAT(s.fin_obra, '%d/%m/%Y') AS fin_obra,
        s.estado AS solicitud_estado,
        s.lugar,
        s.labor,
        s.empresa,
        s.nit,
        us.username AS interventor,


        -- Determinar si la solicitud está vencida o no
        CASE
          WHEN DATE(s.fin_obra) < CURDATE() THEN 'Vencida'
          ELSE 'Vigente'
        END AS estado_vigencia,

        -- Lógica para el botón de "Aprobar"
        CASE
          WHEN a.accion = 'pendiente' AND s.estado = 'aprobada' THEN 'Aprobar'
          ELSE 'No disponible'
        END AS puede_aprobar,

        -- Lógica para el botón de "Detener Labor"
        CASE
          WHEN a.accion = 'aprobada' AND s.estado = 'en labor' THEN 'Detener Labor'
          ELSE 'No disponible'
        END AS puede_detener,

        -- Lógica para el botón de "Ver QR"
        CASE
          WHEN a.accion = 'aprobada' AND s.estado IN ('aprobada', 'en labor') 
               AND DATE(s.fin_obra) >= CURDATE() THEN 'Ver QR'
          ELSE 'No disponible'
        END AS puede_ver_qr

      FROM acciones a
      JOIN solicitudes s ON a.solicitud_id = s.id
      LEFT JOIN users us ON us.id  = s.interventor_id
      WHERE 
        (a.accion IN ('aprobada', 'pendiente') OR s.estado IN ('en labor', 'labor detenida')) AND s.interventor_id = ?
      ORDER BY a.id DESC;
    `, [id]);

    console.log('[DEBUG] Acciones obtenidas de la base de datos:');  // Depuración: Ver las acciones obtenidas

    // Pasar las acciones y otros datos necesarios a la vista
    res.render('interventor', {
      acciones,
      title: 'Interventor - Grupo Argos',
      format  // Pasamos la función format a la vista
    });
  } catch (err) {
    console.error('[ERROR] Error al verificar el token o al obtener acciones:', err);
    res.redirect('/login');
  }
};



controller.aprobarSolicitud = async (req, res) => {
  const { solicitudId } = req.body;

  console.log('[DEBUG] Aprobando solicitud con ID:', solicitudId);

  try {
    // Verificar el estado actual de la acción para la solicitud
    const [accion] = await connection.execute('SELECT accion FROM acciones WHERE solicitud_id = ?', [solicitudId]);

    if (accion.length === 0) {
      return res.status(404).send('Acción no encontrada');
    }

    // Si la acción ya está aprobada, no permitir aprobarla nuevamente
    if (accion[0].accion === 'aprobada') {
      console.log('[DEBUG] La solicitud ya está aprobada.');
      return res.status(400).send('La solicitud ya está aprobada.');
    }

    // Si la acción no está aprobada, actualizamos el estado a "aprobada"
    await connection.execute('UPDATE acciones SET accion = "aprobada" WHERE solicitud_id = ?', [solicitudId]);

    console.log('[DEBUG] Estado de la acción actualizado a "aprobada".');

    // Luego, verificamos la fecha de la solicitud, y si está vigente
    const [solicitud] = await connection.execute('SELECT fin_obra FROM solicitudes WHERE id = ?', [solicitudId]);

    const currentDate = new Date();
    const fechaFin = new Date(solicitud[0].fin_obra);

    // Si la fecha de fin es anterior a la fecha actual, marcar la solicitud como vencida
    if (fechaFin < currentDate) {
      console.log('[DEBUG] La solicitud está vencida.');
      // Nota: La solicitud no se marca como "vencida" aquí si ya está aprobada
      // Esto se podría manejar de otra manera, si se necesita un campo específico para vencimiento
    }

    res.redirect('/vista-interventor'); // Redirigir de nuevo a la vista del interventor
  } catch (err) {
    console.error('[ERROR] Error al aprobar solicitud:', err);
    res.status(500).send('Error al aprobar la solicitud');
  }
};


controller.generarQR = async (req, res) => {
  const solicitudId = req.params.id;

  console.log('[DEBUG] Generando QR para solicitud con ID:', solicitudId);

  try {
    // Verificamos si la solicitud está aprobada
    const [solicitud] = await connection.execute(
      `SELECT a.accion AS estado_accion, s.fin_obra 
       FROM acciones a
       JOIN solicitudes s ON a.solicitud_id = s.id
       WHERE a.solicitud_id = ? AND a.accion = 'aprobada'
       ORDER BY a.created_at DESC
       LIMIT 1`, 
      [solicitudId]
    );

    if (solicitud.length === 0) {
      // Si no se encuentra la solicitud aprobada, no permitimos generar el QR
      console.log('[DEBUG] Solo las solicitudes aprobadas pueden generar un QR.');
      return res.status(400).json({ error: 'Solo las solicitudes aprobadas pueden generar un QR.' });
    }

    const currentDate = new Date();
    let fechaFin = new Date(solicitud[0].fin_obra); // Asegúrate de que fin_obra esté en un formato válido
    fechaFin.setDate(fechaFin.getDate() + 1); // Sumar 1 día a la fecha de fin
    const fechafinal = fechaFin; // Esta es la fecha final con un día añadido


    if (fechafinal < currentDate) {
      // Si la solicitud está vencida, no se puede generar el QR
      console.log('[DEBUG] La solicitud está vencida, no se puede generar el QR.');
      return res.status(400).json({ error: 'La solicitud está vencida, no se puede generar el QR.' });
    }

    // Generamos el código QR con el formato de URL solicitado
    const qrData = `gestion-ingreso-contratistas-ga.vercel.app/vista-seguridad/${solicitudId}`;
    const qrImage = await QRCode.toDataURL(qrData);

    console.log('[DEBUG] QR generado exitosamente.');
    res.json({ qrUrl: qrImage }); // Enviamos la imagen del QR como JSON
  } catch (err) {
    console.error('[ERROR] Error al generar el QR:', err);
    res.status(500).json({ error: 'Error al generar el código QR' });
  }
};



 // Endpoint para detener la labor de una solicitud
 controller.detenerLabor = async (req, res) => {
  const { solicitudId } = req.params;

  console.log("Validando id de solicitud a detener", solicitudId);

  const query = `UPDATE solicitudes 
                 SET estado = 'labor detenida' 
                 WHERE id = ? AND estado = 'en labor'`;

  try {
    // Usamos await para esperar que la consulta a la base de datos se complete
    const [result] = await connection.execute(query, [solicitudId]);

    if (result.affectedRows > 0) {
      // Se actualizó correctamente el estado
      res.status(200).json({ message: 'Labor detenida correctamente' });
    } else {
      // Si no se encontró la solicitud o ya estaba detenida
      res.status(400).json({ message: 'La solicitud no está en estado de "en labor" o ya fue detenida.' });
    }
  } catch (err) {
    // En caso de error en la consulta
    console.error('[CONTROLADOR] Error al detener la labor:', err);
    res.status(500).json({ message: 'Error al intentar detener la labor' });
  }
};



// Endpoint para reanudar la labor de una solicitud
controller.reanudarLabor = async (req, res) => {
  const { solicitudId } = req.params;

  console.log("Validando id de solicitud para reanudar", solicitudId);

  const query = `UPDATE solicitudes 
                 SET estado = 'en labor' 
                 WHERE id = ? AND estado = 'labor detenida'`;

  try {
    // Usamos await para esperar que la consulta a la base de datos se complete
    const [result] = await connection.execute(query, [solicitudId]);

    if (result.affectedRows > 0) {
      // Se actualizó correctamente el estado
      res.status(200).json({ message: 'Labor reanudada correctamente' });
    } else {
      // Si no se encontró la solicitud o ya estaba en estado "en labor"
      res.status(400).json({ message: 'La solicitud no está en estado de "labor detenida" o ya está en labor.' });
    }
  } catch (err) {
    // En caso de error en la consulta
    console.error('[CONTROLADOR] Error al reanudar la labor:', err);
    res.status(500).json({ message: 'Error al intentar reanudar la labor' });
  }
};

module.exports = controller;
