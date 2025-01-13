const jwt = require('jsonwebtoken');
const connection = require('../db/db');  // Asegúrate de que este `connection` sea el correcto
const SECRET_KEY = process.env.JWT_SECRET || 'secreto';
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const path = require('path');
const archiver = require('archiver');
const { format } = require('date-fns');  // Importamos la función 'format' de date-fns
const SFTPClient = require('ssh2-sftp-client'); // Para manejar la conexión SFTP si es necesario
const fsExtra = require('fs-extra');
require('dotenv').config();  // Cargar variables de entorno desde el archivo .env
// Configuración de Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);



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

// // Metodo FTTP Y SSH2 PARA DESCAGAR ARCHIVOS DE UN SERVIDOR Y COMPRIMIRLOS EN ZIP
// async function downloadFromSFTP(remotePath, localPath) {
//   const sftp = new SFTPClient();
//   try {
//     await sftp.connect({
//       host: process.env.SFTP_HOST,
//       port: process.env.SFTP_PORT,
//       username: process.env.SFTP_USERNAME,
//       password: process.env.SFTP_PASSWORD
//     });

//     // Intentar descargar el archivo
//     await sftp.get(remotePath, localPath);
//     console.log('Archivo descargado exitosamente:', remotePath);
//     return true;  // Indicamos que el archivo fue descargado correctamente
//   } catch (err) {
//     if (err.code === 2) {  // Error "No such file"
//       console.log(`Archivo no encontrado: ${remotePath}`);
//     } else {
//       console.error('Error al descargar archivo:', err);
//     }
//     return false;  // Indicamos que hubo un error
//   } finally {
//     await sftp.end();
//   }
// }

// controller.descargarSolicitud = async (req, res) => {
//   const { id } = req.params;

//   try {
//     console.log('[RUTA] Descargando documentos de la solicitud con ID:', id);

//     // Obtener la solicitud de la base de datos
//     const query = 'SELECT * FROM solicitudes WHERE id = ?';
//     const [solicitud] = await connection.execute(query, [id]);

//     if (!solicitud || solicitud.length === 0) {
//       return res.status(404).send('Solicitud no encontrada');
//     }

//     // Recuperar los documentos ARL y Seguridad Social
//     const arlDocument = solicitud[0].arl_documento;
//     const pasocialDocument = solicitud[0].pasocial_documento;

//     if (!arlDocument || !pasocialDocument) {
//       return res.status(400).send('Faltan documentos necesarios (ARL o Seguridad Social)');
//     }

//     // Inicializar la lista de documentos a incluir en el ZIP
//     const documents = [
//       { remotePath: `/home/administrator/gestion-ingreso-contratistas-ga/uploads/${arlDocument}`, name: `ARL_${id}${path.extname(arlDocument)}` },
//       { remotePath: `/home/administrator/gestion-ingreso-contratistas-ga/uploads/${pasocialDocument}`, name: `Pasocial_${id}${path.extname(pasocialDocument)}` }
//     ];

//     // Obtener los colaboradores y sus fotos
//     const queryColaboradores = 'SELECT cedula, foto, cedulaFoto FROM colaboradores WHERE solicitud_id = ?';
//     const [colaboradores] = await connection.execute(queryColaboradores, [id]);

//     colaboradores.forEach(colaborador => {
//       if (colaborador.foto) {
//         const ext = path.extname(colaborador.foto);
//         documents.push({ 
//           remotePath: `/home/administrator/gestion-ingreso-contratistas-ga/uploads/${colaborador.foto}`, 
//           name: `FOTOCC_${colaborador.cedula}${ext}` 
//         });
//       }
//       if (colaborador.cedulaFoto) {
//         const ext = path.extname(colaborador.cedulaFoto);
//         documents.push({ 
//           remotePath: `/home/administrator/gestion-ingreso-contratistas-ga/uploads/${colaborador.cedulaFoto}`, 
//           name: `FOTOCB_${colaborador.cedula}${ext}` 
//         });
//       }
//     });

//     let downloadedCount = 0;
//     const zip = archiver('zip', { zlib: { level: 9 } });
//     // const zipPath = path.join(__dirname, '..', 'uploads', `solicitud_${id}.zip`);
//     const zipPath = path.join('/tmp', `solicitud_${id}.zip`); // Cambia la ruta para usar /tmp
//     const output = fs.createWriteStream(zipPath);
    
//     zip.pipe(output);

//     // Descargar cada archivo del servidor SFTP y añadirlo al archivo ZIP
//     for (let document of documents) {
//       // const localPath = path.join(__dirname, '..', 'uploads', document.name);
//       const localPath = path.join('/tmp', document.name); // Guardar en /tmp para AWS Lambda o en un directorio temporal
//       const downloaded = await downloadFromSFTP(document.remotePath, localPath);
//       if (downloaded) {
//         zip.file(localPath, { name: document.name });
//         downloadedCount++;
//       }
//     }

//     // Finalizar el archivo ZIP
//     zip.finalize();

