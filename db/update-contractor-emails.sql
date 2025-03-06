-- Actualizar los correos electrónicos de los contratistas existentes
UPDATE users u
JOIN roles r ON u.role_id = r.id
SET u.email = CONCAT(u.username, '@grupoargos.com')
WHERE r.role_name = 'contratista' AND u.email IS NULL;

-- Verificar los correos electrónicos actualizados
SELECT u.username, u.email, r.role_name
FROM users u
JOIN roles r ON u.role_id = r.id
WHERE r.role_name = 'contratista'; 