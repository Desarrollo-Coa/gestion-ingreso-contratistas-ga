const bcrypt = require('bcrypt');
const connection = require('../db/db');  // Usando mysql2/promise
const controller = {};
require('dotenv').config();

 

// Leer la variable de entorno REGISTRO_ROLES
const registroRoles = process.env.REGISTRO_HABILITAR_SI_NO;

// Controlador para el formulario de registro
controller.registerForm = async (req, res) => {
    try {
        let roles = [];

        // Verificar el valor de REGISTRO_ROLES y realizar la consulta correspondiente
        if (registroRoles === "SI") {
            // Si REGISTRO_ROLES es SI, obtienes todos los roles
            const [allRoles] = await connection.query('SELECT id, role_name FROM roles');
            roles = allRoles;
        } else if (registroRoles === "NO") {
            // Si REGISTRO_ROLES es NO, solo obtienes el rol "contratista"
            const [contratistaRole] = await connection.query('SELECT id, role_name FROM roles WHERE role_name = "contratista"');
            roles = contratistaRole;
        }

        console.log('Roles obtenidos:', roles); // Verifica si los roles se obtienen correctamente

        // Verificar que el objeto roles esté bien definido antes de renderizar
        if (!roles || roles.length === 0) {
            return res.status(500).send('No se encontraron roles');
        }

        // Renderizar la plantilla y pasar los roles obtenidos
        res.render('register', { 
            title: 'Regístrate', 
            roles, // Pasar los roles a la plantilla
            error: null 
        });
    } catch (err) {
        console.error('Error al obtener los roles:', err);
        res.status(500).send('Error en la base de datos');
    }
};

controller.register = async (req, res) => {
    const { username, password, role, empresa, nit } = req.body;
    console.log('Formulario recibido:', { username, password, role, empresa, nit }); // Depuración de los valores recibidos

    try {
        // Verificar si el usuario ya existe en la base de datos
        const [existingUsers] = await connection.query('SELECT * FROM users WHERE username = ?', [username]);

        if (existingUsers.length > 0) {
            // Consultar los roles nuevamente si hay un error
            const [roles] = await connection.query('SELECT id, role_name FROM roles');
            return res.render('register', { 
                title: 'Regístrate', 
                roles,  // Pasar los roles nuevamente en caso de error
                error: 'El usuario ya existe' 
            });
        }

        // Validar que los campos necesarios no estén vacíos
        if (!username || !password || !role || !empresa || !nit) {
            // Consultar los roles nuevamente si hay un error
            const [roles] = await connection.query('SELECT id, role_name FROM roles');
            return res.render('register', { 
                title: 'Regístrate', 
                roles,  // Pasar los roles nuevamente en caso de error
                error: 'Usuario, contraseña, rol, empresa y NIT son obligatorios' 
            });
        }

        // Asegurémonos de que el rol recibido es un ID, no un nombre
        // Aquí se espera que 'role' sea un ID, no un nombre
        const [roleResults] = await connection.query('SELECT id FROM roles WHERE id = ?', [role]);

        if (roleResults.length === 0) {
            console.log(`Rol no válido: ${role}`); // Depuración: imprimir el valor del rol recibido
            // Consultar los roles nuevamente si hay un error
            const [roles] = await connection.query('SELECT id, role_name FROM roles');
            return res.render('register', { 
                title: 'Regístrate', 
                roles,  // Pasar los roles nuevamente en caso de error
                error: 'Rol no válido' 
            });
        }

        const roleId = roleResults[0].id; // ID del rol seleccionado
        console.log(`ID del rol seleccionado: ${roleId}`); // Depuración

        // Crear un nuevo usuario con la contraseña hasheada
        const hashedPassword = bcrypt.hashSync(password, 10);

        // Insertar el nuevo usuario en la base de datos
        const result = await connection.query('INSERT INTO users (username, password, role_id, empresa, nit) VALUES (?, ?, ?, ?, ?)', [
            username,
            hashedPassword,
            roleId,
            empresa,
            nit
        ]);

        res.redirect('/login');
    } catch (err) {
        console.error('Error al registrar el usuario:', err);
        res.status(500).send('Error al registrar el usuario');
    }
};





module.exports = controller;