//     output.on('close', () => {
//       console.log('[RUTA] Archivo ZIP creado, enviando al cliente...');

//       if (downloadedCount > 0) {
//         res.download(zipPath, (err) => {
//           if (err) {
//             console.error('Error al descargar el archivo ZIP:', err);
//           }
//            // Eliminar archivos temporales después de la descarga
//       documents.forEach(document => {
//         const localPath = path.join(__dirname, '..', 'uploads', document.name);
//         if (fs.existsSync(localPath)) {  // Verificar si el archivo existe antes de eliminarlo
//           fs.unlinkSync(localPath);
//         }
//       });
//       if (fs.existsSync(zipPath)) {  // Asegurarse de que el ZIP también sea eliminado
//         fs.unlinkSync(zipPath);
//       }
//       console.log('[RUTA] Archivos temporales eliminados.');
//     });
//   } else {
//     res.status(404).send('No se encontraron archivos para descargar.');
//   }
// });

//   } catch (error) {
//     console.error('[RUTA] Error al generar el archivo ZIP:', error);
//     res.status(500).send('Error al generar el archivo ZIP');
//   }
// };



// Función para descargar un archivo desde Supabase y guardarlo localmente

async function downloadFromSupabase(bucket, fileName, localPath) {
  const { data, error } = await supabase
    .storage
    .from(bucket)
    .download(fileName);

  if (error) {
    console.error(`Error al descargar el archivo ${fileName}:`, error);
    return false;
  }

  // Convertir ArrayBuffer a Buffer antes de escribir en el archivo
  const buffer = Buffer.from(await data.arrayBuffer());
  
  fs.writeFileSync(localPath, buffer);
  console.log('Archivo descargado exitosamente:', fileName);
  return true;
}



controller.descargarSolicitud = async (req, res) => {
  const { id } = req.params;

  try {
    console.log('[RUTA] Descargando documentos de la solicitud con ID:', id);

    // Obtener la solicitud de la base de datos
    const query = 'SELECT * FROM solicitudes WHERE id = ?';
    const [solicitud] = await connection.execute(query, [id]);

    if (!solicitud || solicitud.length === 0) {
      return res.status(404).send('Solicitud no encontrada');
    }

    // Recuperar los documentos ARL y Seguridad Social
    const arlDocument = solicitud[0].arl_documento;
    const pasocialDocument = solicitud[0].pasocial_documento;

    if (!arlDocument || !pasocialDocument) {
      return res.status(400).send('Faltan documentos necesarios (ARL o Seguridad Social)');
    }

    // Lista de documentos a incluir en el ZIP
    const documents = [
      { bucket: 'uploads', fileName: arlDocument, name: `ARL_${id}${path.extname(arlDocument)}` },
      { bucket: 'uploads', fileName: pasocialDocument, name: `Pasocial_${id}${path.extname(pasocialDocument)}` }
    ];

    // Obtener colaboradores y sus fotos
    const queryColaboradores = 'SELECT cedula, foto, cedulaFoto FROM colaboradores WHERE solicitud_id = ?';
    const [colaboradores] = await connection.execute(queryColaboradores, [id]);

    colaboradores.forEach(colaborador => {
      if (colaborador.foto) {
        const ext = path.extname(colaborador.foto);
        documents.push({ bucket: 'uploads', fileName: colaborador.foto, name: `FOTOCC_${colaborador.cedula}${ext}` });
      }
      if (colaborador.cedulaFoto) {
        const ext = path.extname(colaborador.cedulaFoto);
        documents.push({ bucket: 'uploads', fileName: colaborador.cedulaFoto, name: `FOTOCB_${colaborador.cedula}${ext}` });
      }
    });

    // Define la ruta temporal para el archivo ZIP
    const tempDir = process.env.VERCEL ? '/tmp' : path.join('C:', 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const zipPath = path.join(tempDir, `solicitud_${id}.zip`);
    const output = fs.createWriteStream(zipPath);
    const zip = archiver('zip', { zlib: { level: 9 } });

    zip.pipe(output);

    // Descargar cada archivo desde Supabase y añadirlo al ZIP
    for (let document of documents) {
      const localPath = path.join(tempDir, document.name);
      const downloaded = await downloadFromSupabase(document.bucket, document.fileName, localPath);
      if (downloaded) {
        zip.file(localPath, { name: document.name });
      }
    }

    zip.finalize();

    output.on('close', () => {
      console.log('[RUTA] Archivo ZIP creado, enviando al cliente...');
      res.download(zipPath, (err) => {
        if (err) {
          console.error('Error al enviar el archivo ZIP:', err);
        }

        // Limpiar archivos temporales
        documents.forEach(doc => {
          const localPath = path.join(tempDir, doc.name);
          if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        });
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

        console.log('[RUTA] Archivos temporales eliminados.');
      });
    });

  } catch (error) {
    console.error('[RUTA] Error al generar el archivo ZIP:', error);
    res.status(500).send('Error al generar el archivo ZIP');
  }
};


module.exports = controller;
