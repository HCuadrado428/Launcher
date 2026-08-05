const fs = require('fs');
const path = require('path');
const { VANILLA_ROOT } = require('./paths');

// Los assets (texturas, sonidos, idiomas...) y las librerías de Minecraft
// son EXACTAMENTE los mismos archivos para cualquier modpack (o el propio
// modo vanilla) que use la misma versión — no dependen del modpack ni del
// jugador, a diferencia de mods/resourcepacks/config/saves. Sin esto, cada
// modpack (y cada "Reparar instalación" de un mismo modpack) volvía a
// descargar los mismos miles de archivos pequeños que ya tenía descargados
// otro modpack o el propio modo vanilla, que es lo que hacía que la primera
// sincronización pudiera tardar varios minutos.
//
// En vez de copiarlos, se ENLAZAN (junction de NTFS: no hace falta ser
// administrador, a diferencia de un symlink normal en Windows) contra
// VANILLA_ROOT/assets y VANILLA_ROOT/libraries, que ya es el sitio donde
// vive todo esto para el modo vanilla. La carpeta de cada instancia pasa a
// "ver" el mismo contenido de disco, así que @xmcl/installer (que ya se
// salta cualquier archivo que detecte como ya descargado y válido) casi
// nunca tiene que descargar nada de verdad a partir de la segunda vez.
//
// Borrar una junction (p.ej. "Reparar instalación", que borra libraries/)
// solo quita el enlace, nunca el contenido real compartido — verificado a
// mano antes de implementar esto, ver commit.
function ensureSharedDirLinked(instanceRoot, subfolder) {
    const sharedDir = path.join(VANILLA_ROOT, subfolder);
    const instancePath = path.join(instanceRoot, subfolder);
    fs.mkdirSync(sharedDir, { recursive: true });

    let stat;
    try {
        stat = fs.lstatSync(instancePath);
    } catch (err) {
        fs.mkdirSync(instanceRoot, { recursive: true });
        fs.symlinkSync(sharedDir, instancePath, 'junction');
        return;
    }

    if (stat.isSymbolicLink()) {
        // Ya es una junction (el caso normal a partir de la primera vez).
        return;
    }

    // Ya había una carpeta real con contenido descargado antes de tener
    // esto: se mueve al almacén compartido lo que no exista ya ahí (nunca
    // se sobreescribe nada — las rutas de assets/libraries están
    // direccionadas por hash/coordenada, así que si ya existe en el
    // destino es, por definición, el mismo archivo) y se sustituye la
    // carpeta por la junction. Así no se pierde ni se vuelve a descargar
    // nada de lo que el jugador ya tenía descargado.
    mergeDirInto(instancePath, sharedDir);
    fs.rmSync(instancePath, { recursive: true, force: true });
    fs.symlinkSync(sharedDir, instancePath, 'junction');
}

function mergeDirInto(sourceDir, targetDir) {
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        const from = path.join(sourceDir, entry.name);
        const to = path.join(targetDir, entry.name);
        if (entry.isDirectory()) {
            fs.mkdirSync(to, { recursive: true });
            mergeDirInto(from, to);
        } else if (!fs.existsSync(to)) {
            fs.renameSync(from, to);
        }
    }
}

function ensureSharedGameFilesLinked(instanceRoot) {
    ensureSharedDirLinked(instanceRoot, 'assets');
    ensureSharedDirLinked(instanceRoot, 'libraries');
}

module.exports = { ensureSharedGameFilesLinked };
