const js = require('@eslint/js');

const nodeGlobals = {
    require: 'readonly',
    module: 'readonly',
    process: 'readonly',
    console: 'readonly',
    __dirname: 'readonly',
    __filename: 'readonly',
    Buffer: 'readonly',
    fetch: 'readonly',
    FormData: 'readonly',
    Blob: 'readonly',
    AbortController: 'readonly',
    URLSearchParams: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly'
};

const browserGlobals = {
    window: 'readonly',
    document: 'readonly',
    navigator: 'readonly',
    localStorage: 'readonly',
    fetch: 'readonly',
    FormData: 'readonly',
    Blob: 'readonly',
    KeyboardEvent: 'readonly',
    Notification: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    confirm: 'readonly',
    alert: 'readonly'
};

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: nodeGlobals
        },
        rules: {
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }]
        }
    },
    {
        // renderer/*.js e i18n.js/preload.js son <script> clásicos cargados
        // en orden en index.html, sin bundler ni "type=module": comparten un
        // único scope global de verdad (una const de dom.js es visible en
        // modpacks.js sin import/require). ESLint analiza cada archivo por
        // separado, así que "no-undef"/"no-unused-vars" darían falsos
        // positivos constantes contra esta arquitectura intencional. La
        // carga real conjunta ya se verifica con jsdom en test/ (manual, no
        // parte de esta suite automatizada).
        files: ['renderer/**/*.js', 'i18n.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: browserGlobals
        },
        rules: {
            'no-undef': 'off',
            'no-unused-vars': 'off'
        }
    },
    {
        ignores: ['node_modules/**', 'dist/**']
    }
];
