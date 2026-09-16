# Integración de salud — estado de implementación

Módulo Expo local CukiHealth con Swift/HealthKit y Kotlin/Health Connect 1.1.0. Autolinking de ambos sistemas comprobado en el entorno de desarrollo; compilación y permisos reales pendientes de la siguiente CI. No es una validación médica.

Lee peso y consulta actividades por separado, únicamente después del consentimiento y permiso de sistema. Apple no revela los permisos de lectura: una lista vacía no se interpreta como rechazo ni como historial vacío definitivo. La consulta inicial limita a 30 días, señala truncación y no elimina datos por ausencia. Las actividades externas son referencia, no sesiones acreditables de CUKI.

Importación de pesos explícita: conserva procedencia, ID de fuente y fecha local; guarda marcador de deduplicación/medida/outbox en una sola transacción. Respeta cambios/eliminaciones manuales y separa cuentas. Una cuenta que cambia durante permisos/importación cancela la operación anterior. Las medidas importadas se sincronizan solo en la cuenta CUKI conectada, con aviso previo; no hay publicidad ni lecturas de GPS/ritmo cardíaco/historia clínica.

Exportación desde resumen: permiso de escritura separado, sesión finalizada, ID/versión estable, confirmación nativa antes de marcar éxito. No se inventan calorías. Se exporta intervalo completo, incluidas pausas; actividad strength solo cuando todos sus ejercicios tienen esa modalidad; el resto usa other. Los identificadores/versiones de HealthKit y Health Connect permiten reintentar sin duplicar la misma sesión.

Doce tests del dominio/SQLite verifican importación, deduplicación, corrección, aislamiento, aceptación, rechazo y reintentos con puertos nativos de prueba. No acreditan la hoja real de HealthKit o Health Connect. La prueba en dispositivo debe revocar permisos, reconsultar, repetir exportación y verificar el registro real. No conceder permisos mediante un bypass ni usar datos del propietario para pruebas.

Las capacidades de HealthKit deben pertenecer al App ID al distribuir una app firmada. El perfil actual es de simulador/QA; no es un IPA para iPhone ni una publicación en tienda.
