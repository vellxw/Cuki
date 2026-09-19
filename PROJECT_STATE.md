# CUKI — implementación integrada y verificación en curso

Actualizado el 19-09-2026. Rama: `implementation/cuki-verified`. `main` mantiene el respaldo anterior. Este estado no certifica app completa ni fidelidad pixel-perfect. La Home aprobada sigue siendo el canon; no hay un nuevo rediseño.

## Trabajo conservado en esta continuación

- Calendario manual semanal opcional, horarios locales, identidad estable de día de rutina, borradores y validación. Home y Mi semana distinguen planificar de registrar. El tab nativo lee parámetros reales: abrir otro plan ya no depende de `plans[0]`.
- Voto visible en recetas: intención persistente sin conexión, cuenta verificada, pendientes/conflictos separados del total confirmado. No se inventa un voto adicional mientras el servidor no lo confirmó.
- Render de planta se desmonta al perder foco y cancela callbacks/watchdogs del contexto anterior. Conserva semilla, etapa y fallback procedural. Se mantienen las versiones anteriores.
- Comparador privado de seis referencias con originales/hash, recorte declarado y escala uniforme, overlay/diff por regiones, ruido entre frames y residuo de proporciones. Los recortes son iniciales, no una calibración de 1–2 dp aprobada.
- Inventario derivado del código: 92 estados del blueprint, 87 registros móviles y 45 bindings HTTP literales en app.ts; estas cifras NO significan recorridos completos o probados.

## Evidencia ejecutada, con sus límites

- Suite local tras calendario/votos: 111 pruebas core, 38 de integración y 60 de componentes móviles aprobadas, TypeScript sin errores. Integración local usa PGlite; componentes usan SQLite real del entorno con APIs de plataforma sustituidas. No equivale a un teléfono.
- 41 pruebas Python del harness nativo aprobadas. La configuración Android lavapipe ejecutó dos pantallas reales con el APK previo; eso no acredita el recorrido completo del binario nuevo.
- Run `35417505549`, fuente `cd8c37d53cd3a6bd7153bd20d689767028f8c405`: instalación limpia, tests/bundles y compilación Android/iOS aprobados. **Los E2E fallaron.** Android sí completó bienvenida, volver desde Registrar, cuatro destinos, registrar 100 g y persistencia tras cerrar el proceso. Se detuvo en el campo `Series, ejercicio 1`, oculto durante edición con teclado. iOS se detuvo por timeout de la consulta de accesibilidad al llegar a Home. Ambos fallos tienen video/capturas/logs, no se retiraron aserciones.
- Run canónico `35417551426`, fuente `876b1e9d1d5964beae208b53dd50f620214a32f8`: cinco escenas nativas pasaron, Jardín falló la aserción de dibujo 3D. La jerarquía mostraba `plant-render-starting` después de la espera y la planta no aparecía. No se considera una captura válida del Jardín ni un éxito visual global.

## Correcciones recién implementadas que requieren binario nuevo

El teclado ahora tiene una acción explícita de cierre en ambas plataformas y el formulario Android usa reducción de altura para mantener scroll visible; se añadió una prueba de eventos/cleanup. Es una corrección candidata al fallo nativo, aún no un E2E aprobado.

Se eliminan las pasadas de prefiltrado de iluminación del inicio de la pantalla. El estudio geométrico de Three.js se horneó una vez en CI (`35419389438`) y quedó como mapa half-float local, SHA-256 `0c19bb00be292380e9bd0aacae570bfe673395edac1ef4468372057be762bac9`, 1.572.864 bytes. No es una foto de la planta ni una referencia de terceros. La app carga el mapa asincrónicamente y cada contexto dispone su textura; geometría y semilla no cambian. Tres tests del decoder/hash aprobaron. Reducir el trabajo síncrono inicial es una hipótesis de reparación de la demora de GL: falta medirla en el binario, no se declara causa única demostrada.

## Siguiente tarea exacta

1. Confirmar que el parche de iluminación/Metro y el de teclado están aplicados remotamente, ejecutar instalación limpia/tests/bundles y nueva compilación.
2. Repetir E2E Android/iOS sin omitir campos y las seis capturas canónicas con 3D real y par consecutivo estable; inspeccionar errores originales, no solo el color del workflow.
3. Descargar un checkpoint completo del commit remoto, comprobar CRC/hashes y clon limpio, empaquetar fuente y evidencias con alcance explícito.
4. Continuar fidelidad visual, resto de recorridos, widgets/Live Activities, accesibilidad/perfilado e integración administrativa. Proveedores de IA/salud/tiendas y firma de distribución siguen requiriendo configuración y comprobación real; no se activan cobros ni producción.

Los binarios de prueba son `com.cuki.app.test`; las referencias con datos sintéticos usan `com.cuki.app.visual`. No son un APK comercial aprobado ni un IPA para iPhone. Ninguna fuente privada, credencial, base personal o archivo de tipografía se publica.
