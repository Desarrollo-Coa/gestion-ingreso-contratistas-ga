const jwt = require('jsonwebtoken');
const connection = require('../db/db');  // Asegúrate de que este `connection` sea el correcto
const SECRET_KEY = process.env.JWT_SECRET || 'secreto';
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { format } = require('date-fns');  // Importamos la función 'format' de date-fns
   


const controller = {};

// Vista de SST (con token y rol verificado)
controller.vistaSst = async (req, res) => {
  const token = req.cookies.token;

  // Verificación del token
  console.log('Verificando si el token está presente en las cookies...');
  if (!token) {
    console.log('Error: Token no encontrado en las cookies');
    return res.redirect('/login');
  }

  try {
    // Verificar el token
    console.log('Verificando la validez del token...');
    const decoded = jwt.verify(token, SECRET_KEY);
    console.log('Token verificado con éxito. Datos decodificados:', decoded);

    const { role } = decoded;

    // Verificar si el rol es 'sst'
    console.log('Verificando el rol del usuario...');
    if (role !== 'sst') {
      console.log(`Error: El rol del usuario no es 'sst'. Rol actual: ${role}`);
      return res.redirect('/login');
    }

    console.log('Rol verificado correctamente. Acceso permitido a la vista SST');

    // Obtener las solicitudes pendientes de la base de datos
    console.log('Obteniendo solicitudes pendientes de la base de datos...');
    const [solicitud] = await connection.execute('SELECT * FROM solicitudes ORDER BY id DESC');
    
    if (!solicitud.length) {
      console.log('No hay solicitudes pendientes en la base de datos');
    } else {
      console.log('Solicitudes obtenidas:');
    }

    // Formatear las fechas de las solicitudes (inicio_obra y fin_obra) al formato dd/MM/yyyy
    solicitud.forEach(solici => {
      solici.inicio_obra = format(new Date(solici.inicio_obra), 'dd/MM/yyyy');
      solici.fin_obra = format(new Date(solici.fin_obra), 'dd/MM/yyyy');
    });

    console.log("Comprobando id de solicitudes");

    // Renderizar la vista 'sst' con las solicitudes obtenidas
    console.log('Renderizando la vista de SST...');
    res.render('sst', { solicitud: solicitud, title: 'SST - Grupo Argos' });

  } catch (err) {
    console.error('Error al verificar el token o al obtener solicitudes:', err);
    res.redirect('/login'); // Redirige al login si ocurre cualquier error
  }
};


// Negar solicitud (Mostrar formulario de comentarios)
controller.mostrarNegarSolicitud = async (req, res) => {
  const { id } = req.params;
  try {
    console.log('[RUTAS] Mostrando detalles para negar solicitud con ID:', id);

    // Obtener los detalles de la solicitud para mostrar en el modal
    const query = 'SELECT * FROM solicitudes WHERE id = ?';
    const [solicitud] = await connection.execute(query, [id]);

    if (solicitud.length === 0) {
      return res.status(404).send('Solicitud no encontrada');
    }

    // Renderizar vista con los detalles de la solicitud
    res.render('negar-solicitud', { solicitud: solicitud[0] });

  } catch (error) {
    console.error('Error al obtener detalles de la solicitud:', error);
    res.status(500).send('Error al obtener detalles de la solicitud');
  }
};



// Aprobar solicitud
controller.aprobarSolicitud = async (req, res) => {
  const { id } = req.params;  // Obtener el ID de la solicitud desde los parámetros
  const token = req.cookies.token;  // Obtener el token desde las cookies

  // Verificar el token
  jwt.verify(token, SECRET_KEY, async (err, decoded) => {
    if (err) {
      console.log('[CONTROLADOR] Error al verificar el token:', err);
      return res.redirect('/login');
    }

    const { id: usuarioId } = decoded;  // Obtener el usuarioId desde el token decodificado

    try {
      console.log('[RUTAS] Aprobando solicitud con ID:', id);

      // Actualizar el estado de la solicitud a 'aprobada'
      const query = 'UPDATE solicitudes SET estado = "aprobada" WHERE id = ?';
      await connection.execute(query, [id]);

      // Registrar la acción en la tabla de acciones (registrar acción de aprobación)
      const accionQuery = 'INSERT INTO acciones (solicitud_id, usuario_id, accion) VALUES (?, ?, "pendiente")';
      await connection.execute(accionQuery, [id, usuarioId]); // Usamos el usuarioId que está en el token

      res.redirect('/vista-sst'); // Redirigir al listado de solicitudes
    } catch (error) {
      console.error('Error al aprobar la solicitud:', error);
      res.status(500).send('Error al aprobar la solicitud');
    }
  });
};

