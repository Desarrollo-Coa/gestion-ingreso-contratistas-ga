CREATE USER 'app_user'@'localhost' IDENTIFIED BY 'SecurePasswordCOA';


GRANT ALL PRIVILEGES ON system_gestor_contratista.* TO 'app_user'@'localhost';

FLUSH PRIVILEGES;



-- Crear la base de datos
CREATE DATABASE IF NOT EXISTS system_gestor_contratista;

-- Usar la base de datos
USE system_gestor_contratista;

-- Tabla de Roles
CREATE TABLE IF NOT EXISTS roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL
);

-- Insertar los roles
INSERT INTO roles (role_name)
VALUES 
    ('contratista'),
    ('sst'),
    ('interventor'),
    ('seguridad');

-- Tabla de Usuarios
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role_id INT NOT NULL,
    empresa VARCHAR(255) NOT NULL,
    nit VARCHAR(20) NOT NULL,
    email VARCHAR(255),  -- Campo para almacenar el correo electrónico
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);


-- Tabla de Solicitudes
CREATE TABLE IF NOT EXISTS solicitudes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,  -- Referencia a la tabla users
    empresa VARCHAR(255) NOT NULL,
    nit VARCHAR(20) NOT NULL,
    inicio_obra DATE NOT NULL,
    fin_obra DATE NOT NULL,
    dias_trabajo INT NOT NULL,
    arl_documento VARCHAR(255),  -- Ruta al archivo ARL
    pasocial_documento VARCHAR(255),  -- Ruta al archivo de planilla
    estado ENUM('pendiente', 'aprobada', 'negada', 'en labor', 'labor detenida' ) DEFAULT 'pendiente',
    lugar VARCHAR(255) NOT NULL,  -- Nueva columna para el lugar
    labor VARCHAR(255) NOT NULL,   -- Nueva columna para la labor
    interventor_id INT NOT NULL,   -- Nueva columna para la labor
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (interventor_id) REFERENCES users(id) ON DELETE CASCADE
); 

-- Tabla de Colaboradores
CREATE TABLE IF NOT EXISTS colaboradores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    solicitud_id INT NOT NULL,  -- Referencia a la tabla solicitudes
    cedula VARCHAR(20) NOT NULL, -- Numero de la cedula,
    nombre VARCHAR(255) NOT NULL,
    foto VARCHAR(255),  -- Ruta a la fotografia de la cara del colaborador
    cedulaFoto VARCHAR(255),  -- Ruta de la foto de la cedula del colaborador
    FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS acciones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    solicitud_id INT NOT NULL,  -- Referencia a la tabla solicitudes
    usuario_id INT NOT NULL,  -- Referencia a la tabla users
    accion ENUM('aprobada', 'pendiente', 'negada') DEFAULT 'pendiente',
    comentario TEXT,  -- Comentarios adicionales sobre la acción tomada
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS lugares (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre_lugar VARCHAR(255) UNIQUE NOT NULL  -- Asegúrate que los nombres sean únicos
);

-- Inserta algunos lugares de ejemplo
INSERT INTO lugares (nombre_lugar) VALUES
('Mallorquin'),
('Santa Isabel'),
('Miramar'), 
('Coa'),
('Arroyo Leon'),
('Nisperales'),
('Lagos Del Cacique'),  
('Pavas'),
('Pajonal'),
('Jesuita'),
('Insignares'),
('Becerril'),
('Morro');


CREATE TABLE IF NOT EXISTS sst_documentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    solicitud_id INT NOT NULL,  -- Referencia a la tabla solicitudes
    url VARCHAR(255) NOT NULL,  -- Ruta del archivo
    fecha_de_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Fecha en que se subió el archivo
    FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS registros (
    id INT AUTO_INCREMENT PRIMARY KEY,
    colaborador_id INT NOT NULL,
    solicitud_id INT NOT NULL,
    usuario_id INT NOT NULL,  -- Usuario que realizó el registro
    tipo ENUM('entrada', 'salida') NOT NULL,  -- Indica si es entrada o salida
    fecha_hora DATETIME NOT NULL,            -- Fecha y hora proporcionada en la solicitud
    estado_actual VARCHAR(50) NOT NULL,      -- Estado de la solicitud en el momento del registro
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Hora exacta en que se registró el ingreso/salida
    FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE,
    FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE CASCADE  -- Relación con la tabla users
);