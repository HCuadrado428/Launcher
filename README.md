# Ember Launcher

Launcher de Minecraft para Windows hecho con Electron. Permite jugar en vanilla o con **modpacks compartidos**: el dueño de un modpack añade mods (subidos a mano o desde Modrinth), elige Forge o Fabric y lo comparte con una invitación, y el launcher de cada jugador lo mantiene sincronizado.

## Funciones

- Cuentas Microsoft y offline, con varias cuentas guardadas y credenciales cifradas (`safeStorage`).
- Modpacks compartidos: crear, invitar (`milauncher://invite/...`), gestionar accesos, historial de versiones, mods opcionales y config compartida.
- Forge y Fabric con la versión que elija el dueño; búsqueda e instalación de mods y resource packs desde Modrinth.
- **Java automático:** si el campo de Java se deja vacío, se descarga el runtime oficial de Mojang que necesita cada versión de Minecraft (Java 8, 17, 21...).
- Sincronización con comprobación de sha1, reparación y verificación de la instalación, y assets/librerías compartidos entre instancias.
- Importación de instancias de Modrinth App (y detección de las de CurseForge App).
- Consola del juego, crash logs guardados con pista sobre la causa más probable, galería de capturas, exportación de mundos y de modpacks.
- Servidores favoritos con botón para entrar directamente.
- Interfaz en español, inglés, francés, alemán y portugués.

## Desarrollo

Requisitos: Node.js 22.12 o superior.

```bash
npm install
npm start          # abre el launcher en modo desarrollo
npm test           # tests (node --test)
npm run test:e2e   # abre la app con Playwright y prueba lo básico (en Linux: xvfb-run -a npm run test:e2e)
npm run lint       # ESLint
npm run pack       # empaqueta sin instalador (dist/)
npm run dist       # instalador NSIS para Windows
```

Las actualizaciones automáticas (electron-updater) solo funcionan en la app instalada; `npm run release` publica un GitHub Release en este repositorio.

El backend de modpacks (cuentas, invitaciones, almacenamiento de mods) es un servicio aparte; por defecto se usa el de producción configurado en `main/backend.js`.

## Estructura

```
main.js                 Ventana, bandeja, actualizaciones y deep links
preload.js              API expuesta al renderer (window.electronAPI)
main/
  ipc/                  Manejadores IPC: accounts, modpacks, files (capturas, mundos, servidores)
  game.js               Lanzar/detener el juego, crash logs, tiempo jugado
  modpackSync.js        Sincronizar, reparar y verificar instancias de modpacks
  syncPlan.js           Qué descargar/borrar en cada sincronización (lógica pura)
  javaRuntime.js        Java automático (runtimes oficiales de Mojang)
  loaders.js            Instalación de Forge/Fabric (@xmcl/installer)
  backend.js            Cliente de la API del backend de modpacks
  i18nMain.js           Traducciones del proceso principal (claves sys.* de i18n.js)
  ...                   Utilidades puras con tests (httpUtils, gameOptions, crashAnalysis...)
renderer/               Scripts de la interfaz (scripts clásicos, cargados en orden en index.html)
i18n.js                 Diccionario de traducciones de toda la app
test/                   Tests de node:test
e2e/                    Smoke test de extremo a extremo (Electron + Playwright)
```

## Seguridad

- El renderer no tiene acceso a Node (`contextIsolation`, `sandbox`) y la página tiene una Content-Security-Policy que bloquea scripts inline.
- Todo lo que llega del servidor se escapa antes de pintarse; los ids y tokens se escapan al construir URLs (`apiPath`) y los nombres de archivo se validan antes de tocar el disco.
- La config compartida de un modpack solo puede escribir `config/` y `options.txt`.

## Dónde guarda las cosas

- Config y cuentas: `config.json` (cifrado) en la carpeta de datos de la app (`app.getPath('userData')`, dentro de `%APPDATA%` en Windows).
- Crash logs: `crash-logs/` en esa misma carpeta (también se abre desde la consola del juego).
- Juego, instancias y runtimes de Java: `%APPDATA%/.milauncher/`.
