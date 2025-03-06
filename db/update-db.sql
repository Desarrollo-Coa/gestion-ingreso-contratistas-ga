-- Agregar la columna email a la tabla users si no existe
ALTER TABLE users
ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Actualizar los registros existentes de contratistas con un email por defecto
-- (esto es temporal, los usuarios deberán actualizar su email en el sistema)
UPDATE users u
JOIN roles r ON u.role_id = r.id
SET u.email = CONCAT(u.username, '@grupoargos.com')
WHERE r.role_name = 'contratista' AND u.email IS NULL; 