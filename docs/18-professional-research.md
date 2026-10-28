# Investigación profesional acotada

El agente 1 prepara un resumen, no evalúa el encaje. El agente 2 recomienda encaje comercial y certeza y explica sus señales. Una persona revisa la evidencia y decide el siguiente paso; no hay mensajes al prospecto, secuencias, acuerdos ni campañas automáticas.

La investigación de una persona requiere el nuevo aviso explícito de Tally. Con avisos anteriores se conserva la investigación limitada a empresa. Email, teléfono y prueba de consentimiento se excluyen del contexto de IA. Con el nuevo aviso, nombre y perfil profesional se usan únicamente cuando hay contexto de empresa o perfil aportado. No se investiga un nombre aislado.

Orden: perfil profesional o del negocio aportado → web de empresa como ancla → búsquedas con nombre y contexto profesional cuando aporten valor. No se asigna un LinkedIn por coincidencia de nombre. Un bloqueo de acceso se registra como fuente inaccesible; no permite inferir que el negocio carece de presencia o que el lead es malo. No se consultan fotos, logos, perfiles privados ni características personales sensibles.

Se registran tres dimensiones distintas:

- Identidad profesional: encontrada, ambigua, sin verificar o sin investigar; certeza y motivos. Para declarar coincidencia se exigen al menos dos identificadores distintos, uno ligado al perfil o empresa, y fuentes observadas por la herramienta.
- Cada hecho externo: sujeto (empresa/persona), certeza y URL. Un hecho de persona se rechaza si la identidad no está vinculada. Una URL inventada por el modelo no basta: debe figurar en las fuentes/citas devueltas por OpenAI.
- Encaje comercial: alto, posible, bajo o información insuficiente. Solicitar un servicio fuera de Aramis puede indicar bajo encaje. No tener presupuesto, fecha o perfil accesible solo añade incertidumbre.

Límites: dos llamadas a Responses por consulta y hasta tres llamadas a búsqueda en la investigación, contexto de búsqueda bajo y salida acotada. Los límites reducen consumo; no prometen un coste fijo ni una cuota gratuita diaria. El crédito API disponible es la referencia. Si falla la IA o no pasa la validación, se genera revisión manual con información insuficiente y baja certeza.

El texto del formulario y la web son evidencia no confiable, nunca instrucciones para la automatización. Los modelos pueden equivocarse incluso con citas; el contrato valida forma, procedencia de URLs y consistencia mínima, no certifica la verdad de cada hecho.

Fuentes técnicas verificadas: [búsqueda web, fuentes y citas en Responses](https://developers.openai.com/api/docs/guides/tools-web-search), [límites de llamadas y salida](https://developers.openai.com/api/reference/python/resources/responses/methods/create).
