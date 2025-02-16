const express = require('express');
const multer = require('multer');
const path = require('path'); 
const router = express.Router();
const controller = require('../controllers/contratista.controller');
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || 'secreto';
const connection = require('../db/db'); // Database connection
require('dotenv').config();  // Cargar variables de entorno desde el archivo .env

// const { createClient } = require('@supabase/supabase-js');

// const supabaseUrl = process.env.SUPABASE_URL;
// const supabaseKey = process.env.SUPABASE_KEY;

const AWS = require('aws-sdk');

const spacesEndpoint = new AWS.Endpoint(process.env.DO_SPACES_ENDPOINT);
const s3 = new AWS.S3({
    endpoint: spacesEndpoint,
    accessKeyId: process.env.DO_SPACES_KEY,
    secretAccessKey: process.env.DO_SPACES_SECRET,
});

// const supabase = createClient(supabaseUrl, supabaseKey);



// Configuración de almacenamiento de Multer en memoria
const storage = multer.memoryStorage();

const upload = multer({
    storage: storage,
    limits: { 
        fileSize: 100 * 1024 * 1024 // Limitar el tamaño de los archivos a 100MB
    }
});

// Función para generar un nombre único para cada archivo
function generateUniqueFilename(originalname) {
    const timestamp = Date.now(); // Usamos la fecha actual como base para generar un nombre único
    const extension = path.extname(originalname); // Obtenemos la extensión original del archivo
    return `${timestamp}${extension}`; // Creamos un nombre único con la extensión original
}

// // Función para subir archivos a SFTP desde el buffer (memoria)
// async function uploadToSFTP(buffer, remotePath) {
//     const sftp = new SFTPClient();
//     try {
//         await sftp.connect({
//             host: process.env.SFTP_HOST,         // Usamos la variable SFTP_HOST
//             port: process.env.SFTP_PORT,         // Usamos la variable SFTP_PORT
//             username: process.env.SFTP_USERNAME, // Usamos la variable SFTP_USERNAME
//             password: process.env.SFTP_PASSWORD  // Usamos la variable SFTP_PASSWORD
//         });

//         // Subir el archivo usando el buffer en memoria
//         await sftp.put(buffer, remotePath);
//         console.log('Archivo subido exitosamente:', remotePath);
//     } catch (err) {
//         console.error('Error al subir archivo:', err);
//     } finally {
//         await sftp.end();
//     }
// }
async function uploadToSpaces(buffer, filename) {
    const params = {
        Bucket: process.env.DO_SPACES_BUCKET, // Nombre del bucket en DigitalOcean Spaces
        Key: filename, // Nombre del archivo en el bucket
        Body: buffer, // Contenido del archivo
        ACL: 'public-read', // Permisos del archivo (opcional)
    };

    try {
        const data = await s3.upload(params).promise();
        console.log('Archivo subido exitosamente a DigitalOcean Spaces:', data.Location);
        return data.Location; // Retorna la URL del archivo en DigitalOcean Spaces
    } catch (err) {
        console.error('Error al subir archivo a DigitalOcean Spaces:', err);
        throw err;
    }
}

// async function uploadToSupabase(buffer, filename) {
//     try {
//         const { data, error } = await supabase
//             .storage
//             .from('uploads') // Nombre del bucket
//             .upload(`${filename}`, buffer, {
//                 cacheControl: '3600',
//                 upsert: false,
//             });

//         if (error) {
//             console.error('Error al subir a Supabase:', error);
//             throw error;
//         }

//         console.log('Archivo subido exitosamente a Supabase:', data.path);
//         return data.path; // Retorna la ruta del archivo en Supabase
//     } catch (err) {
//         console.error('Error al subir archivo a Supabase:', err);
//         throw err;
//     }
// }



// router.post('/generar-solicitud', upload.fields([
//     { name: 'arl', maxCount: 1 },
//     { name: 'pasocial', maxCount: 1 },
//     { name: 'foto[]', maxCount: 25 },
//     { name: 'cedulaFoto[]', maxCount: 25 }
// ]), async (err, req, res, next) => {
//     if (err) {
//         console.error('Error al subir los archivos:', err);
//         return res.status(400).send('Error al subir los archivos');
//     }
//     next();
// }, async (req, res) => {
//     console.log('Body:', req.body);
//     console.log('Files:', req.files);

//     // Procesar archivos y enviarlos al servidor remoto
//     const uploadedFiles = req.files;
//     const fileNames = {
//         foto: [],
//         cedulaFoto: [],
//         arl: null,
//         pasocial: null
//     };

