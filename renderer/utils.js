let currentAccount = null;
let currentModsModalId = null;
let currentModsModalName = null;
let currentModsModalMcVersion = null;
let currentModsModalLoader = null;

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = -1;
    do {
        value /= 1024;
        unitIndex++;
    } while (value >= 1024 && unitIndex < units.length - 1);
    return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function showToast(message, type) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.innerText = message;
    toastWrap.appendChild(el);
    setTimeout(() => el.remove(), 5000);
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

const HTML_ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const HTML_ESCAPE_RE = /[&<>"']/g;

// Antes creaba un <div> y hacía un viaje de ida y vuelta por innerText/
// innerHTML por cada valor a escapar; con listas que se repintan enteras
// (p.ej. al buscar) eso es mucho tocar el DOM solo para escapar texto. Un
// reemplazo por tabla es igual de correcto y no toca el DOM para nada.
function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(HTML_ESCAPE_RE, (ch) => HTML_ESCAPE_MAP[ch]);
}

function debounce(fn, delayMs) {
    let timeoutId = null;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delayMs);
    };
}

function skeletonCardsHtml(count) {
    return Array.from({ length: count }, () => '<div class="modpack-card-skeleton"></div>').join('');
}

const LOADER_LABELS = { forge: 'Forge', fabric: 'Fabric' };
const LOADER_ICONS = { forge: '🛠️', fabric: '🧵' };

function loaderBadgeHtml(loader, loaderVersion) {
    if (!loader || loader === 'vanilla') return '';
    const label = LOADER_LABELS[loader] || loader;
    const text = loaderVersion ? `${label} ${loaderVersion}` : label;
    return `<span class="badge badge-${loader}">${escapeHtml(text)}</span>`;
}

const SOURCE_ICONS = { curseforge: '🟠', modrinth: '🟢' };
const SOURCE_LABELS = { curseforge: 'CurseForge', modrinth: 'Modrinth' };

function extractInviteToken(raw) {
    const value = raw.trim();
    const match = /^milauncher:\/\/invite\/(.+)$/.exec(value);
    return match ? match[1] : value; // si no es un link completo, asumimos que ya es el token
}
