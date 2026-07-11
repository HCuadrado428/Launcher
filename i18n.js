// Diccionario de traducciones. Script plano cargado antes de renderer.js
// (sin módulos, para encajar con el resto del proyecto).
const I18N = {
    es: {
        'app.title': '⛏ MI LAUNCHER',

        'login.offline.title': '🧑 Cuenta no premium',
        'login.offline.desc': 'Modo offline, para testear o jugar sin cuenta de Mojang/Microsoft. No permite usar modpacks.',
        'login.offline.username.placeholder': 'Tu nombre de usuario',
        'login.offline.button': 'Continuar sin cuenta premium',

        'login.ms.title': '🪟 Cuenta Microsoft',
        'login.ms.desc': 'Inicia sesión con tu cuenta oficial de Minecraft/Xbox. Necesaria para crear y unirte a modpacks.',
        'login.ms.button': 'Iniciar sesión con Microsoft',
        'login.ms.opening': 'Abriendo ventana de login...',

        'main.switchAccount': 'Cambiar cuenta',
        'main.java.label': 'Ruta de Java (java.exe)',
        'main.java.placeholder': 'Se detecta automáticamente si lo dejas vacío',
        'main.java.detect': 'Detectar',
        'main.java.browse': 'Buscar...',
        'main.ram.label': 'Memoria RAM asignada',
        'main.install.label': 'Instalación a jugar',
        'main.install.myModpacks': 'Mis modpacks',
        'main.play': 'Iniciar Juego',
        'main.playStarting': 'Iniciando juego...',
        'main.playStarted': 'Juego iniciado',
        'main.stop': 'Detener',
        'main.progress.preparing': 'Preparando...',

        'modpacks.back': 'Volver',
        'modpacks.title': 'Modpacks',
        'modpacks.invite.title': '🔗 Unirme con un link de invitación',
        'modpacks.invite.desc': 'Pega aquí el link milauncher://invite/... que te hayan compartido.',
        'modpacks.invite.placeholder': 'milauncher://invite/xxxxxxxx',
        'modpacks.invite.button': 'Canjear invitación',

        'modpacks.create.title': '➕ Crear un modpack nuevo',
        'modpacks.create.desc': 'Solo disponible con cuenta Microsoft. Puedes elegir cualquier versión de Minecraft y el loader (Forge/Fabric).',
        'modpacks.create.name.placeholder': 'Nombre del modpack',
        'modpacks.create.version.label': 'Versión de Minecraft',
        'modpacks.create.version.loading': 'Cargando versiones...',
        'modpacks.create.loader.label': 'Loader',
        'modpacks.create.loaderVersion.label': 'Versión del loader',
        'modpacks.create.loaderVersion.loading': 'Cargando versiones...',
        'modpacks.create.loaderVersion.recommended': 'recomendado',
        'modpacks.create.loaderVersion.empty': 'No hay versiones disponibles para esta combinación.',
        'modpacks.create.button': 'Crear modpack',

        'modpacks.owned.label': 'Mis modpacks (creados por mí)',
        'modpacks.shared.label': 'Modpacks compartidos conmigo',
        'modpacks.vanilla.label': 'Jugar sin modpack',
        'modpacks.vanilla.button': 'Usar Minecraft vanilla (última versión)',

        'modpacks.manage': 'Gestionar',
        'modpacks.play': 'Jugar',
        'modpacks.owner.suffix': ' · creado por ti',
        'modpacks.empty.owned': 'Todavía no has creado ningún modpack.',
        'modpacks.empty.shared': 'Nadie te ha compartido ningún modpack todavía.',
        'common.loading': 'Cargando...',

        'modal.title': 'Gestionar mods',
        'modal.close': 'Cerrar',
        'modal.addMod': 'Añadir mod (.jar)',
        'modal.addModUploading': 'Subiendo...',
        'modal.invite.label': 'Invitar a otros jugadores',
        'modal.invite.generate': 'Generar link de invitación',
        'modal.deleteModpack': 'Eliminar modpack',
        'modal.deleteConfirm': '¿Seguro que quieres eliminar el modpack "{name}"? Se borrará para siempre, también en los launchers que ya lo tengan instalado.',
        'modal.deleting': 'Eliminando...',
        'modal.mods.empty': 'Este modpack todavía no tiene mods.',

        'toast.loggedIn': 'Sesión iniciada como {name}',
        'toast.msLoginFailed': 'No se pudo iniciar sesión con Microsoft.',
        'toast.javaSearching': 'Buscando instalaciones de Java...',
        'toast.javaDetected': 'Detectado: {path}',
        'toast.javaNotFound': 'No se encontró ninguna instalación de Java en este sistema.',
        'toast.vanillaSelected': 'Ahora jugarás con Minecraft vanilla.',
        'toast.modpackCreated': 'Modpack creado.',
        'toast.modpackCreateMissingFields': 'Ponle un nombre y una versión de Minecraft al modpack.',
        'toast.modpackCreateFailed': 'No se pudo crear el modpack.',
        'toast.modpackDeleted': 'Modpack eliminado. Se quitará en todos los launchers.',
        'toast.modpackDeleteFailed': 'No se pudo eliminar el modpack.',
        'toast.modpackListLoadFailed': 'No se pudieron cargar los modpacks.',
        'toast.inviteJoined': 'Te has unido al modpack "{name}".',
        'toast.inviteRedeemFailed': 'No se pudo canjear la invitación.',
        'toast.modpackSyncFailed': 'No se pudo sincronizar el modpack.',
        'toast.modpackReady': 'Listo. Vas a jugar con "{name}".',
        'toast.modpackManifestLoadFailed': 'No se pudo cargar la lista de mods.',
        'toast.modRemoved': 'Mod eliminado. Se actualizará en todos los launchers.',
        'toast.modRemoveFailed': 'No se pudo quitar el mod.',
        'toast.modsUploaded': '{count} mod(s) añadidos. Se actualizarán en todos los launchers.',
        'toast.modUploadFailed': 'No se pudo subir el mod.',
        'toast.inviteCopied': 'Link copiado al portapapeles.',
        'toast.inviteCreateFailed': 'No se pudo generar la invitación.',
        'toast.modpackRemovedRemote': 'El modpack "{name}" ya no está disponible (fue eliminado o perdiste el acceso). Has vuelto a Minecraft vanilla; pulsa "Iniciar Juego" de nuevo si quieres continuar.',

        'label.vanilla': 'Vanilla',
        'label.vanillaChecking': 'Vanilla · consultando última versión...',
        'label.vanillaVersion': 'Vanilla · {version} (última release)',
        'label.modpackActive': '📦 {name} · MC {version}',
        'account.ms': 'Cuenta Microsoft',
        'account.offline': 'Cuenta no premium (offline)'
    },
    en: {
        'app.title': '⛏ MY LAUNCHER',

        'login.offline.title': '🧑 Non-premium account',
        'login.offline.desc': 'Offline mode, for testing or playing without a Mojang/Microsoft account. Modpacks are not available.',
        'login.offline.username.placeholder': 'Your username',
        'login.offline.button': 'Continue without premium account',

        'login.ms.title': '🪟 Microsoft account',
        'login.ms.desc': 'Sign in with your official Minecraft/Xbox account. Required to create and join modpacks.',
        'login.ms.button': 'Sign in with Microsoft',
        'login.ms.opening': 'Opening login window...',

        'main.switchAccount': 'Switch account',
        'main.java.label': 'Java path (java.exe)',
        'main.java.placeholder': 'Detected automatically if left empty',
        'main.java.detect': 'Detect',
        'main.java.browse': 'Browse...',
        'main.ram.label': 'Allocated RAM',
        'main.install.label': 'Installation to play',
        'main.install.myModpacks': 'My modpacks',
        'main.play': 'Start Game',
        'main.playStarting': 'Starting game...',
        'main.playStarted': 'Game started',
        'main.stop': 'Stop',
        'main.progress.preparing': 'Preparing...',

        'modpacks.back': 'Back',
        'modpacks.title': 'Modpacks',
        'modpacks.invite.title': '🔗 Join with an invite link',
        'modpacks.invite.desc': 'Paste the milauncher://invite/... link someone shared with you.',
        'modpacks.invite.placeholder': 'milauncher://invite/xxxxxxxx',
        'modpacks.invite.button': 'Redeem invite',

        'modpacks.create.title': '➕ Create a new modpack',
        'modpacks.create.desc': 'Only available with a Microsoft account. Pick any Minecraft version and loader (Forge/Fabric).',
        'modpacks.create.name.placeholder': 'Modpack name',
        'modpacks.create.version.label': 'Minecraft version',
        'modpacks.create.version.loading': 'Loading versions...',
        'modpacks.create.loader.label': 'Loader',
        'modpacks.create.loaderVersion.label': 'Loader version',
        'modpacks.create.loaderVersion.loading': 'Loading versions...',
        'modpacks.create.loaderVersion.recommended': 'recommended',
        'modpacks.create.loaderVersion.empty': 'No versions available for this combination.',
        'modpacks.create.button': 'Create modpack',

        'modpacks.owned.label': 'My modpacks (created by me)',
        'modpacks.shared.label': 'Modpacks shared with me',
        'modpacks.vanilla.label': 'Play without a modpack',
        'modpacks.vanilla.button': 'Use vanilla Minecraft (latest version)',

        'modpacks.manage': 'Manage',
        'modpacks.play': 'Play',
        'modpacks.owner.suffix': ' · created by you',
        'modpacks.empty.owned': "You haven't created any modpack yet.",
        'modpacks.empty.shared': 'No one has shared a modpack with you yet.',
        'common.loading': 'Loading...',

        'modal.title': 'Manage mods',
        'modal.close': 'Close',
        'modal.addMod': 'Add mod (.jar)',
        'modal.addModUploading': 'Uploading...',
        'modal.invite.label': 'Invite other players',
        'modal.invite.generate': 'Generate invite link',
        'modal.deleteModpack': 'Delete modpack',
        'modal.deleteConfirm': 'Are you sure you want to delete the modpack "{name}"? It will be permanently removed, including from launchers that already have it installed.',
        'modal.deleting': 'Deleting...',
        'modal.mods.empty': "This modpack doesn't have any mods yet.",

        'toast.loggedIn': 'Signed in as {name}',
        'toast.msLoginFailed': 'Could not sign in with Microsoft.',
        'toast.javaSearching': 'Searching for Java installations...',
        'toast.javaDetected': 'Detected: {path}',
        'toast.javaNotFound': 'No Java installation was found on this system.',
        'toast.vanillaSelected': 'You will now play vanilla Minecraft.',
        'toast.modpackCreated': 'Modpack created.',
        'toast.modpackCreateMissingFields': 'Give the modpack a name and a Minecraft version.',
        'toast.modpackCreateFailed': 'Could not create the modpack.',
        'toast.modpackDeleted': 'Modpack deleted. It will be removed from every launcher.',
        'toast.modpackDeleteFailed': 'Could not delete the modpack.',
        'toast.modpackListLoadFailed': 'Could not load your modpacks.',
        'toast.inviteJoined': 'You joined the modpack "{name}".',
        'toast.inviteRedeemFailed': 'Could not redeem the invite.',
        'toast.modpackSyncFailed': 'Could not sync the modpack.',
        'toast.modpackReady': 'Ready. You will play with "{name}".',
        'toast.modpackManifestLoadFailed': 'Could not load the mod list.',
        'toast.modRemoved': 'Mod removed. It will update on every launcher.',
        'toast.modRemoveFailed': 'Could not remove the mod.',
        'toast.modsUploaded': '{count} mod(s) added. They will update on every launcher.',
        'toast.modUploadFailed': 'Could not upload the mod.',
        'toast.inviteCopied': 'Link copied to clipboard.',
        'toast.inviteCreateFailed': 'Could not generate the invite.',
        'toast.modpackRemovedRemote': 'The modpack "{name}" is no longer available (it was deleted or you lost access). You are back on vanilla Minecraft; click "Start Game" again to continue.',

        'label.vanilla': 'Vanilla',
        'label.vanillaChecking': 'Vanilla · checking latest version...',
        'label.vanillaVersion': 'Vanilla · {version} (latest release)',
        'label.modpackActive': '📦 {name} · MC {version}',
        'account.ms': 'Microsoft account',
        'account.offline': 'Non-premium account (offline)'
    }
};

let currentLang = 'es';

function t(key, vars) {
    const dict = I18N[currentLang] || I18N.es;
    let str = dict[key] || I18N.es[key] || key;
    if (vars) {
        Object.keys(vars).forEach((k) => {
            str = str.split(`{${k}}`).join(vars[k]);
        });
    }
    return str;
}

function setLanguage(lang) {
    currentLang = I18N[lang] ? lang : 'es';
    document.documentElement.lang = currentLang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
        el.innerText = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
}
