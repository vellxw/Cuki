# CUKI — código móvil recuperado

> **Estado: publicación parcial del código fuente. No es una aplicación completa ni ejecutable.**
> Este commit conserva los archivos efectivamente disponibles el 14 de septiembre de 2026. No recupera por sí solo el proyecto íntegro anunciado anteriormente.

CUKI es un proyecto de recetas, alimentación y entrenamiento con un jardín de progreso. La dirección visual acordada es Botanical Liquid Glass. Esta publicación no rediseña la Home ni modifica los cinco archivos de código recuperados.

## Contenido publicado

| Archivo | Contenido del código conservado |
| --- | --- |
| `apps/mobile/src/screens/Home.tsx` | Home y diario |
| `apps/mobile/src/screens/Recipes.tsx` | Exploración, detalle, cocina, comentarios y edición de recetas |
| `apps/mobile/src/screens/Training.tsx` | Planes, ejercicios, sesión, descansos, historial y progresión |
| `apps/mobile/src/screens/Garden.tsx` | Jardín, colección y pantallas de recompensa/canje |
| `apps/mobile/src/screens/registry.tsx` | Composición del registro y enrutador de pantallas |
| `artifacts/verify-final.log` | Log histórico recuperado, no una verificación de este commit |

Los cuatro módulos de pantallas declaran **43 identificadores SC-**. Eso no acredita 43 recorridos funcionales ni las 87 pantallas anunciadas anteriormente: faltan dependencias internas y otros módulos que importa el registro.

Los workflows de preparación que ya existían en el repositorio se conservan sin cambios. Preparar dependencias no equivale a construir la aplicación.

## Qué falta

No están presentes `package.json`, lockfile, entrada de la app, configuración Expo/TypeScript/Metro, componentes de interfaz, tema, proveedor de datos, persistencia/sincronización, motores y tipos compartidos, adaptadores nativos ni las suites de pruebas. El registro también importa Onboarding, Foods, Planning, Progress, Billing y Settings, que no se recuperaron. No se incluyen backend, migraciones, worker, consola administrativa ni binarios.

El inventario automático está en [`docs/RECOVERY_STATUS.json`](docs/RECOVERY_STATUS.json). Enumera **20 destinos de imports relativos ausentes** detectables en los cinco archivos. Es un inventario directo, no el grafo completo de dependencias de la futura app.

No corresponde ejecutar `npm install` o afirmar que este snapshot arranca en Expo: no hay manifiestos de paquetes que permitan reproducirlo. Las versiones del antiguo workflow no sustituyen un lockfile del proyecto.

## Verificación de esta publicación

Se preservan los bytes de los cinco TSX y del log. `MANIFEST.sha256` registra los originales; el inventario incluye también sus identificadores Git blob. Para verificar la integridad del respaldo con Python 3:

```sh
python3 scripts/verify_snapshot.py
```

Este comando solo verifica archivos y hashes. **No compila TypeScript, no ejecuta tests de la app y no valida un binario nativo.**

El log histórico contiene resultados de 67 pruebas Node y 212 pruebas Jest. El código de esas pruebas no se encuentra en este snapshot, por lo que sus resultados no pueden reproducirse ni atribuirse a este commit. No se publica un badge de build aprobado ni una release instalable.

## Continuidad

Recuperar o implementar los módulos ausentes antes de intentar el build; conservar por separado las especificaciones del blueprint v2. Restaurar manifiestos y tests reales, verificar contratos cliente/servidor y realizar compilación y recorridos nativos. No sustituir módulos ausentes por pantallas o servicios ficticios que anuncien éxito.

No se incorporan credenciales, bases de datos personales, dependencias descargadas ni capturas de inspiración de terceros. La publicación de este código no implica despliegue de servicios, activación de cobros o lanzamiento en las tiendas.
