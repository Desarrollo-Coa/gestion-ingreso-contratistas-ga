const jwt = require('jsonwebtoken');
const QRCode = require('qrcode'); 
const connection = require('../db/db');
const SECRET_KEY = process.env.JWT_SECRET || 'secreto';
const fs = require('fs');
const puppeteer = require('puppeteer');
const handlebars = require('handlebars');
const path = require('path');
const archiver = require('archiver');
const { format } = require('date-fns');
require('dotenv').config();
const axios = require('axios');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const pdf = require('html-pdf');
 

const controller = {};

const s3Client = new S3Client({
    endpoint: 'https://nyc3.digitaloceanspaces.com',
    region: "us-east-1",
    credentials: {
        accessKeyId: process.env.DO_SPACES_KEY,
        secretAccessKey: process.env.DO_SPACES_SECRET
    }
});



// Vista de SST (con token y rol verificado)


controller.vistaSst = async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
      return res.redirect('/login');
  }

  try {
      const decoded = jwt.verify(token, SECRET_KEY);
      const { role } = decoded;

      if (role !== 'sst') {
          return res.redirect('/login');
      }

      // Obtener las solicitudes
      const [solicitud] = await connection.execute('SELECT s.*, us.username AS interventor FROM solicitudes s LEFT JOIN users us ON us.id = s.interventor_id WHERE us.username != "COA" ORDER BY id DESC');

      // Obtener las URLs de los documentos (si existen)
      const [solicitud_url_download] = await connection.execute('SELECT * FROM sst_documentos WHERE solicitud_id IN (SELECT id FROM solicitudes)');

      // Formatear fechas
      solicitud.forEach(solici => {
          solici.inicio_obra = format(new Date(solici.inicio_obra), 'dd/MM/yyyy');
          solici.fin_obra = format(new Date(solici.fin_obra), 'dd/MM/yyyy');
      });

      // Pasar las URLs a la vista
      res.render('sst', {
          solicitud: solicitud,
          title: 'SST - Grupo Argos',
          solicitud_url_download: solicitud_url_download
      });

  } catch (err) {
      console.error('Error al verificar el token o al obtener solicitudes:', err);
      res.redirect('/login');
  }
};

// Función para subir un archivo a DigitalOcean Spaces
async function uploadToSpaces(filePath, fileName) {
    const fileContent = fs.readFileSync(filePath);

    const command = new PutObjectCommand({
        Bucket: 'app-storage-contratistas',
        Key: fileName,
        Body: fileContent,
        ACL: 'public-read'
    });

    try {
        const response = await s3Client.send(command);
        const fileUrl = `https://app-storage-contratistas.nyc3.digitaloceanspaces.com/${fileName}`;
        console.log("Resultado de la subida del zip: ", { response, fileUrl });
        return fileUrl;
    } catch (error) {
        console.error('Error al subir el archivo a DigitalOcean Spaces:', error);
        return null;
    }
}


// Negar solicitud (Mostrar formulario de comentarios)
controller.mostrarNegarSolicitud = async (req, res) => {
    const { id } = req.params;

    try {
        const query = 'SELECT * FROM solicitudes WHERE id = ?';
        const [solicitud] = await connection.execute(query, [id]);

        if (solicitud.length === 0) {
            return res.status(404).send('Solicitud no encontrada');
        }

        res.render('negar-solicitud', { solicitud: solicitud[0] });

    } catch (error) {
        console.error('Error al obtener detalles de la solicitud:', error);
        res.status(500).send('Error al obtener detalles de la solicitud');
    }
};

// Aprobar solicitud
controller.aprobarSolicitud = async (req, res) => {
    const { id } = req.params;
    const token = req.cookies.token;

    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
        if (err) {
            return res.redirect('/login');
        }

        const { id: usuarioId } = decoded;

        try {
            const query = 'UPDATE solicitudes SET estado = "aprobada" WHERE id = ?';
            await connection.execute(query, [id]);

            const accionQuery = 'INSERT INTO acciones (solicitud_id, usuario_id, accion) VALUES (?, ?, "pendiente")';
            await connection.execute(accionQuery, [id, usuarioId]);

            res.redirect('/vista-sst');
        } catch (error) {
            console.error('Error al aprobar la solicitud:', error);
            res.status(500).send('Error al aprobar la solicitud');
        }
    });
};

