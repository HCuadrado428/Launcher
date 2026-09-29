// msmc se carga de forma "segura": si el usuario todavía no ha hecho
// `npm install`, no queremos que la app entera crashee al arrancar, solo que
// el login con Microsoft (y la renovación de sesión) avise del problema.
let Auth = null;
try {
    ({ Auth } = require('msmc'));
} catch (err) {
    console.warn('[WARN] msmc no está instalado. Ejecuta "npm install" para poder usar el login con Microsoft.');
}

module.exports = { Auth };
