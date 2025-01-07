const express = require('express'); 
const path = require('path');
const connection = require('../db/db'); // Database connection
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || 'secreto';

const controller = {};

controller.vistaContratista = async (req, res) => {
  console.log('[CONTROLADOR] Procesando vista del contratista');

  const token = req.cookies.token;

  if (!token) {
      console.log('[CONTROLADOR] No se encontró el token, redirigiendo a login');
      return res.redirect('/login');
  }

  try {
      const decoded = jwt.verify(token, SECRET_KEY);
      const { role, id } = decoded;

      if (role !== 'contratista') {
          console.log(`[CONTROLADOR] Rol incorrecto: ${role}`);
          return res.redirect('/login');
      }

      console.log('[CONTROLADOR] Obteniendo solicitudes del contratista');

      const query = `
        SELECT 
        s.id, 
        s.empresa, 
        s.nit, 
        DATE_FORMAT(s.inicio_obra, '%d/%m/%Y') AS inicio_obra, 
        DATE_FORMAT(s.fin_obra, '%d/%m/%Y') AS fin_obra, 
        s.dias_trabajo, 
        s.estado, 
        a.accion, 
        a.comentario, 
        s.lugar, 
        s.labor,
        CASE
            WHEN s.estado = 'aprobada' AND a.accion = 'pendiente' THEN 'aprobado por sst'  -- Solicitud aprobada y acción pendiente
            WHEN s.estado = 'aprobada' AND a.accion = 'aprobada' THEN 'pendiente ingreso'  -- Solicitud y acción ambas aprobadas
            WHEN s.estado = 'aprobada' AND CURDATE() > DATE(s.fin_obra) THEN 'pendiente ingreso - vencido'
            WHEN s.estado = 'en labor' AND CURDATE() > DATE(s.fin_obra) THEN 'en labor - vencida'
            WHEN s.estado = 'en labor' THEN 'en labor'
            WHEN s.estado = 'labor detenida' THEN 'labor detenida'
            ELSE s.estado
        END AS estado_actual
    FROM solicitudes s
    LEFT JOIN acciones a ON s.id = a.solicitud_id
    WHERE s.usuario_id = ?
    ORDER BY s.id DESC;
      `;

      const [solicitudes] = await connection.execute(query, [id]);

      console.log('[CONTROLADOR] Solicitudes obtenidas:', solicitudes);

      const [userDetails] = await connection.query('SELECT empresa, nit FROM users WHERE id = ?', [id]);

      const empresa = userDetails.length > 0 ? userDetails[0].empresa : '';
      const nit = userDetails.length > 0 ? userDetails[0].nit : '';

      res.render('contratista', {
          title: 'Contratista - Grupo Argos',
          solicitudes,
          empresa,
          nit
      });
  } catch (error) {
      console.error('[CONTROLADOR] Error:', error);
      res.status(500).send('Error al procesar la solicitud');
  }
};

