# CUKI — continuación de la verificación nativa

Base de esta continuación: d293af81d60d3225c6eb4cad2a4bb7a23795bb07, recuperado desde el artefacto de fuente inmutable de la CI. Código de la aplicación conservado; no se rediseñó la Home.

## Evidencia revisada

La ejecución 35031959284 compiló Android e iOS. Su captura iOS mostró un error de SecureStore/Keychain: faltaba un entitlement; que simctl devolviera un PID NO acreditaba inicio correcto. Android quedó tapado por el aviso «Quickstep isn't responding» del launcher del emulador. No son dos apps validadas.

Se está reintentando el job Android original por ese fallo de infraestructura, sin cambiar el APK ni eliminar pruebas. La validación nueva de iOS reemplaza el simple launch/screenshot por XCTest con navegación y registro persistente; se habilita firma ad-hoc del simulador en lugar de CODE_SIGNING_ALLOWED=NO. Esto no firma una app distribuible en iPhone y está pendiente de ejecución.

El smoke de Android conserva evidencia de un posible fallo del launcher y permite cerrarlo una vez. Los ANR de CUKI o de procesos desconocidos siguen siendo errores. Cinco pruebas Python del clasificador pasaron localmente. Las suites existentes y TypeScript de la fuente d293af8 se volvieron a ejecutar localmente; las dependencias locales son recuperadas, por lo que la instalación limpia sigue verificándose en CI.

## Próximas comprobaciones

1. Leer resultados reales de ambos recorridos y corregir cualquier fallo de app/QA.
2. Conservar binarios y capturas por commit; entregar APK solo con alcance de prueba explícito.
3. Continuar entrenamiento, integración cliente-servidor y comparaciones visuales nativas de las seis referencias.

Servicios externos, firma de distribución, backend público y fidelidad visual completa siguen sin aprobar. No se tocó otro proyecto Supabase ni producción. .local y caches Python quedan excluidos de Git para evitar publicar bases, correos de prueba o datos locales.
