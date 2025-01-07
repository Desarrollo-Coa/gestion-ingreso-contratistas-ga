const checkRole = (role) => {
    return (req, res, next) => {
        if (req.user && req.user.role === role) {
            next(); // Si el rol es el correcto, continuar con la siguiente función
        } else {
            return res.status(403).send('Acceso denegado: No tienes permisos suficientes');
        }
    };
};

module.exports = checkRole;