// Negar solicitud (Guardar el comentario y la acción)
controller.negarSolicitud = async (req, res) => {
  const { id } = req.params;  // Obtener el ID de la solicitud desde los parámetros
  const { comentario } = req.body;  // Obtener el comentario del cuerpo de la solicitud
  const token = req.cookies.token;  // Obtener el token desde las cookies

  // Verificar el token
  jwt.verify(token, SECRET_KEY, async (err, decoded) => {
    if (err) {
      console.log('[CONTROLADOR] Error al verificar el token:', err);
      return res.redirect('/login');
    }

    const { id: usuarioId } = decoded;  // Obtener el usuarioId desde el token decodificado

    try {
      console.log('[RUTAS] Negando solicitud con ID:', id);

      // Actualizar el estado de la solicitud a 'negada'
      const query = 'UPDATE solicitudes SET estado = "negada" WHERE id = ?';
      await connection.execute(query, [id]);

      // Registrar la acción en la tabla de acciones (registrar acción de negación con comentario)
      const accionQuery = 'INSERT INTO acciones (solicitud_id, usuario_id, accion, comentario) VALUES (?, ?, "negada", ?)';
      await connection.execute(accionQuery, [id, usuarioId, comentario]); // Usamos el usuarioId que está en el token y el comentario

      res.redirect('/vista-sst'); // Redirigir al listado de solicitudes

    } catch (error) {
      console.error('Error al negar la solicitud:', error);
      res.status(500).send('Error al negar la solicitud');
    }
  });
};

 
// Descargar los documentos de la solicitud
controller.descargarSolicitud = async (req, res) => {
  const { id } = req.params;
  try {
    console.log('[RUTAS] Descargando documentos de la solicitud con ID:', id);

    // Obtener la solicitud con sus documentos
    const query = 'SELECT * FROM solicitudes WHERE id = ?';
    const [solicitud] = await connection.execute(query, [id]);

    if (!solicitud || solicitud.length === 0) {
      return res.status(404).send('Solicitud no encontrada');
    }

    const documents = [
      { path: solicitud[0].arl_documento, name: 'ARL DOCUMENTO' },
      { path: solicitud[0].pasocial_documento, name: 'PAGO SEGURIDAD SOCIAL PLANILLA' }
    ];

    // Verificar que las rutas de los documentos sean válidas
    if (!documents.every(doc => typeof doc.path === 'string' && doc.path.trim() !== '')) {
      return res.status(400).send('Documentos no válidos o no encontrados');
    }

    // Obtener las fotos de los colaboradores y las URLs de las cédulas
    const queryColaboradores = 'SELECT cedula, foto, urlCedula FROM colaboradores WHERE solicitud_id = ?';
    const [colaboradores] = await connection.execute(queryColaboradores, [id]);

    // Agregar las fotos de los colaboradores y las URLs de las cédulas a la lista de documentos
    colaboradores.forEach(colaborador => {
      if (colaborador.foto) {
        const ext = path.extname(colaborador.foto); // Obtener la extensión del archivo
        documents.push({ path: colaborador.foto, name: `trabajador_${colaborador.cedula}${ext}` }); // Mantener la extensión
      }
      if (colaborador.urlCedula) {
        const ext = path.extname(colaborador.urlCedula); // Obtener la extensión del archivo
        documents.push({ path: colaborador.urlCedula, name: `doc_trabajador_${colaborador.cedula}${ext}` }); // Mantener la extensión
      }
    });

    // Crear el archivo ZIP
    const zipPath = path.join(__dirname, '..', 'uploads', 'solicitud_' + id + '.zip');
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    // Añadir los documentos al archivo ZIP
    documents.forEach(document => {
      const filePath = path.join(__dirname, '..', document.path);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: `${document.name}${path.extname(document.path)}` }); // Usar el nombre especificado y mantener la extensión
      } else {
        console.error(`Documento no encontrado: ${filePath}`);
      }
    });

    // Finalizar el archivo ZIP
    archive.finalize();

    // Cuando el archivo ZIP se ha creado, lo enviamos al usuario
    output.on('close', () => {
      res.download(zipPath, (err) => {
        if (err) {
          console.error('Error al descargar el archivo:', err);
        }
        fs.unlinkSync(zipPath);  // Eliminar el archivo ZIP después de la descarga
      });
    });

  } catch (error) {
    console.error('Error al generar el archivo ZIP:', error);
    res.status(500).send('Error al generar el archivo ZIP');
  }
};


module.exports = controller;