// Negar solicitud (Guardar el comentario y la acción)
controller.negarSolicitud = async (req, res) => {
    const { id } = req.params;
    const { comentario } = req.body;
    const token = req.cookies.token;

    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
        if (err) {
            return res.redirect('/login');
        }

        const { id: usuarioId } = decoded;

        try {
            const query = 'UPDATE solicitudes SET estado = "negada" WHERE id = ?';
            await connection.execute(query, [id]);

            const accionQuery = 'INSERT INTO acciones (solicitud_id, usuario_id, accion, comentario) VALUES (?, ?, "negada", ?)';
            await connection.execute(accionQuery, [id, usuarioId, comentario]);

            res.redirect('/vista-sst');
        } catch (error) {
            console.error('Error al negar la solicitud:', error);
            res.status(500).send('Error al negar la solicitud');
        }
    });
};
 

async function getImageBase64(imageUrl) {
    try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        return `data:image/jpeg;base64,${Buffer.from(response.data, 'binary').toString('base64')}`;
    } catch (error) {
        console.error("❌ Error al convertir imagen a Base64:", error.message);
        return null; // Retorna null si hay error
    }
}
const sharp = require('sharp');


async function convertWebPtoJpeg(url) {
    try {
        // Validar si la URL es nula, indefinida o no es una cadena válida
        if (!url || typeof url !== 'string' || url.trim() === '') {
            console.warn("⚠️ URL no válida o vacía. Omitiendo conversión.");
            return null;
        }

        // Descargar la imagen WebP
        const response = await axios.get(url, { responseType: 'arraybuffer' });

        // Convertir WebP a JPEG usando sharp
        const jpegBuffer = await sharp(response.data)
            .toFormat('jpeg') // Convertir a JPEG
            .toBuffer();

        // Devolver la imagen en Base64
        return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
    } catch (error) {
        console.error("❌ Error al convertir la imagen:", error);
        return null;
    }
}

async function generateInformePDF({ solicitud, colaboradores, contractorName, interventorName }) {
    try {
        console.log("Prueba colaborador: ", colaboradores);

        // Convertir las imágenes de los colaboradores a Base64
        for (const colaborador of colaboradores) {
            // Convertir la foto de perfil
            if (colaborador.foto) {
                colaborador.fotoBase64 = await convertWebPtoJpeg(colaborador.foto);
            } else {
                colaborador.fotoBase64 = null; // Si no hay foto, asignar null
            }

            // Convertir la foto de la cédula
            if (colaborador.cedulaFoto) {
                colaborador.cedulaFotoBase64 = await convertWebPtoJpeg(colaborador.cedulaFoto);
            } else {
                colaborador.cedulaFotoBase64 = null; // Si no hay cédula, asignar null
            }
        }

        // Cargar la plantilla HTML
        const templatePath = path.join(__dirname, '../src/views', 'informe-template.html');
        const templateContent = fs.readFileSync(templatePath, 'utf8');
        const template = handlebars.compile(templateContent);

        // Convertir el logo a Base64
        const logoPath = path.join(__dirname, '../public', 'img', 'logo-ga.jpg');
        const logoBase64 = fs.readFileSync(logoPath, 'base64');

        // Datos para la plantilla
        const data = {
            logo: `data:image/jpeg;base64,${logoBase64}`,
            fecha: new Date().toLocaleDateString(),
            solicitud,
            colaboradores,
            contractorName,
            interventorName
        };

        // Generar el HTML
        const html = template(data);

        // Opciones para el PDF
        const pdfOptions = {
            format: 'Letter',
            timeout: 60000, // Aumentar el tiempo de espera a 60 segundos
            phantomArgs: ['--web-security=no', '--load-images=yes'] // Habilitar carga de imágenes
        };

        // Generar el PDF
        return new Promise((resolve, reject) => {
            pdf.create(html, pdfOptions).toBuffer((err, buffer) => {
                if (err) {
                    console.error("❌ Error al generar el PDF:", err);
                    reject(err);
                } else {
                    resolve(buffer);
                }
            });
        });

    } catch (error) {
        console.error("❌ Error al generar el informe PDF:", error);
        throw error;
    }
} 

