# Demo conectada y operación

## Qué incluye

Una entrada ficticia consentida se registra en HubSpot, pasa por dos análisis reales de OpenAI y termina en una nota asociada, una tarea para Miguel y una tarjeta interna enviada por Resend. No hay campañas, mensajes al prospecto ni deals automáticos. Esta guía describe la demo cerrada local; la captura desde la web mediante Tally tiene su [guía y evidencia propia](17-tally-intake.md).

El formulario nativo está en `http://localhost:5678/form/aramis-leadops`. El editor del flujo está en `http://localhost:5678/workflow/aramis-leadops-integrated`. La instancia escucha exclusivamente en `127.0.0.1`. El formulario es una interfaz para escenarios ficticios cerrados, no una vía pública para datos reales.

El reporte conectado está en `http://localhost:5678/webhook/aramis-leadops-report`; se actualiza al recargar. Su flujo separado solo lee la Data Table y no utiliza credenciales ni servicios externos. `npm run report` genera además una copia HTML/JSON local.

## Demostración de tres minutos

1. Elegir un escenario y dejar el consentimiento sin marcar. La entrada se detiene antes de IA, CRM o correo.
2. Marcar el consentimiento y procesar «Empresa pública (Aramis)». Abrir el contacto desde el resultado; mostrar la solicitud, el encaje separado de la certeza y la tarea pendiente. La consulta web puede terminar sin hechos externos; no presentar fuentes inventadas. Para el ejemplo con hechos y fuentes, mostrar la ejecución conservada del piloto IA separado (`docs/12-native-ai-pilot.md`).
3. Mostrar la tarjeta interna y abrir el mismo contacto desde su botón. El email avisa; HubSpot conserva el trabajo comercial.
4. Repetir el escenario. El resultado es `duplicate`: no vuelve a ejecutar IA, crear actividades ni enviar correo.
5. Mostrar «Vuelve el mismo contacto»: otra consulta tiene otro ID de evento, pero comparte contacto. Si ya se ejecutó, también aparecerá como duplicada.
6. Ejecutar `npm run report` y abrir `.local/reports/operating-report.html`. Explicar qué está completado, qué requeriría conciliación y qué no puede inferirse de estas métricas.

Los escenarios son `new`, `returning`, `incomplete`, `low_fit` y `public_company`. Sus identificadores son estables. No cambiar IDs para “resetear” una ejecución incierta. Una primera ejecución consume API y crea datos ficticios; las repeticiones completadas no lo hacen.

La entrada JSON equivalente es:

```powershell
$body = @{ scenario = 'public_company'; consent = $true } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:5678/webhook/aramis-leadops-demo' -ContentType 'application/json' -Body $body
```

## Contrato y almacenamiento

El núcleo normaliza email/teléfono, fuente y UTM, exige evidencia de consentimiento y genera una huella de `source_form + submission_id`. En esta demo, los datos ya normalizados se construyen desde fixtures versionadas; el navegador solo elige escenario y consentimiento. El reloj del servidor registra la recepción. Campos adicionales de un visitante no pueden cambiar destinatario, responsable, identidad o modelo.

HubSpot conserva contacto, lifecycle `lead` para nuevos contactos, responsable, nota de entrada y tarea. Un contacto existente conserva sus campos, lifecycle y responsable; no se sobrescribe información del CRM. La empresa declarada se utiliza como contexto para investigación pública y revisión; la creación/asociación automática del objeto Company queda para el siguiente alcance, con una política de dominio y conflictos aprobada. No se inventan empresas para correos personales.

Durante la inspección del registro se observó que **el propio portal** había asociado una empresa por el dominio ficticio `example.com`. Esa asociación no la crea este flujo ni verifica que sea la empresa declarada. No se cambió la configuración global del portal. Antes de usar tráfico real hay que revisar esta automatización de HubSpot y acordar cómo resolver dominios compartidos, correos personales y empresas declaradas distintas.

La Data Table guarda solo metadatos técnicos. Las ejecuciones de n8n contienen temporalmente los inputs y respuestas; la configuración local conserva siete días, hasta mil ejecuciones. No almacenar ni publicar datos reales en fixtures, capturas o exports de portfolio.

## Errores y recuperación

- Consentimiento ausente/false: rechazo sin efectos. No se interpreta como autorización de marketing.
- Identidad ambigua: detener para revisión. No fusionar contactos ni elegir el primero.
- Lectura CRM fallida: `retryable_no_write`, hasta tres ejecuciones; solo la búsqueda permite dos intentos de transporte por ejecución. No existe un bucle ilimitado.
- IA fallida, incompleta o con fuentes inválidas: `manual_fallback`, información insuficiente y certeza baja. Se conserva la tarea humana y se etiqueta la tarjeta.
- Escritura incierta en contacto, nota, tarea o correo: conservar checkpoint e IDs confirmados; detener repeticiones. Comparar el ID de entrada con HubSpot y Resend antes de resolver manualmente.
- Correo aceptado: guardar su ID y completar el evento. Confirmar entrega en Resend por separado; no afirmar lectura del destinatario.

