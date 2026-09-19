# CUKI · aplicación nativa en desarrollo

Aplicación React Native/Expo para recetas, nutrición, entrenamiento y jardín procedural, con API, persistencia SQLite, PostgreSQL, autenticación, colas y consola administrativa. **Este repositorio contiene una implementación integrada en curso; no es una certificación de app completa, pixel-perfect ni lista para producción.** Consultar `PROJECT_STATE.md` y evidencias de cada commit.

La rama de trabajo es **implementation/cuki-verified**. `main` conserva el respaldo anterior; no representa esta implementación. No utilizar logs históricos como prueba del estado actual.

## Estructura

- `apps/mobile`: cliente nativo, navegación, pantallas, cámara/audio y módulos de plataforma.
- `packages/core`: datos locales, motores, planificación, sincronización y contratos del cliente.
- `packages/garden-engine`: semilla, crecimiento, geometría y materiales versionados.
- `apps/api` + `packages/server`: API, autorización, comunidad, cuotas, jardín y recompensas.
- `apps/worker`: procesos durables con PostgreSQL externo.
- `apps/admin`: consola web servida por la API; no sustituye el cliente móvil.
- `migrations`, `tests`, `scripts`: esquema/RLS, pruebas y procedimientos reproducibles.

## Desarrollo local

Usar Node 22.16.0 y el lockfile del repositorio. Desde la raíz:

```sh
npm ci
npm run setup:local
npm run api
```

`setup:local` crea secretos nuevos en `.env` sin sobrescribir uno existente. La API migra el esquema al arrancar. Sin `DATABASE_URL`, usa PGlite persistente en `.local/postgres` y procesa las colas en el mismo proceso. **No arrancar un segundo worker sobre esa base embebida.** Con un PostgreSQL externo configurado, iniciar `npm run worker` en otro proceso.

El modo de autenticación local envía los códigos exclusivamente al buzón de desarrollo `.local/mail`. No equivale a correo real ni a una cuenta Supabase de producción. La consola se sirve en `/admin`, pero necesita un actor con rol administrativo; un usuario normal no adquiere privilegios por abrir la página.

## Cliente nativo

Configurar variables `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` visibles para el proceso de Expo, con direcciones accesibles desde el dispositivo. El `.env` de la raíz configura el servidor y no debe suponerse automáticamente cargado por el workspace móvil. Nunca copiar secretos de servidor a variables públicas.

```sh
npm run android -w @cuki/mobile
# macOS con Xcode:
npm run ios -w @cuki/mobile
```

Estos comandos requieren SDK/compiladores de la plataforma. Una exportación Hermes no es un APK/IPA. La app usa módulos nativos y se prueba en un binario propio, no solamente en Expo Go.

Variantes aisladas: `EXPO_PUBLIC_TEST_MODE=1` usa `com.cuki.app.test`. `EXPO_PUBLIC_VISUAL_FIXTURES=1` exige además modo test y ausencia de endpoints cloud; genera `com.cuki.app.visual` con datos sintéticos para captura. **La variante visual no se entrega como la app de uso normal.** Los APK de prueba no habilitan compras ni IA real sin configuración de proveedores.

## Comprobación

```sh
npm run typecheck
npm test
python3 -m unittest discover -s tests/native -p 'test_*.py'
npm run verify -- --bundles
```

Las pruebas locales de integración sin `DATABASE_URL` usan PGlite; el workflow `postgres-check.yml` verifica un PostgreSQL externo aislado. Las pruebas de componentes sustituyen APIs del sistema. Los workflows nativos compilan e instalan los binarios, navegan mediante XCTest/accesibilidad y guardan capturas originales. Un workflow de captura aprobado no demuestra por sí solo fidelidad al diseño.

`node scripts/quality/inventory.mjs <blueprint>/03_DISENO/pantallas.json` genera trazabilidad estática sin convertir una pantalla registrada en una función aprobada. `scripts/visual/compare-native.py` genera comparaciones privadas por regiones y muestra los residuos de proporciones. Las referencias originales no se distribuyen públicamente.

## Estado y límites explícitos

Se mantienen registro manual, borradores, sesiones, planificación semanal y cambios pendientes en SQLite. Las recompensas se confirman en servidor; la animación o el reloj del cliente no crean monedas. Un voto guardado sin conexión no se suma ficticiamente al recuento de la comunidad.

Continúan pendientes la revisión visual completa contra el canon, validación en dispositivos físicos, widgets/Live Activities, revisión E2E administrativa y las pruebas con proveedores reales de IA, salud y tiendas. La presencia de adaptadores y pruebas contractuales no acredita esas integraciones en vivo. No habilitar cobros ni publicar en tiendas basándose solo en este checkpoint.

## Conservación y privacidad

Los checkpoints incluyen fuente y manifiestos de hashes; los builds/capturas indican su commit. No se versionan `.env`, `.local`, `node_modules`, bases personales, claves de firma, fuentes de Apple ni imágenes de inspiración ajenas. La Home aprobada continúa siendo la referencia visual: no se abre una nueva ronda de rediseño.