controller.crearSolicitud = async (req, res) => {
  try {
    console.log('[CONTROLADOR] Se está procesando la solicitud de creación');
    console.log('[CONTROLADOR] Request Body:', req.body);

    const token = req.cookies.token;  // Recuperar el token desde la cookie
    if (!token) {
      console.log('[CONTROLADOR] No se encontró el token, redirigiendo a login');
      return res.redirect('/login');
    }

    // Verificar el token y obtener el id del usuario
    const decoded = jwt.verify(token, SECRET_KEY);
    const { id: usuarioId } = decoded;  // Obtener el ID del usuario desde el token

    // Obtener datos del formulario
    const { empresa, nit, inicio_obra, fin_obra, dias_trabajo, estado, cedula, nombre, lugar, labor } = req.body;

    // Crear un arreglo para almacenar los campos faltantes
    const camposFaltantes = [];

    // Validar que todos los campos necesarios estén presentes
    if (!empresa) camposFaltantes.push('empresa');
    if (!nit) camposFaltantes.push('nit');
    if (!inicio_obra) camposFaltantes.push('inicio_obra');
    if (!fin_obra) camposFaltantes.push('fin_obra');
    if (!dias_trabajo) camposFaltantes.push('dias_trabajo');

    // Comprobar si se enviaron los documentos ARL y Planilla de Pago
    if (!req.body.arl || !req.body.pasocial) {
      camposFaltantes.push('Documentos ARL o Planilla de Pago');
    }

    // Si hay campos faltantes, devolver un mensaje de error detallado
    if (camposFaltantes.length > 0) {
      console.error('[CONTROLADOR] Faltan campos requeridos:', camposFaltantes);
      return res.status(400).json({
        message: `Por favor, complete los siguientes campos requeridos: ${camposFaltantes.join(', ')}.`
      });
    }

    // Si no se ha enviado un estado, asignamos 'pendiente' por defecto
    const estadoFinal = estado || 'pendiente';

    // Insertar la solicitud en la base de datos usando el ID del usuario
    const query = 'INSERT INTO solicitudes (usuario_id, empresa, nit, inicio_obra, fin_obra, dias_trabajo, arl_documento, pasocial_documento, cedula_foto, estado, lugar, labor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    const values = [usuarioId, empresa, nit, inicio_obra, fin_obra, dias_trabajo, req.body.arl, req.body.pasocial, req.body.cedula_foto || '', estadoFinal, lugar, labor];

    console.log('[CONTROLADOR] Insertando solicitud con los siguientes valores:', values);

    const result = await connection.execute(query, values);
    const solicitudId = result[0].insertId;

    console.log('[CONTROLADOR] Solicitud creada con ID:', solicitudId);
    
    // Manejo de colaboradores (si se envían)
    if (req.body['foto[]'] && req.body['cedulaFoto[]'] && req.body['foto[]'].length > 0 && req.body['cedulaFoto[]'].length > 0) {
      const fotosColaboradores = req.body['foto[]'];  // Acceder a las fotos correctamente
      const cedulaFotoColaboradores = req.body['cedulaFoto[]'];  // Acceder a las cédulas correctamente
      const cedulaColaboradores = Array.isArray(cedula) ? cedula : [cedula];
      const nombreColaboradores = Array.isArray(nombre) ? nombre : [nombre];

      // Validar que el número de colaboradores coincida
      if (fotosColaboradores.length !== cedulaColaboradores.length || fotosColaboradores.length !== nombreColaboradores.length) {
        console.error('[CONTROLADOR] El número de fotos no coincide con el número de colaboradores');
        return res.status(400).json({ message: 'El número de fotos no coincide con el número de colaboradores.' });
      }

      let insertPromises = [];
      for (let i = 0; i < fotosColaboradores.length; i++) {
        const cedulaColaborador = cedulaColaboradores[i];
        const nombreColaborador = nombreColaboradores[i];
        const fotoColaborador = fotosColaboradores[i];
        const cedulaFotoColaborador = cedulaFotoColaboradores[i];

        const queryColaboradores = 'INSERT INTO colaboradores (solicitud_id, cedula, nombre, foto, urlCedula) VALUES (?, ?, ?, ?, ?)';
        const valuesColaboradores = [solicitudId, cedulaColaborador, nombreColaborador, fotoColaborador, cedulaFotoColaborador];

        console.log('[CONTROLADOR] Insertando colaborador con los siguientes valores:', valuesColaboradores);
        insertPromises.push(connection.execute(queryColaboradores, valuesColaboradores));
      }

      // Esperar que todas las inserciones de colaboradores se completen
      await Promise.all(insertPromises);
      console.log('[CONTROLADOR] Colaboradores insertados con éxito');
      res.status(201).json({ message: 'Solicitud y colaboradores creados con éxito' });
    } else {
      res.status(201).json({ message: 'Solicitud creada con éxito, pero sin colaboradores' });
    }
    
  } catch (err) {
    console.error('[CONTROLADOR] Error inesperado:', err);
    res.status(500).json({ message: 'Error interno del servidor', error: err });
  }
};


// Controller for viewing the contractor's requests
controller.obtenerSolicitudes = (req, res) => {
  console.log('[CONTROLADOR] Se está procesando la visualización de las solicitudes');

  const token = req.cookies.token;
  console.log('[CONTROLADOR] Token recibido desde las cookies:', token);

  if (!token) {
      console.log('[CONTROLADOR] No se encontró el token, redirigiendo a login');
      return res.redirect('/login');
  }

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
      if (err) {
          console.log('[CONTROLADOR] Error al verificar el token:', err);
          return res.redirect('/login');
      }

      console.log('[CONTROLADOR] Token verificado correctamente:');

      const { id: usuarioId } = decoded;  // Obtener el ID del usuario desde el token

      // Consultar todas las solicitudes de este usuario
      const query = `
          SELECT s.id, s.empresa, s.nit, s.inicio_obra, s.fin_obra, s.dias_trabajo, s.estado, 
                 a.accion, a.comentario
          FROM solicitudes s
          LEFT JOIN acciones a ON s.id = a.solicitud_id
          WHERE s.usuario_id = ?`;
          

      connection.execute(query, [usuarioId])
          .then(result => {
              const solicitudes = result[0];
              console.log('[CONTROLADOR] Solicitudes obtenidas:');

              // Aquí pasamos las solicitudes obtenidas al renderizar la vista
              res.render('solicitudes', { 
                  title: 'Mis Solicitudes - Grupo Argos', 
                  solicitudes 
              });
          })
          .catch(err => {
              console.error('[CONTROLADOR] Error al obtener las solicitudes:', err);
              res.status(500).json({ message: 'Error al obtener las solicitudes' });
          });
  });
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




module.exports = controller;