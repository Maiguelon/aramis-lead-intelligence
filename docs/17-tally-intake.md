# Captura online con Tally, procesamiento local

Decisión: Tally Free sustituye la captura de Formspree cuando esté configurado en la web. Tally conserva las consultas mientras n8n está apagado. No se publica el puerto de n8n, no hace falta un servidor contratado y no interviene Zoho. La API de OpenAI sigue consumiendo el crédito disponible; no se presupone una cuota gratuita universal.

## Contrato de entrada

`src/tally-form.mjs` define un borrador con nombre, email o WhatsApp internacional, consulta, empresa/web/red profesional opcionales y una casilla de consentimiento obligatoria y sin preseleccionar. No añade consentimiento de marketing. El aviso permite gestionar la consulta y revisar información profesional pública relacionada; versión `aramis-contacto-2026-10-v1`. Antes del uso real, revisar el texto y la información de privacidad de la web según la operación de Aramis.

Los campos ocultos transportan formulario de origen, ruta de la página, UTM y selecciones del cotizador. Son contexto declarado por el navegador, no prueba de identidad, presupuesto ni autorización. Los precios del cotizador no son presupuesto confirmado.

La integración enlaza los IDs de preguntas mediante los UUID de sus grupos de bloques, no los UUID de bloques de entrada individuales. Tally devuelve todos los campos ocultos como una sola respuesta objeto: se enlazan su pregunta, UUID de campo y clave de respuesta explícita. No se adivinan campos a partir de títulos editables ni se aceptan cadenas como `"true"` como consentimiento. La respuesta de la casilla debe coincidir exactamente con el texto del aviso configurado, como se verificó en la prueba real. La fecha procede del envío registrado por Tally, no del reloj del navegador. Se rechazan registros anteriores a la versión del aviso.

La identidad del evento es SHA-256 de `tally:<formId>:<submissionId>`. Cambiar un UTM o el formulario declarado no permite repetirlo. El contacto se normaliza por email o teléfono internacional. No se reenvían a IA los enlaces privados `previewUrl`/`pdfUrl` de Tally.

## Recuperación y límites

Se aceptan únicamente instantáneas completas de respuestas completadas, con páginas consecutivas y sin envíos repetidos. Una página truncada o un error es un bloqueo visible, nunca una bandeja vacía. Se prioriza el envío pendiente más antiguo. Los eventos completados y las escrituras inciertas se excluyen de la repetición automática; solo se reintenta una lectura fallida antes de escribir, con un máximo de tres intentos. Los rechazos se registran sin datos personales para que no bloqueen los envíos siguientes.

Las claves se guardan en las credenciales cifradas de n8n. La clave de Tally hereda los permisos de la cuenta; actualmente no ofrece permisos finos de solo lectura. Usar una cuenta dedicada y una credencial separada de HubSpot y Resend. No pegar claves en el chat ni en archivos del repositorio. El ID público del formulario no es una clave.

## Flujo importable y puesta en marcha

`n8n/leadops-tally.json` es un flujo nativo deshabilitado y sin credenciales. Comparte las transiciones revisadas de HubSpot, IA, nota, tarea y correo con la demo existente. Consulta cada cinco minutos, descarga hasta diez páginas de cien respuestas y procesa un envío pendiente por ejecución. Si sigue habiendo páginas al llegar al límite, se bloquea y exige revisar el rango; no omite datos silenciosamente. Para un backlog grande se amplía la estrategia de paginación antes de ponerlo en uso. El modo manual/CLI está bloqueado: la concurrencia de producción de n8n debe permanecer en uno.

Modos de operación, controlados por configuración local y nunca por el formulario:

- `inspect`: mapea y muestra estado técnico, sin guardar eventos ni llamar a CRM/IA/correo.
- `pilot`: recorre todo el sistema solo con email `@example.com` y mensaje que empiece por `PRUEBA FICTICIA:`. Otras consultas se retienen para revisión sin bloquear las pruebas ficticias que lleguen después; se conservan pendientes para una activación real posterior.
- `live`: requiere una habilitación local explícita (`YES_PROCESS_CONSENTED_INQUIRIES`); no se habilita por importar ni por recibir un formulario.

