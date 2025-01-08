const express = require('express');
const multer = require('multer');
const path = require('path');
const controller = require('../controllers/contratista.controller');
const router = express.Router();

// Multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Directorio donde se guardarán los archivos
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Nombre único basado en la fecha
    }
});

// Configuración de multer para permitir archivos grandes
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // Limitar el tamaño de los archivos a 100MB
    }
});

// Ruta para subir los archivos del contratista
router.post('/subirArchivosContratista', upload.fields([
    { name: 'arl', maxCount: 1 },
    { name: 'pasocial', maxCount: 1 },
    { name: 'foto[]', maxCount: 25 },
    { name: 'cedulaFoto[]', maxCount: 25 }
]), (err, req, res, next) => {
    if (err) {
        console.error('Error al subir los archivos:', err);
        return res.status(400).send('Error al subir los archivos');
    }
    console.log('Archivos subidos correctamente');
    return res.status(200).send('Archivos subidos correctamente');
});

// Ruta para generar la solicitud
router.post('/generar-solicitud', (req, res) => {
    console.log('Datos recibidos en generar-solicitud:', req.body);
    controller.crearSolicitud(req, res);
});

// Ruta para detener la labor de una solicitud
router.put('/solicitudes/:solicitudId/detener-labor', (req, res) => {
    console.log('[RUTA] Detener labor para la solicitud con ID:', req.params.solicitudId);
    controller.detenerLabor(req, res);  // Llama al controlador para detener la labor
});

 
// Route for contractor view
router.get('/vista-contratista', (req, res) => {
    console.log('[RUTA] Se accede a la vista del contratista');
    controller.vistaContratista(req, res);
});
  
module.exports = router;
