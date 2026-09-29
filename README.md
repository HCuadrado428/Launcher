# Ember Launcher

Launcher de Minecraft para Windows hecho con Electron. Permite jugar en vanilla o con **modpacks compartidos**: el dueño de un modpack añade mods (subidos a mano o desde Modrinth), elige Forge o Fabric y lo comparte con una invitación, y el launcher de cada jugador lo mantiene sincronizado.

## Funciones

- Cuentas Microsoft y offline, con varias cuentas guardadas y credenciales cifradas (`safeStorage`). La sesión de Microsoft se renueva sola antes de cada partida.
- Modpacks compartidos: crear, invitar (`milauncher://invite/...`), gestionar accesos, historial de versiones, mods opcionales y config compartida.
- Forge, NeoForge, Fabric y Quilt con la versión que elija el dueño; búsqueda de mods y resource packs en Modrinth, con actualización y dependencias obligatorias a un clic.
- **Java automático:** si el campo de Java se deja vacío, se descarga el runtime oficial de Mojang que necesita cada versión de Minecraft (Java 8, 17, 21...).
- Sincronización con comprobación de sha1, reparación y verificación, assets/librerías compartidos entre instancias, resumen de novedades y copia de los mundos antes de cambios que pueden estropearlos.
- Importar y exportar `.mrpack` (Modrinth App, Prism, ATLauncher...) e importar instancias de Modrinth App y CurseForge App (los mods se añaden desde Modrinth; con tu API key de CurseForge te dice cuáles faltan).
- Consola del juego, crash logs con pista sobre la causa más probable, `launcher.log` para diagnosticar el launcher, galería de capturas y exportación de mundos.
- Servidores favoritos con botón para entrar directamente, RAM recomendada por instalación y opción de ocultar el launcher mientras juegas.
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

Las actualizaciones automáticas (electron-updater) solo funcionan en la app instalada.

### Publicar una versión

1. Sube la versión en `package.json` (`npm version minor`, por ejemplo).
2. Sube la etiqueta: `git push --follow-tags`.
3. El workflow `Release` pasa los tests, construye el instalador y lo publica como GitHub Release, que es de donde lo descarga electron-updater.

(`npm run release` hace lo mismo desde tu ordenador.)

### Firma del instalador

Sin firmar, Windows SmartScreen avisa al instalar y al actualizar. Para firmar hace falta un certificado de firma de código (OV o EV) de una autoridad reconocida:

1. Exporta el certificado a un `.pfx` y conviértelo a base64 (`[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx"))` en PowerShell).
2. En GitHub → Settings → Secrets and variables → Actions, crea `WINDOWS_CERTIFICATE_PFX_BASE64` (el base64) y `WINDOWS_CERTIFICATE_PASSWORD`.
3. A partir de ahí, el workflow `Release` firma el `.exe` automáticamente. Sin esos secretos, sigue publicando sin firmar.

El backend de modpacks (cuentas, invitaciones, almacenamiento de mods) es un servicio aparte; por defecto se usa el de producción configurado en `main/backend.js`.

## Estructura

```
main.js                 Ventana, bandeja, actualizaciones y deep links
preload.js              API expuesta al renderer (window.electronAPI)
main/
  ipc/                  Manejadores IPC: accounts, modpacks, files (capturas, mundos, servidores)
  game.js               Lanzar/detener el juego, crash logs, tiempo jugado
  gameLauncher.js       Instalar la versión y lanzar con @xmcl/core
  modpackSync.js        Sincronizar, reparar y verificar instancias de modpacks
  syncPlan.js           Qué descargar/borrar en cada sincronización (lógica pura)
  javaRuntime.js        Java automático (runtimes oficiales de Mojang)
  loaders.js            Instalación de Forge/NeoForge/Fabric/Quilt (@xmcl/installer)
  mrpack.js             Importar/exportar .mrpack
  modUpdates.js         Actualizar mods y añadir dependencias desde Modrinth
  msAuth.js             Renovar la sesión de Microsoft
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
- Crash logs y `launcher.log`: `crash-logs/` en esa misma carpeta (se abre desde la consola del juego).
- Copias automáticas de los mundos: `backups/` dentro de la carpeta de cada modpack.
- Juego, instancias y runtimes de Java: `%APPDATA%/.milauncher/`.