//     // Uso de SGTP: 

//     // for (const fileKey in uploadedFiles) {
//     //     const files = uploadedFiles[fileKey];
//     //     for (const file of files) {
//     //         // Generar un nombre único para cada archivo
//     //         const uniqueFilename = generateUniqueFilename(file.originalname);

//     //         // Ruta remota en el servidor SFTP
//     //         const remoteFilePath = `/home/administrator/gestion-ingreso-contratistas-ga/uploads/${uniqueFilename}`;

//     //         // Subir el archivo a SFTP con el nombre único
//     //         await uploadToSFTP(file.buffer, remoteFilePath);

//     //         // Guardar los nombres de los archivos para ser utilizados en la base de datos
//     //         if (fileKey === 'foto[]') {
//     //             fileNames.foto.push(uniqueFilename);
//     //         } else if (fileKey === 'cedulaFoto[]') {
//     //             fileNames.cedulaFoto.push(uniqueFilename);
//     //         } else if (fileKey === 'arl') {
//     //             fileNames.arl = uniqueFilename;  // Guardar solo el nombre del archivo ARL
//     //         } else if (fileKey === 'pasocial') {
//     //             fileNames.pasocial = uniqueFilename;  // Guardar solo el nombre del archivo pasocial
//     //         }
//     //     }
//     // }


//     // Uso de SUPABASE:

//     for (const fileKey in uploadedFiles) {
//         const files = uploadedFiles[fileKey];
//         for (const file of files) {
//             const uniqueFilename = generateUniqueFilename(file.originalname);
    
//             // Sube el archivo a Supabase
//             const remoteFilePath = await uploadToSupabase(file.buffer, uniqueFilename);
    
//             // Guarda la ruta en la base de datos
//             if (fileKey === 'foto[]') {
//                 fileNames.foto.push(remoteFilePath);
//             } else if (fileKey === 'cedulaFoto[]') {
//                 fileNames.cedulaFoto.push(remoteFilePath);
//             } else if (fileKey === 'arl') {
//                 fileNames.arl = remoteFilePath;
//             } else if (fileKey === 'pasocial') {
//                 fileNames.pasocial = remoteFilePath;
//             }
//         }
//     }
    

//     // Aquí aseguramos que los datos del formulario estén completos
//     const { empresa, nit, lugar, labor, interventor_id, cedula, nombre, inicio_obra, fin_obra, dias_trabajo } = req.body;

//     // Lógica para crear la solicitud en la base de datos
//     const token = req.cookies.token;
//     if (!token) {
//         console.log('[CONTROLADOR] No se encontró el token, redirigiendo a login');
//         return res.status(401).send('No se encontró el token');
//     }

//     try {
//         // Decodificar el token
//         const decoded = jwt.verify(token, SECRET_KEY);
//         const { id } = decoded;

//         if (!id) {
//             console.log('[CONTROLADOR] El token no contiene un id válido');
//             return res.status(400).send('Token inválido');
//         }

//         console.log('[CONTROLADOR] Usuario ID:', id);

//         // Crear la solicitud en la base de datos, incluyendo solo los nombres de los archivos ARL y pasocial
//         const query = `
//             INSERT INTO solicitudes (usuario_id, empresa, nit, inicio_obra, fin_obra, dias_trabajo, lugar, labor, interventor_id, arl_documento, pasocial_documento)
//             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
//         `;
//         const [result] = await connection.execute(query, [
//             id, empresa, nit, inicio_obra, fin_obra, dias_trabajo, lugar, labor, interventor_id,
//             fileNames.arl || null, // Solo el nombre del archivo ARL
//             fileNames.pasocial || null // Solo el nombre del archivo pasocial
//         ]);

//         console.log('[CONTROLADOR] Solicitud creada con éxito', result);

//         // Aquí asociamos los colaboradores con la solicitud
//         for (let i = 0; i < cedula.length; i++) {
//             const cedulaColab = cedula[i];
//             const nombreColab = nombre[i];
//             const fotoColab = fileNames.foto[i] || null;
//             const cedulaFotoColab = fileNames.cedulaFoto[i] || null;

//             const queryColaborador = `
//                 INSERT INTO colaboradores (solicitud_id, cedula, nombre, foto, cedulaFoto)
//                 VALUES (?, ?, ?, ?, ?);
//             `;