// async function generateInformePDF({ solicitud, colaboradores, contractorName, interventorName }) {
//     const templatePath = path.join(__dirname, '../src/views', 'informe-template.html');
//     const templateContent = fs.readFileSync(templatePath, 'utf8');
//     const template = handlebars.compile(templateContent);

//     const logoPath = path.join(__dirname, '../public', 'img', 'logo-ga.jpg');
//     const logoBase64 = fs.readFileSync(logoPath, 'base64');

//     const data = {
//         logoBase64: `data:image/png;base64,${logoBase64}`,
//         fecha: new Date().toLocaleDateString(),
//         solicitud,
//         contractorName,
//         interventorName,
//         colaboradores
//     };

//     const html = template(data);
//     const browser = await puppeteer.launch();
//     const page = await browser.newPage();
//     await page.setContent(html, { waitUntil: 'networkidle0' });

//     const pdfBuffer = await page.pdf({ format: 'A4' });
//     await browser.close();

//     return pdfBuffer;
// }

async function downloadFromSpaces(fileUrl, localPath) {
    if (!fileUrl) {
        return false;
    }

    const fileName = fileUrl.split('/').pop();
    if (!fileName) {
        return false;
    }

    const command = new GetObjectCommand({
        Bucket: 'app-storage-contratistas',
        Key: fileName,
    });

    try {
        const response = await s3Client.send(command);
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        fs.writeFileSync(localPath, Buffer.concat(chunks));
        return true;
    } catch (error) {
        console.error(`Error al descargar el archivo ${fileName}:`, error);
        return false;
    }
}


// // Descargar solicitud y generar ZIP si no existe
// controller.descargarSolicitud = async (req, res) => {
     
//   const { id } = req.params;
//   const tempDir = path.join('/tmp', `solicitud_${id}`);
//   const pdfPath = path.join(tempDir, `Informe_Solicitud_${id}.pdf`);
//   const zipPath = path.join(tempDir, `Solicitud_${id}.zip`);

//   try {
//       // Verificar si ya existe una URL en la tabla sst_documentos
//       const [existingDoc] = await connection.execute('SELECT * FROM sst_documentos WHERE solicitud_id = ?', [id]);

//       if (existingDoc.length > 0) {
//           // Si ya existe, redirigir a la URL almacenada
//           return res.redirect(existingDoc[0].url);
//       }

//       // Si no existe, generar el ZIP
//       fs.mkdirSync(tempDir, { recursive: true });

//       const [solicitud] = await connection.execute('SELECT * FROM solicitudes WHERE id = ?', [id]);
//       if (!solicitud || solicitud.length === 0) {
//           return res.status(404).send('Solicitud no encontrada');
//       }

//       const [colaboradores] = await connection.execute('SELECT cedula, nombre, foto, cedulaFoto FROM colaboradores WHERE solicitud_id = ?', [id]);
//       const [contratista] = await connection.execute('SELECT username FROM users WHERE id = ?', [solicitud[0].usuario_id]);
//       const [interventor] = await connection.execute('SELECT username FROM users WHERE id = ?', [solicitud[0].interventor_id]);

//     //   for (const colaborador of colaboradores) {
//     //       if (colaborador.foto) colaborador.fotoBase64 = await getImageBase64(colaborador.foto);
//     //       if (colaborador.cedulaFoto) colaborador.cedulaFotoBase64 = await getImageBase64(colaborador.cedulaFoto);
//     //   }
      
