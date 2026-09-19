# ADR — calendario manual opcional de entrenamiento

## Problema comprobado en código y capturas

La Home elegía siempre `plans[0].days[0]`; el horario del canon no tenía un dato real que lo sostuviera. El tab de Entrenar exportaba el componente directamente y no leía los parámetros de Expo, por lo que un enlace a otro plan podía terminar mostrando el primero.

## Decisión

Un día de rutina admite `schedule?: {weekdays: number[], time: string | null}`. Días ISO 1–7; la hora opcional es local, formato HH:MM. Vacío significa orden flexible, no una alarma implícita. Son datos manuales gratuitos con validación cliente/servidor y persistencia de borradores incompletos. Dos rutinas a igual hora siguen visibles, sin descartar una ni imponer una duración inventada.

`nextWorkout` elige la siguiente ocurrencia pendiente por fecha, hora y orden estable del plan. Si no hay horarios, rota entre los días flexibles después de una sesión finalizada cuyo `planDayId` esté explícitamente registrado. Las sesiones antiguas sin ese campo no se adjudican a un día por tener un título similar. La fecha seleccionada gobierna el contenido; una sesión activa conserva prioridad.

El tab lee parámetros escalares reales mediante `useLocalSearchParams`. Ver rutina mantiene el navegador nativo y abre el día solicitado, sin registrar nada. Mi semana muestra por separado lo planificado y lo realizado.

## Tiempo, integridad y compatibilidad

El horario sigue la zona de perfil que el usuario ve. No crea una fecha UTC, notificación, sesión, cuota ni crédito de jardín; al viajar es el mismo horario local. El calendario del jardín conserva sus fronteras/semilla/política fijadas por servidor. Se muestran ambas reglas por separado.

Campos opcionales en documentos JSON existentes: no requieren reescribir registros históricos ni nuevos defaults. El servidor valida semana y hora; una actualización inválida no reemplaza el último plan. El snapshot de sesión conserva `planDayId` aun si el plan se edita o borra. La programación aparece en la fixture visual únicamente como dato de prueba aislado.

## Evidencia

Pruebas unitarias de calendario, compatibilidad, fechas y no mutación; pruebas de componentes con SQLite (borrador, hora inválida, Home → ruta de plan, tab → sesión); integración API/SQL con dos usuarios y esquema. Estas pruebas no sustituyen el recorrido posterior en un binario nativo ni acreditan notificaciones, que no se programan aquí.
