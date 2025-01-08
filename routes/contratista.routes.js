const express = require('express');
const multer = require('multer');
const path = require('path');
const { Client } = require('ssh2');  // Importa ssh2 para la transferencia de archivos
const controller = require('../controllers/contratista.controller');
const router = express.Router();

// Multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Directorio donde se guardarán los archivos temporalmente en Vercel
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Nombre único basado en la fecha
    }
});

// Configuración de multer para permitir archivos grandes
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // Limitar el tamaño de los archivos a 100MB (ajusta este valor según lo que necesites)
    }
});

// Función para subir archivos al servidor Linux usando SFTP
const uploadToServerLinux = (localFilePath, remoteFilePath) => {
    const sshClient = new Client();
    return new Promise((resolve, reject) => {
        sshClient.on('ready', () => {
            sshClient.sftp((err, sftp) => {
                if (err) reject(err);

                sftp.fastPut(localFilePath, remoteFilePath, {}, (err) => {
                    if (err) reject(err);
                    console.log('Archivo subido correctamente');
                    sshClient.end();
                    resolve();
                });
            });
        }).connect({
            host: process.env.SSH_HOST,  // Usando la variable de entorno para la dirección IP del servidor Linux
            port: process.env.SSH_PORT,  // Usando la variable de entorno para el puerto SSH
            username: process.env.SSH_USER,  // Usando la variable de entorno para el usuario
            password: process.env.SSH_PASSWORD  // Usando la variable de entorno para la contraseña
        });
    });
};

// Route for contractor view
router.get('/vista-contratista', (req, res) => {
    console.log('[RUTA] Se accede a la vista del contratista');
    controller.vistaContratista(req, res);
});

// Ruta para manejar la creación de la solicitud y subir archivos
router.post('/generar-solicitud', upload.fields([
    { name: 'arl', maxCount: 1 },
    { name: 'pasocial', maxCount: 1 },
    { name: 'foto[]', maxCount: 25 }, // Aceptar hasta 25 fotos
    { name: 'cedulaFoto[]', maxCount: 25 } // Aceptar hasta 25 cédulas
]), (err, req, res, next) => {
    if (err) {
        console.error('Error al subir los archivos:', err);
        return res.status(400).send('Error al subir los archivos');
    }
    next();
}, async (req, res) => {
    console.log('Body:', req.body);  // Muestra los campos del formulario
    console.log('Files:', req.files); // Muestra los archivos enviados

    // Aquí subimos los archivos a tu servidor Linux usando SFTP
    try {
        if (req.files) {
            // Subir ARL y Planilla Social
            if (req.files['arl']) {
                const arlFile = req.files['arl'][0]; // Archivo ARL
                await uploadToServerLinux(path.join(__dirname, 'uploads', arlFile.filename), `/home/administrator/storage/uploads/${arlFile.filename}`);
            }
            if (req.files['pasocial']) {
                const pasocialFile = req.files['pasocial'][0]; // Archivo Planilla Social
                await uploadToServerLinux(path.join(__dirname, 'uploads', pasocialFile.filename), `/home/administrator/storage/uploads/${pasocialFile.filename}`);
            }

            // Subir fotos y cédulas de colaboradores
            if (req.files['foto[]']) {
                for (const file of req.files['foto[]']) {
                    await uploadToServerLinux(path.join(__dirname, 'uploads', file.filename), `/home/administrator/storage/uploads/${file.filename}`);
                }
            }
            if (req.files['cedulaFoto[]']) {
                for (const file of req.files['cedulaFoto[]']) {
                    await uploadToServerLinux(path.join(__dirname, 'uploads', file.filename), `/home/administrator/storage/uploads/${file.filename}`);
                }
            }
        }

        // Ahora creamos la solicitud en la base de datos
        controller.crearSolicitud(req, res);  // Llama al controlador para crear la solicitud

    } catch (error) {
        console.error('Error al subir archivos al servidor Linux:', error);
        return res.status(500).send('Error al subir archivos al servidor Linux');
    }
});

// Ruta para detener la labor de una solicitud
router.put('/solicitudes/:solicitudId/detener-labor', (req, res) => {
    console.log('[RUTA] Detener labor para la solicitud con ID:', req.params.solicitudId);
    controller.detenerLabor(req, res);  // Llama al controlador para detener la labor
});

module.exports = router;