//       // Formatear fechas
//       solicitud.forEach(solici => {
//         solici.inicio_obra = format(new Date(solici.inicio_obra), 'dd/MM/yyyy');
//         solici.fin_obra = format(new Date(solici.fin_obra), 'dd/MM/yyyy');
//     });


//       const pdfBuffer = await generateInformePDF({
//           solicitud: solicitud[0],
//           colaboradores,
//           contractorName: contratista[0].username,
//           interventorName: interventor[0].username,
//       });

//       fs.writeFileSync(pdfPath, pdfBuffer);

//       const arlPath = path.join(tempDir, `ARL_${id}${path.extname(solicitud[0].arl_documento)}`);
//       const pasocialPath = path.join(tempDir, `Pago_Seguridad_Social_${id}${path.extname(solicitud[0].pasocial_documento)}`);
//       await downloadFromSpaces(solicitud[0].arl_documento, arlPath);
//       await downloadFromSpaces(solicitud[0].pasocial_documento, pasocialPath);

//       const output = fs.createWriteStream(zipPath);
//       const archive = archiver('zip', { zlib: { level: 9 } });

//       output.on('close', async () => {
//           // Subir el archivo ZIP a DigitalOcean Spaces
//           const zipFileName = `sst-documents/Solicitud_${id}.zip`;
//           const zipUrl = await uploadToSpaces(zipPath, zipFileName);

//           console.log("URL A INSERTAR GENERADA: ", zipUrl)

//           if (zipUrl) {
//               // Guardar la URL en la tabla sst_documentos
//               await connection.execute(
//                   'INSERT INTO sst_documentos (solicitud_id, url) VALUES (?, ?)',
//                   [id, zipUrl]
//               );

//               // Redirigir a la URL del archivo
//               res.redirect(zipUrl);
//           } else {
//               res.status(500).send('Error al subir el archivo ZIP');
//           }

//           // Limpiar el directorio temporal
//           fs.rmSync(tempDir, { recursive: true, force: true });
//       });

//       archive.on('error', (err) => {
//           throw err;
//       });

//       archive.pipe(output);
//       archive.file(pdfPath, { name: `Informe_Solicitud_${id}.pdf` });
//       archive.file(arlPath, { name: `ARL_${id}${path.extname(solicitud[0].arl_documento)}` });
//       archive.file(pasocialPath, { name: `Pago_Seguridad_Social_${id}${path.extname(solicitud[0].pasocial_documento)}` });
//       archive.finalize();

//   } catch (error) {
//       console.error('[RUTA] Error al generar el archivo ZIP:', error);
//       res.status(500).send('Error al generar el archivo ZIP');
//       if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
//   }
// // };
// controller.descargarSolicitud = async (req, res) => {
//     const { id } = req.params;
//     const tempDir = path.join('/tmp', `solicitud_${id}`);
//     const pdfPath = path.join(tempDir, `Informe_Solicitud_${id}.pdf`);
//     const zipPath = path.join(tempDir, `Solicitud_${id}.zip`);
  
//     try {
//         const [existingDoc] = await connection.execute('SELECT * FROM sst_documentos WHERE solicitud_id = ?', [id]);
//         if (existingDoc.length > 0) {
//             return res.redirect(existingDoc[0].url);
//         }
  
//         fs.mkdirSync(tempDir, { recursive: true });
  
//         const [solicitud] = await connection.execute('SELECT * FROM solicitudes WHERE id = ?', [id]);
//         if (!solicitud || solicitud.length === 0) {
//             return res.status(404).send('Solicitud no encontrada');
//         }
  
//         const [colaboradores] = await connection.execute('SELECT cedula, nombre, foto, cedulaFoto FROM colaboradores WHERE solicitud_id = ?', [id]);
//         const [contratista] = await connection.execute('SELECT username FROM users WHERE id = ?', [solicitud[0].usuario_id]);
//         const [interventor] = await connection.execute('SELECT username FROM users WHERE id = ?', [solicitud[0].interventor_id]);
  
