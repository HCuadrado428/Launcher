const { app } = require('electron');
const path = require('path');

const INSTANCES_DIR = path.join(app.getPath('appData'), '.milauncher', 'instances');
const VANILLA_ROOT = path.join(app.getPath('appData'), '.milauncher');

function instanceDir(modpackId) {
    return path.join(INSTANCES_DIR, modpackId);
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
function instanceMetaPath(modpackId) {
    return path.join(instanceDir(modpackId), '.launcher-meta.json');
}

module.exports = {
    INSTANCES_DIR,
    VANILLA_ROOT,
    instanceDir,
    instanceModsDir,
    instanceResourcePacksDir,
    instanceDirForModType,
    instanceMetaPath
};