Preparación: guardar «Tally — LeadOps» en n8n; ejecutar `node scripts/prepare-tally-setup.mjs` para generar un flujo privado que crea solo un borrador y se detiene si la cuenta ya contiene formularios. No reintentar una creación incierta sin comprobar primero Tally. Después, enlazar IDs mediante `bindTallyQuestions`, comprobar una respuesta ficticia y guardar solo metadatos en `.local/tally-config.json` (`formId`, `questions`, `consentAnswer`, `noticeVersion`, `acceptFrom`). `acceptFrom` es la fecha desde la que existe ese aviso; cambiarlo requiere revisar respuestas pendientes. Si se modifica el consentimiento en Tally, revisar y versionar de nuevo este contrato antes de activar el sondeo.

`node scripts/prepare-n8n-tally.mjs` prepara la copia privada en modo inspección; `--pilot` limita efectos a datos ficticios. Vincula las cuatro credenciales por tipo/nombre exactos y valida la tabla de eventos, sin leer valores secretos. No sobrescribe un flujo activo ni cambios de usuario. Importar, publicar y reiniciar la instancia local según la guía de n8n; comprobar `POST http://localhost:5678/webhook/aramis-leadops-poll`. La petición no admite campos para cambiar el modo o inyectar un lead.

## Evidencia conectada · 28 de octubre de 2026

El formulario `4aaD4k` se creó como borrador, se revisó y se publicó para el piloto. Tally conserva el aviso sin preselección y está en español; no envía confirmaciones al prospecto. La web local usa su ID público; la versión desplegada de aramis.agency todavía no se cambió.

| Prueba | Resultado observado |
| --- | --- |
| Enviar sin marcar consentimiento | Tally bloqueó el envío con validación obligatoria |
| Contacto de la web → Tally → n8n | Origen `footer`, cinco UTM y fecha del proveedor conservados; inspección sin efectos antes del piloto |
| Consulta desde el cotizador | Origen `plan_card`; selección de 4 posts y página web conservada sin tratar tarifas como presupuesto |
| Recorrido conectado | Dos análisis reales por consulta; un contacto reutilizado, dos notas y dos tareas distintas |
| Correo interno | Dos tarjetas a `hola@aramis.agency`; ambas observadas como Delivered en Resend |
| Investigación con perfil inaccesible | Identidad sin verificar y certeza baja; sin hechos personales; encaje alto y certeza media por la solicitud explícita |
| Consulta sin empresa/perfil | Sin búsqueda de identidad por nombre; encaje evaluado con la solicitud y el plan |
| Dos sondeos posteriores | `idle / no_pending_submissions`; seis eventos totales sin cambiar IDs de efectos |

Las dos entradas Tally son `7X72Q9R` y `yX89VNx`; ambas apuntan al contacto ficticio `258710339649` en el portal `52218506`. Las evidencias técnicas con IDs y las respuestas de prueba quedan privadas en `.local/tally-verification.json`. No hay cifras de ventas ni ROI comercial medido.

Estado operativo: flujo local publicado en modo `pilot`, con sondeo cada cinco minutos mientras n8n está encendido. Solo procesa email `@example.com` y mensaje que empiece por `PRUEBA FICTICIA:`. El resto queda pendiente. Para probar otra entrada, usar un email ficticio de ese dominio, marcar el consentimiento y comenzar el mensaje con ese prefijo. Una nueva consulta del mismo email reutiliza el contacto pero genera su propia actividad; un evento ya completado no vuelve a llamar a IA ni a correo.

Verificación de código: 90 pruebas de LeadOps y tres pruebas web pasan; compilación de la web verificada. La vista de escritorio y la confirmación compacta se comprobaron en el navegador. La revisión final en móvil queda dentro de la revisión previa al despliegue; la herramienta no aplicó el ancho solicitado y no se presenta como validada.

Antes de tráfico real: revisar y desplegar la web con `NEXT_PUBLIC_LEADOPS_TALLY_FORM_ID=4aaD4k`, revisar la información de privacidad y acordar la activación del modo `live`. El despliegue web por sí solo no cambia el modo del worker. Al recrear n8n, aplicar `docker compose up -d --wait n8n` para incorporar cambios de entorno como el permiso específico `crypto`; un reinicio simple no aplica cambios de entorno. Las cuatro credenciales siguen cifradas en n8n y fuera de Git.

Fuentes: [API gratuita](https://tally.so/help/api), [API keys y permisos](https://developers.tally.so/api-reference/api-keys), [creación de formularios](https://developers.tally.so/documentation/creating-a-contact-form), [referencia de API](https://developers.tally.so/api-reference/introduction).
