const { Notification } = require('electron');

// Notificaciones nativas: avisan aunque el launcher esté minimizado o detrás
// de otras ventanas (actualización lista para instalar, juego cerrado con
// error).
function notify(title, body) {
    if (!Notification.isSupported()) return;
    new Notification({ title, body }).show();
}

module.exports = { notify };