//         solicitud.forEach(solici => {
//             solici.inicio_obra = format(new Date(solici.inicio_obra), 'dd/MM/yyyy');
//             solici.fin_obra = format(new Date(solici.fin_obra), 'dd/MM/yyyy');
//         });
  
//         const pdfBuffer = await generateInformePDF({
//             solicitud: solicitud[0],
//             colaboradores,
//             contractorName: contratista[0].username,
//             interventorName: interventor[0].username,
//         });
//         fs.writeFileSync(pdfPath, pdfBuffer);
  
//         const output = fs.createWriteStream(zipPath);
//         const archive = archiver('zip', { zlib: { level: 9 } });
  
//         output.on('close', async () => {
//             const zipFileName = `sst-documents/Solicitud_${id}.zip`;
//             const zipUrl = await uploadToSpaces(zipPath, zipFileName);
//             if (zipUrl) {
//                 await connection.execute(
//                     'INSERT INTO sst_documentos (solicitud_id, url) VALUES (?, ?)',
//                     [id, zipUrl]
//                 );
//                 res.redirect(zipUrl);
//             } else {
//                 res.status(500).send('Error al subir el archivo ZIP');
//             }
//             fs.rmSync(tempDir, { recursive: true, force: true });
//         });
  
//         archive.on('error', (err) => { throw err; });
//         archive.pipe(output);
//         archive.file(pdfPath, { name: `Informe_Solicitud_${id}.pdf` });
  
//         if (solicitud[0].arl_documento) {
//             const arlPath = path.join(tempDir, `ARL_${id}${path.extname(solicitud[0].arl_documento)}`);
//             await downloadFromSpaces(solicitud[0].arl_documento, arlPath);
//             archive.file(arlPath, { name: `ARL_${id}${path.extname(solicitud[0].arl_documento)}` });
//         }
  
//         if (solicitud[0].pasocial_documento) {
//             const pasocialPath = path.join(tempDir, `Pago_Seguridad_Social_${id}${path.extname(solicitud[0].pasocial_documento)}`);
//             await downloadFromSpaces(solicitud[0].pasocial_documento, pasocialPath);
//             archive.file(pasocialPath, { name: `Pago_Seguridad_Social_${id}${path.extname(solicitud[0].pasocial_documento)}` });
//         }
        
//         archive.finalize();
//     } catch (error) {
//         console.error('[RUTA] Error al generar el archivo ZIP:', error);
//         res.status(500).send('Error al generar el archivo ZIP');
//         if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
//     }
//   };
  



// Función para generar el HTML
async function generateInformeHTML({ solicitud, colaboradores, contractorName, interventorName }) {
    try {
        // Convertir las imágenes de los colaboradores a Base64
        for (const colaborador of colaboradores) {
            colaborador.fotoBase64 = colaborador.foto ? await convertWebPtoJpeg(colaborador.foto) : null;
            colaborador.cedulaFotoBase64 = colaborador.cedulaFoto ? await convertWebPtoJpeg(colaborador.cedulaFoto) : null;
            // Generar QR para el ID del colaborador
            const qrData =   `https://gestion-ingreso-contratistas-ga.vercel.app/vista-seguridad/${colaborador.id}`; // Usar el ID del colaborador como dato del QR 
            colaborador.qrBase64 = await QRCode.toDataURL(qrData, { width: 100, margin: 1 }); // Generar QR en Base64
        }

        // Cargar la plantilla HTML
        const templatePath = path.join(__dirname, '../src/views', 'informe-template.html');
        const templateContent = fs.readFileSync(templatePath, 'utf8');
        const template = handlebars.compile(templateContent);

        // Convertir el logo a Base64
        const logoPath = path.join(__dirname, '../public', 'img', 'logo-ga.jpg');
        const logoBase64 = fs.readFileSync(logoPath, 'base64');

        // Datos para la plantilla
        const data = {
            logo: `data:image/jpeg;base64,${logoBase64}`,
            fecha: new Date().toLocaleDateString(),
            solicitud,
            colaboradores,
            contractorName,
            interventorName
        };

        // Generar el HTML
        return template(data);
    } catch (error) {
        console.error("❌ Error al generar el informe HTML:", error);
        throw error;
    }
}

