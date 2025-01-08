const express = require('express');
const multer = require('multer');
const path = require('path');
const { createClient } = require('@supabase/supabase-js'); // Importa el cliente de Supabase
const controller = require('../controllers/contratista.controller');
const router = express.Router();

// Configuración de Supabase
const supabaseUrl = process.env.SUPABASE_URL;  // Usa las variables de entorno para la URL de Supabase
const supabaseKey = process.env.SUPABASE_KEY;  // Usa las variables de entorno para la clave de Supabase
const supabase = createClient(supabaseUrl, supabaseKey);  // Crea el cliente de Supabase

// Configuración de multer para manejar los archivos
const storage = multer.memoryStorage(); // Usamos memoryStorage para obtener los archivos en memoria

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // Limitar el tamaño de los archivos a 100MB
    }
});

// Función para subir archivos a Supabase
const uploadToSupabase = async (file, bucketName, fileName) => {
    const { error } = await supabase.storage
        .from(bucketName)
        .upload(fileName, file.buffer, { upsert: true });

    if (error) {
        console.error('Error al subir archivo:', error);
        throw new Error('Error al subir archivo');
    }
    console.log('Archivo subido exitosamente a Supabase:', fileName);
    return fileName;
};

// Ruta para la vista del contratista
router.get('/vista-contratista', (req, res) => {
    console.log('[RUTA] Se accede a la vista del contratista');
    controller.vistaContratista(req, res);
});

// Ruta para generar la solicitud y subir archivos
router.post('/generar-solicitud', upload.fields([
    { name: 'arl', maxCount: 1 },
    { name: 'pasocial', maxCount: 1 },
    { name: 'foto[]', maxCount: 25 },  // Aceptar hasta 25 fotos
    { name: 'cedulaFoto[]', maxCount: 25 } // Aceptar hasta 25 cédulas
]), async (err, req, res, next) => {
    if (err) {
        console.error('Error al subir los archivos:', err);
        return res.status(400).send('Error al subir los archivos');
    }
    next();
}, async (req, res) => {
    console.log('Body:', req.body);  // Muestra los campos del formulario
    console.log('Files:', req.files); // Muestra los archivos enviados

    try {
        const uploadedFiles = [];

        // Subir ARL
        if (req.files['arl']) {
            const arlFile = req.files['arl'][0];
            const arlFileName = `arl_${Date.now()}${path.extname(arlFile.originalname)}`;
            await uploadToSupabase(arlFile, 'uploads', arlFileName);
            uploadedFiles.push({ name: arlFileName, type: 'arl' });
        }

        // Subir Planilla Social
        if (req.files['pasocial']) {
            const pasocialFile = req.files['pasocial'][0];
            const pasocialFileName = `pasocial_${Date.now()}${path.extname(pasocialFile.originalname)}`;
            await uploadToSupabase(pasocialFile, 'uploads', pasocialFileName);
            uploadedFiles.push({ name: pasocialFileName, type: 'pasocial' });
        }

        // Subir fotos
        if (req.files['foto[]']) {
            for (const file of req.files['foto[]']) {
                const fileName = `foto_${Date.now()}${path.extname(file.originalname)}`;
                await uploadToSupabase(file, 'uploads', fileName);
                uploadedFiles.push({ name: fileName, type: 'foto' });
            }
        }

        // Subir cédulas de foto
        if (req.files['cedulaFoto[]']) {
            for (const file of req.files['cedulaFoto[]']) {
                const fileName = `cedula_${Date.now()}${path.extname(file.originalname)}`;
                await uploadToSupabase(file, 'uploads', fileName);
                uploadedFiles.push({ name: fileName, type: 'cedulaFoto' });
            }
        }

        // Guardar la solicitud en la base de datos (puedes pasar también los archivos subidos)
        controller.crearSolicitud(req, res, uploadedFiles); // Pasa los archivos subidos al controlador si es necesario

        return res.status(200).json({ message: 'Archivos subidos correctamente', uploadedFiles });
    } catch (error) {
        console.error('Error al subir archivos a Supabase:', error);
        return res.status(500).send('Error al subir archivos a Supabase');
    }
});

// Ruta para detener la labor de una solicitud
router.put('/solicitudes/:solicitudId/detener-labor', (req, res) => {
    console.log('[RUTA] Detener labor para la solicitud con ID:', req.params.solicitudId);
    controller.detenerLabor(req, res);  // Llama al controlador para detener la labor
});

module.exports = router;
