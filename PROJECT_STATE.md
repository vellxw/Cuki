# CUKI — reparación e integración en curso

La base de esta reparación es el snapshot remoto 973de58250130ceb2eaeac669ae5d8325c319264, reconciliado por archivo con CUKI_Implementacion_Checkpoint_20260915.zip. No se reescribió la Home aprobada ni se reemplazaron las correcciones remotas de autenticación/sync/borradores.

Restaurados: suites originales, consola administrativa y controles de verificación. Añadidas regresiones de autenticación concurrente, aislamiento de borradores y sincronización; pruebas de componentes con interfaces de sistema sustituidas. `npm test` no acepta suites vacías, omitidas ni sin resumen verificable. Corregida autorización del invitado para las rutas públicas. Eliminados dos imports de imágenes demo que no utiliza ninguna pantalla; las capturas de usuario no se sustituyen por ellas.

Verificación local de esta reparación: TypeScript; 35 pruebas core, 19 API/SQL y 6 componentes; bundles Android/iOS. Esto usa dependencias recuperadas y NO acredita instalación limpia ni binarios nativos. La CI volverá a verificar desde npm ci. Integración SQL local con PGlite no equivale a PostgreSQL externo ni proveedores reales.

Próximo bloque: CI rápida desde fuente completa, APK autónomo y simulador iOS, recorridos con persistencia y capturas nativas. No hay todavía binario instalado de esta revisión ni comparación visual aprobada. Servicios externos (IA, stores, hosting, Health) se deben validar por separado. La app no está declarada completa.
