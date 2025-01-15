const express = require('express');
const controller = require('../controllers/interventor.controller');

const router = express.Router();

// Validar funciones necesarias del controlador
const requiredFunctions = {
  'GET /vista-interventor': 'vistaInterventor',
  'POST /aprobar-solicitud-interventor': 'aprobarSolicitud',
  'GET /generar-qr/:id': 'generarQR',
  'PUT /solicitudes/:solicitudId/detener-labor': 'detenerLabor',
  'PUT /solicitudes/:solicitudId/reanudar-labor': 'reanudarLabor',
};

// Verificar que las funciones están definidas en el controlador
Object.entries(requiredFunctions).forEach(([route, funcName]) => {
  if (typeof controller[funcName] !== 'function') {
    throw new Error(`[ERROR] La función '${funcName}' requerida para la ruta '${route}' no está definida en el controlador.`);
  }
});

// Función genérica para manejar rutas
const handleRoute = (method, path, handlerName) => {
  router[method.toLowerCase()](path, async (req, res) => {
    console.log(`[RUTAS] ${method} ${path}`);
    try {
      await controller[handlerName](req, res);
    } catch (err) {
      console.error(`[ERROR] En la ruta '${method} ${path}':`, err.message);
      res.status(500).send(`Error al procesar la solicitud en '${method} ${path}'`);
    }
  });
};

// Registrar las rutas dinámicamente
Object.entries(requiredFunctions).forEach(([route, funcName]) => {
  const [method, path] = route.split(' '); // Ejemplo: 'GET /vista-interventor' -> method='GET', path='/vista-interventor'
  handleRoute(method, path, funcName);
});

module.exports = router;
