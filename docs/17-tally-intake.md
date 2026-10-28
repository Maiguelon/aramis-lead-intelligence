# Captura online con Tally, procesamiento local

Decisión: Tally Free sustituye la captura de Formspree cuando esté configurado en la web. Tally conserva las consultas mientras n8n está apagado. No se publica el puerto de n8n, no hace falta un servidor contratado y no interviene Zoho. La API de OpenAI sigue consumiendo el crédito disponible; no se presupone una cuota gratuita universal.

## Contrato de entrada

`src/tally-form.mjs` define un borrador con nombre, email o WhatsApp internacional, consulta, empresa/web/red profesional opcionales y una casilla de consentimiento obligatoria y sin preseleccionar. No añade consentimiento de marketing. El aviso permite gestionar la consulta y revisar información profesional pública relacionada; versión `aramis-contacto-2026-10-v1`. Antes del uso real, revisar el texto y la información de privacidad de la web según la operación de Aramis.

Los campos ocultos transportan formulario de origen, ruta de la página, UTM y selecciones del cotizador. Son contexto declarado por el navegador, no prueba de identidad, presupuesto ni autorización. Los precios del cotizador no son presupuesto confirmado.

La integración enlaza identificadores de preguntas de Tally con campos internos. No interpreta títulos editables como instrucciones ni acepta cadenas como `"true"` como consentimiento. La respuesta exacta de la casilla se fija después de una prueba ficticia. La fecha procede del envío registrado por Tally, no del reloj del navegador. Se rechazan registros anteriores a la versión del aviso.

La identidad del evento es SHA-256 de `tally:<formId>:<submissionId>`. Cambiar un UTM o el formulario declarado no permite repetirlo. El contacto se normaliza por email o teléfono internacional. No se reenvían a IA los enlaces privados `previewUrl`/`pdfUrl` de Tally.

## Recuperación y límites

Se aceptan únicamente instantáneas completas de respuestas completadas, con páginas consecutivas y sin envíos repetidos. Una página truncada o un error es un bloqueo visible, nunca una bandeja vacía. Se prioriza el envío pendiente más antiguo. Los eventos completados y las escrituras inciertas se excluyen de la repetición automática; solo se reintenta una lectura fallida antes de escribir, con un máximo de tres intentos. Los rechazos se registran sin datos personales para que no bloqueen los envíos siguientes.

Las claves se guardan en las credenciales cifradas de n8n. La clave de Tally hereda los permisos de la cuenta; actualmente no ofrece permisos finos de solo lectura. Usar una cuenta dedicada y una credencial separada de HubSpot y Resend. No pegar claves en el chat ni en archivos del repositorio. El ID público del formulario no es una clave.

Estado de este bloque: adaptador, definición del borrador y pruebas locales implementados. La creación del formulario, enlace de IDs, flujo de sondeo y prueba conectada se documentarán al verificarse; no se presentan como completados por estas pruebas.

Fuentes: [API gratuita](https://tally.so/help/api), [API keys y permisos](https://developers.tally.so/api-reference/api-keys), [creación de formularios](https://developers.tally.so/documentation/creating-a-contact-form), [referencia de API](https://developers.tally.so/api-reference/introduction).