// Controlador para descargar la solicitud (sin cambios relevantes aquí, solo se asegura que los datos incluyan el ID)
controller.descargarSolicitud = async (req, res) => {
    const { id } = req.params;
    const tempDir = path.join('/tmp', `solicitud_${id}`);
    const htmlPath = path.join(tempDir, `Informe_Solicitud_${id}.html`);
    const zipPath = path.join(tempDir, `Solicitud_${id}.zip`);

    try {
        const [existingDoc] = await connection.execute('SELECT * FROM sst_documentos WHERE solicitud_id = ?', [id]);
        if (existingDoc.length > 0) {
            return res.redirect(existingDoc[0].url);
        }

        fs.mkdirSync(tempDir, { recursive: true });

        const [solicitud] = await connection.execute('SELECT * FROM solicitudes WHERE id = ?', [id]);
        if (!solicitud || solicitud.length === 0) {
            return res.status(404).send('Solicitud no encontrada');
        }

        // Asegurarse de incluir el ID del colaborador en la consulta
        const [colaboradores] = await connection.execute(
            'SELECT id, cedula, nombre, foto, cedulaFoto FROM colaboradores WHERE solicitud_id = ?',
            [id]
        );
        const [contratista] = await connection.execute('SELECT username FROM users WHERE id = ?', [solicitud[0].usuario_id]);
        const [interventor] = await connection.execute('SELECT username FROM users WHERE id = ?', [solicitud[0].interventor_id]);

        solicitud.forEach(solici => {
            solici.inicio_obra = format(new Date(solici.inicio_obra), 'dd/MM/yyyy');
            solici.fin_obra = format(new Date(solici.fin_obra), 'dd/MM/yyyy');
        });

        const htmlContent = await generateInformeHTML({
            solicitud: solicitud[0],
            colaboradores,
            contractorName: contratista[0].username,
            interventorName: interventor[0].username,
        });

        fs.writeFileSync(htmlPath, htmlContent);

        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', async () => {
            const zipFileName = `sst-documents/Solicitud_${id}.zip`;
            const zipUrl = await uploadToSpaces(zipPath, zipFileName);
            if (zipUrl) {
                await connection.execute(
                    'INSERT INTO sst_documentos (solicitud_id, url) VALUES (?, ?)',
                    [id, zipUrl]
                );
                res.redirect(zipUrl);
            } else {
                res.status(500).send('Error al subir el archivo ZIP');
            }
            fs.rmSync(tempDir, { recursive: true, force: true });
        });

        archive.on('error', (err) => { throw err; });
        archive.pipe(output);
        archive.file(htmlPath, { name: `Informe_Solicitud_${id}.html` });

        if (solicitud[0].arl_documento) {
            const arlPath = path.join(tempDir, `ARL_${id}${path.extname(solicitud[0].arl_documento)}`);
            await downloadFromSpaces(solicitud[0].arl_documento, arlPath);
            archive.file(arlPath, { name: `ARL_${id}${path.extname(solicitud[0].arl_documento)}` });
        }

        if (solicitud[0].pasocial_documento) {
            const pasocialPath = path.join(tempDir, `Pago_Seguridad_Social_${id}${path.extname(solicitud[0].pasocial_documento)}`);
            await downloadFromSpaces(solicitud[0].pasocial_documento, pasocialPath);
            archive.file(pasocialPath, { name: `Pago_Seguridad_Social_${id}${path.extname(solicitud[0].pasocial_documento)}` });
        }

        archive.finalize();
    } catch (error) {
        console.error('[RUTA] Error al generar el archivo ZIP:', error);
        res.status(500).send('Error al generar el archivo ZIP');
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    }
};

 
module.exports = controller;