//             await connection.execute(queryColaborador, [
//                 result.insertId, cedulaColab, nombreColab, fotoColab, cedulaFotoColab
//             ]);
//         }

//         res.status(200).send('Solicitud creada correctamente');
//     } catch (error) {
//         console.error('[CONTROLADOR] Error al crear la solicitud:', error);
//         res.status(500).send('Error al crear la solicitud');
//     }
// });

router.post('/generar-solicitud', upload.fields([
    { name: 'arl', maxCount: 1 },
    { name: 'pasocial', maxCount: 1 },
    { name: 'foto[]', maxCount: 25 },
    { name: 'cedulaFoto[]', maxCount: 25 }
]), async (err, req, res, next) => {
    if (err) {
        console.error('Error al subir los archivos:', err);
        return res.status(400).send('Error al subir los archivos');
    }
    next();
}, async (req, res) => {
    console.log('Body:', req.body);
    console.log('Files:', req.files);

    const uploadedFiles = req.files;
    const fileNames = {
        foto: [],
        cedulaFoto: [],
        arl: null,
        pasocial: null
    };

    for (const fileKey in uploadedFiles) {
        const files = uploadedFiles[fileKey];
        for (const file of files) {
            const uniqueFilename = generateUniqueFilename(file.originalname);

            // Sube el archivo a DigitalOcean Spaces
            const remoteFilePath = await uploadToSpaces(file.buffer, uniqueFilename);

            // Guarda la ruta en la base de datos
            if (fileKey === 'foto[]') {
                fileNames.foto.push(remoteFilePath);
            } else if (fileKey === 'cedulaFoto[]') {
                fileNames.cedulaFoto.push(remoteFilePath);
            } else if (fileKey === 'arl') {
                fileNames.arl = remoteFilePath;
            } else if (fileKey === 'pasocial') {
                fileNames.pasocial = remoteFilePath;
            }
        }
    }


    // Aquí aseguramos que los datos del formulario estén completos
    const { empresa, nit, lugar, labor, interventor_id, cedula, nombre, inicio_obra, fin_obra, dias_trabajo } = req.body;

    // Lógica para crear la solicitud en la base de datos
    const token = req.cookies.token;
    if (!token) {
        console.log('[CONTROLADOR] No se encontró el token, redirigiendo a login');
        return res.status(401).send('No se encontró el token');
    }

    try {
        // Decodificar el token
        const decoded = jwt.verify(token, SECRET_KEY);
        const { id } = decoded;

        if (!id) {
            console.log('[CONTROLADOR] El token no contiene un id válido');
            return res.status(400).send('Token inválido');
        }

        console.log('[CONTROLADOR] Usuario ID:', id);

        // Crear la solicitud en la base de datos, incluyendo solo los nombres de los archivos ARL y pasocial
        const query = `
            INSERT INTO solicitudes (usuario_id, empresa, nit, inicio_obra, fin_obra, dias_trabajo, lugar, labor, interventor_id, arl_documento, pasocial_documento)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `;
        const [result] = await connection.execute(query, [
            id, empresa, nit, inicio_obra, fin_obra, dias_trabajo, lugar, labor, interventor_id,
            fileNames.arl || null, // Solo el nombre del archivo ARL
            fileNames.pasocial || null // Solo el nombre del archivo pasocial
        ]);

        console.log('[CONTROLADOR] Solicitud creada con éxito', result);

        // Aquí asociamos los colaboradores con la solicitud
        for (let i = 0; i < cedula.length; i++) {
            const cedulaColab = cedula[i];
            const nombreColab = nombre[i];
            const fotoColab = fileNames.foto[i] || null;
            const cedulaFotoColab = fileNames.cedulaFoto[i] || null;

            const queryColaborador = `
                INSERT INTO colaboradores (solicitud_id, cedula, nombre, foto, cedulaFoto)
                VALUES (?, ?, ?, ?, ?);
            `;

            await connection.execute(queryColaborador, [
                result.insertId, cedulaColab, nombreColab, fotoColab, cedulaFotoColab
            ]);
        }

        res.status(200).send('Solicitud creada correctamente');
    } catch (error) {
        console.error('[CONTROLADOR] Error al crear la solicitud:', error);
        res.status(500).send('Error al crear la solicitud');
    } 
});


// Resto de las rutas
router.get('/vista-contratista', (req, res) => {
    console.log('[RUTA] Se accede a la vista del contratista');
    controller.vistaContratista(req, res);
});
 

module.exports = router;