La concurrencia de producción es uno. Las llamadas manuales/CLI no pueden superar la puerta que exige modo `webhook`. La pareja lookup/upsert **no es un bloqueo atómico para varios servidores**. Cambiar a workers, añadir otros escritores o modificar este límite exige otro mecanismo de claim. Los checkpoints reducen duplicados; no eliminan la ventana entre una escritura externa y su confirmación local.

Si hay un estado incierto, no borrar la fila ni volver a enviar el evento. Buscar el contacto y las actividades por la referencia de entrada; revisar el correo por ID/idempotency key. Completar el trabajo que falte manualmente y registrar los IDs y la resolución en la tabla con evidencia privada. La demo no ofrece un botón de reanudación automática de escrituras parciales.

## Evidencia verificada

Con n8n 2.41.7 y datos ficticios:

| Caso | Resultado observado |
| --- | --- |
| Sin consentimiento | Rechazo y cero nodos de proveedor ejecutados |
| Escenario desconocido | Rechazo y cero nodos de proveedor ejecutados |
| Dos entregas simultáneas del mismo evento | Una completa y una duplicada; mismos IDs, una sola serie de efectos |
| Primera ejecución integrada | Un error de construcción del body del segundo agente activó el fallback; contacto, nota, tarea y tarjeta interna completados; error corregido y ejecución preservada |
| Nueva consulta del mismo contacto | Contacto reutilizado; ambas Responses HTTP 200, nueva nota/tarea HTTP 201 y Resend HTTP 200 |
| Empresa pública suministrada | Dos análisis reales y apertura del sitio suministrado; esta ejecución devolvió cero hechos externos, sin inventarlos. El piloto IA separado sí produjo hechos con fuentes |
| Formulario sin consentimiento | Pantalla de rechazo; cero nodos de proveedor ejecutados |
| Servicio fuera de oferta desde el formulario | Dos análisis reales; bajo encaje y certeza alta, con nota, tarea y tarjeta; no se descarta ni contacta automáticamente |
| Persistencia tras reinicio | Los eventos completados siguen registrados y bloquean efectos repetidos |

Las pruebas automatizadas también cubren conflictos, contenido HTML no confiable, IDs inválidos, salidas IA sin evidencia, tiempos de espera, fallback y límites de reintento. Los recibos detallados y los IDs del portal permanecen en `.local/n8n/leadops-verification/`, fuera de Git.

## Reconstrucción

1. Seguir `docs/05-local-n8n.md`; guardar las tres credenciales en n8n, sin copiarlas a archivos del proyecto.
2. Ejecutar el setup de la Data Table desde el editor de n8n, en el proyecto previsto.
3. Crear `.local/leadops-config.json` con `portalId`, `ownerId`, `from`, `to` y `model`. No incluir tokens. El remitente debe pertenecer al dominio verificado del servicio.
4. Ejecutar `npm run build:n8n-integrated` y `node scripts/prepare-n8n-integrated.mjs`. El helper enlaza únicamente IDs/nombres de credenciales y comprueba el esquema. Rechaza modificaciones locales inesperadas.
5. Importar el export privado preparado en el mismo proyecto, publicar solo este flujo y reiniciar n8n si se publicó por CLI. Mantener concurrencia uno y acceso local.
6. Probar primero el rechazo sin consentimiento. Después usar un escenario ficticio, comprobar sus registros y generar el reporte.

Para el reporte conectado: ejecutar `npm run build:n8n-report`, `node scripts/prepare-n8n-report.mjs`, importar el export privado `report-ready.json` en el mismo proyecto y publicarlo. Reiniciar si se publicó por CLI. Reemplazar una versión existente requiere despublicar y revisar que no haya cambios locales; el helper comprueba el último export preparado.

## Antes de usar tráfico real

Elegir una entrada autenticada y adaptar el payload real; actualizar formulario/aviso de privacidad y conservar evidencia de consentimiento. Verificar políticas de datos, responsables y retención; revisar el criterio de encaje con ejemplos representativos; decidir deduplicación de empresas, presupuesto API, alertas de fallo y un backup fuera del disco local. Publicar requiere HTTPS, autenticación, límites y revisión de exposición. El MVP de portfolio no activa estos cambios por su cuenta.
