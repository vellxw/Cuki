# CUKI — reconstrucción nativa en curso

No es una entrega completa ni instalable todavía. La publicación directa conserva progresivamente los archivos reales reconstruidos, no solamente el log histórico. La transferencia del respaldo mediante enlace firmado falló con HTTP 403, por lo que no se usa esa ruta. Los checkpoints privados de fuentes se conservan y los archivos se publican por las operaciones normales del conector GitHub.

El cliente local cuenta con TypeScript estricto, componentes nativos, SQLite, motores y 87 rutas declaradas. Esto no verifica 87 recorridos ni acredita fidelidad visual. La suite nueva de dominio/SQLite pasó 39 pruebas; se publicará su código y se repetirá desde este repositorio antes de atribuir el resultado a un commit remoto. El log anterior se conserva como histórico.

Próximo: completar publicación de los fuentes, reconstruir y verificar lockfile, ejecutar builds reales, E2E y comparación visual; terminar backend/worker/admin y adapters pendientes. No se ha activado un servicio de producción, compra o canje real. La Home canónica no se rediseña.
