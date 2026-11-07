const { app } = require('electron');
const path = require('path');
const { assertSafePathSegment } = require('./utils');

const INSTANCES_DIR = path.join(app.getPath('appData'), '.milauncher', 'instances');
const VANILLA_ROOT = path.join(app.getPath('appData'), '.milauncher');
// Crash logs del juego y launcher.log (ver logFile.js).
const LOGS_DIR = path.join(app.getPath('userData'), 'crash-logs');

// modpackId viene del servidor (vía renderer) y todo lo que cuelga de esta
// carpeta se borra al reparar/abandonar un modpack: un id como ".." apuntaría
// fuera de INSTANCES_DIR.
function instanceDir(modpackId) {
    return path.join(INSTANCES_DIR, assertSafePathSegment(modpackId, 'Id de modpack'));
}
function instanceModsDir(modpackId) {
    return path.join(instanceDir(modpackId), 'mods');
}
function instanceResourcePacksDir(modpackId) {
    return path.join(instanceDir(modpackId), 'resourcepacks');
}
function instanceDirForModType(modpackId, mod) {
    return mod.type === 'resourcepack' ? instanceResourcePacksDir(modpackId) : instanceModsDir(modpackId);
}
// Ruta en disco de un mod/resource pack del manifiesto. El nombre de archivo
// lo decide el servidor, así que se valida antes de escribir o borrar nada.
function instanceModFilePath(modpackId, mod) {
    return path.join(instanceDirForModType(modpackId, mod), assertSafePathSegment(mod.filename, 'Nombre de archivo del mod'));
}
function instanceMetaPath(modpackId) {
    return path.join(instanceDir(modpackId), '.launcher-meta.json');
}

module.exports = {
    INSTANCES_DIR,
    VANILLA_ROOT,
    LOGS_DIR,
    instanceDir,
    instanceModsDir,
    instanceResourcePacksDir,
    instanceDirForModType,
    instanceModFilePath,
    instanceMetaPath
};
