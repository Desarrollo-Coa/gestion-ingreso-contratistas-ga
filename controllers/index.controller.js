const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const connection = require('../db/db');  // Conexión a la base de datos (ya manejada como una promesa)
const SECRET_KEY = process.env.JWT_SECRET || 'secreto';  // Asegúrate de tener esta variable de entorno configurada
const controllers = {};

// Controlador para la página principal
controllers.index = (req, res) => {
    res.render('index', { title: 'Inicio' });
};

// Controlador para la ruta de login
controllers.loginRoute = (req, res) => {
    res.render('login', { title: 'Iniciar Sesión' });
};


 // Controlador para el login
controllers.login = async (req, res) => {
    const { username, password } = req.body;

    console.log('Iniciando sesión para el usuario:', username); // Depuración: usuario recibido

    // Validar que ambos campos estén completos
    if (!username || !password) {
        console.log('Error: Usuario o contraseña vacíos'); // Depuración: falta algún campo
        return res.render('login', {
            title: 'Iniciar Sesión',
            error: 'Por favor, complete ambos campos.',
        });
    }

    try {
        // Buscar el usuario en la base de datos de manera asincrónica
        console.log('Buscando usuario en la base de datos...'); // Depuración: inicio de la búsqueda en la DB
        const [results] = await connection.execute('SELECT * FROM users WHERE username = ?', [username]);

        if (results.length === 0) {
            console.log('Error: Usuario no encontrado'); // Depuración: usuario no encontrado
            return res.render('login', {
                title: 'Iniciar Sesión',
                error: 'Usuario o contraseña incorrectos.',
            });
        }

        const user = results[0];
        console.log('Usuario encontrado:'); // Depuración: usuario encontrado

        // Verificar la contraseña de forma asincrónica
        console.log('Verificando la contraseña...'); // Depuración: inicio de verificación de contraseña
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            console.log('Error: Contraseña incorrecta'); // Depuración: contraseña incorrecta
            return res.render('login', {
                title: 'Iniciar Sesión',
                error: 'Usuario o contraseña incorrectos.',
            });
        }

        console.log('Contraseña verificada correctamente'); // Depuración: contraseña verificada

        // Mapear el role_id a un nombre de rol
        const roleMapping = {
            1: 'contratista',
            2: 'sst',
            3: 'interventor',
            4: 'seguridad'
        };

        const roleName = roleMapping[user.role_id]; // Usar el nombre del rol en lugar del role_id

        console.log('Nombre del rol:', roleName); // Depuración: nombre del rol

        if (!roleName) {
            console.log('Error: Rol no reconocido'); // Depuración: rol no reconocido
            return res.render('login', {
                title: 'Iniciar Sesión',
                error: 'Rol no reconocido.',
            });
        }

        // Crear el JWT de manera asincrónica
        console.log('Generando token JWT...'); // Depuración: generación de token
        const token = jwt.sign(
            { id: user.id, username: user.username, role: roleName }, // Usar el nombre del rol
            SECRET_KEY,
            { expiresIn: '24h' }  // El token expirará en 24 horas
        );

        // Guardar el token en una cookie segura
        console.log('Guardando el token en la cookie'); // Depuración: guardado del token
        res.cookie('token', token, {
            httpOnly: true, // Solo accesible desde el servidor
            secure: process.env.NODE_ENV === 'production', // Solo en HTTPS en producción
            maxAge: 86400000, // 24 horas en milisegundos (24 * 60 * 60 * 1000)
        });

        console.log('Token guardado con éxito. Redirigiendo según el rol...'); // Depuración: token guardado

        // Renderizar la vista correspondiente según el rol
        switch (roleName) {
            case 'contratista':
                console.log('Redirigiendo a la vista de contratista'); // Depuración: redirección a contratista
                return res.redirect('/vista-contratista');
            case 'sst':
                console.log('Redirigiendo a la vista de SST'); // Depuración: redirección a SST
                return res.redirect('/vista-sst');
            case 'interventor':
                console.log('Redirigiendo a la vista de interventor'); // Depuración: redirección a interventor
                return res.redirect('/vista-interventor');
            case 'seguridad':
                console.log('Redirigiendo a la vista de seguridad'); // Depuración: redirección a seguridad
                return res.redirect('/vista-seguridad');
            default:
                console.log('Error desconocido al asignar el rol'); // Depuración: error desconocido
                return res.render('login', {
                    title: 'Iniciar Sesión',
                    error: 'Error desconocido al asignar el rol.',
                });
        }
        
    } catch (err) {
        console.error('Error al realizar el login:', err); // Depuración: error en el servidor
        res.status(500).send('Error en el servidor');
    }
};


// Controlador para el logout
controllers.logout = (req, res) => {
    res.clearCookie('token');  // Eliminar la cookie del token
    res.redirect('/login');    // Redirigir al login
};

// Controlador para manejar errores personalizados (opcional)
controllers.notFound = (req, res) => {
    res.status(404).render('404', { title: 'Página no encontrada' });
};

module.exports = controllers;