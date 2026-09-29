const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ============================================================================
// TRADUCCIONES DEL PROCESO PRINCIPAL
// ============================================================================

// Los errores, avisos, notificaciones y diálogos que genera el proceso
// principal se ven igual que los de la interfaz, así que usan el mismo
// diccionario (i18n.js, claves "sys.*") en vez de tener uno aparte que se
// desincronice. i18n.js es un <script> clásico para el renderer: aquí se
// ejecuta en un contexto aislado y solo se lee su objeto I18N.
const I18N = (() => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'i18n.js'), 'utf-8');
    const context = vm.createContext({});
    vm.runInContext(`${source}\n;globalThis.__I18N = I18N;`, context);
    return context.__I18N;
})();

// main.js lo conecta con el idioma guardado en la config; este módulo no
// depende de Electron para poder usarse (y probarse) desde módulos puros.
let resolveLanguage = () => 'es';

function setLanguageResolver(fn) {
    resolveLanguage = fn;
}

function currentLanguage() {
    try {
        const lang = resolveLanguage();
        return I18N[lang] ? lang : 'es';
    } catch (err) {
        return 'es';
    }
}

function tm(key, vars) {
    const dict = I18N[currentLanguage()];
    let str = dict[key] || I18N.es[key] || key;
    if (vars) {
        for (const [name, value] of Object.entries(vars)) {
            str = str.split(`{${name}}`).join(String(value));
        }
    }
    return str;
}

module.exports = { tm, setLanguageResolver, currentLanguage, I18N };
