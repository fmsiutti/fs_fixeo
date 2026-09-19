# Pantallas de Fixeo

Índice operativo de las fichas del documento funcional (§8 a §10), con las decisiones de `docs/dominio.md` §12 ya aplicadas. Cada pantalla se implementa con sus tres estados **vacío, carga y error**, mobile-first a 360 px. Las rutas son una propuesta; cambiarlas está bien si se mantiene la coherencia.

Navegación del cliente: barra inferior con **Inicio · Publicar (central, elevada) · Mis pedidos**. Navegación del profesional: **Trabajos · Mis postulaciones · Mi perfil**. El cambio de rol vive en el menú de cuenta (avatar del encabezado).

## Comunes

| Código | Pantalla | Ruta | Notas clave |
| --- | --- | --- | --- |
| CO-01 | Bienvenida | `/bienvenida` | Tres placas del recorrido. Se puede publicar sin cuenta desde acá. |
| CO-02 | Ingreso con teléfono | `/ingresar` | Código de 6 dígitos con autocompletado, reenvío a los 30 s, alternativa por llamada. |
| CO-03 | Elegí tu rol | `/rol` | «Necesito un servicio» o «Trabajo en oficios». Reversible. |
| CO-04 | Permisos | (en contexto) | Ubicación y notificaciones se piden cuando hacen falta, no al abrir. |
| CO-05 | Notificaciones | `/notificaciones` | Lista unificada con enlace directo al objeto. |
| CO-06 | Mi cuenta | `/cuenta` | Datos, direcciones, avisos, cambio de rol, ayuda, cerrar sesión, eliminar cuenta. |
| CO-07 | Denunciar | (hoja modal) | Motivos tipificados + campo libre. Desde perfil, pedido y postulación. |

## Cliente

| Código | Pantalla | Ruta | Reglas y estados a no olvidar |
| --- | --- | --- | --- |
| CL-01 | Inicio | `/` | Hasta 3 pedidos activos, borradores, grilla de categorías. Vacío: solo la grilla con «¿Qué hay que arreglar?». Error: mostrar categorías igual (son estáticas). |
| CL-02 | Publicar · 1: qué necesitás | `/publicar/que` | Texto libre con sugerencia de categoría. «Otro» va a moderación manual antes de publicar. El texto pasa al paso 2. |
| CL-03 | Publicar · 2: el problema | `/publicar/problema` | 20 a 1000 caracteres, preguntas guía por categoría, hasta 6 fotos. **Sin video** (D8). Detecta teléfonos y correos y advierte. Fotos con progreso y reintento por foto. |
| CL-04 | Publicar · 3: dónde | `/publicar/donde` | Dirección con autocompletado y mapa; piso y depto nunca públicos; solo se publica el barrio. Permiso denegado: búsqueda manual. Fuera de zona: registrar interés. |
| CL-05 | Publicar · 4: cuándo | `/publicar/cuando` | Urgencia (emergencia / esta semana / sin apuro) y franjas. Emergencia: aviso de recargo y más alcance en el feed. |
| CL-06 | Publicar · 5: revisar | `/publicar/revisar` | Vista previa idéntica a la tarjeta del feed, verificación de teléfono si no hay cuenta, términos. Zona sin cobertura: publica igual con aviso. |
| CL-07 | Esperando postulaciones | `/pedidos/:id` | Profesionales avisados y vistas **reales**. A las 12 h sin postulaciones: sugerencias concretas. Editar, compartir, cancelar. **En revisión** (D1): «Lo estamos revisando, te avisamos en unas horas», sin contador ni sugerencias, y solo se puede cancelar. |
| CL-08 | Detalle y postulaciones | `/pedidos/:id` | Lista comparable, orden por relevancia, estimación o reputación. Descartar reversible 24 h. Cupo lleno: nota. Una sola postulación: no insinuar que faltan. Con 1 o 2 ya elegidos (D2): las demás siguen elegibles y se muestra cuántos lugares quedan. |
| CL-09 | Perfil del profesional | `/profesionales/:id` | Insignias, promedio y distribución, galería, zona, tasa de respuesta. Sin reseñas: «Nuevo en Fixeo». Denunciar. |
| CL-10 | Contacto habilitado | `/pedidos/:id/contacto` | Un bloque por profesional elegido (hasta 3), cada uno con teléfono, WhatsApp con mensaje prellenado, llamar y copiar. Tres consejos de seguridad. A las 48 h sin respuesta: ofrecer elegir a otro **si queda cupo**; si ya usó los 3 (D3), ofrecer cerrar y republicar. |
| CL-11 | Cerrar y reseñar | `/pedidos/:id/cerrar` | Desenlace (4 opciones); si hubo trabajo, elegir cuál de los elegidos lo hizo. Estrellas, atributos, comentario y monto final privado. «Todavía no lo resolví» (D4) no cierra: avisa que se vuelve a preguntar en una semana, y solo se puede postergar una vez. Se puede omitir. |

## Profesional

| Código | Pantalla | Ruta | Reglas y estados a no olvidar |
| --- | --- | --- | --- |
| PR-01 | Armado del perfil | `/perfil/armar` | Datos, oficios, zona, identidad, matrícula. Barra de avance permanente. Sin identidad no postula; sin matrícula no postula en gas ni electricidad. |
| PR-02 | Feed de trabajos | `/trabajos` | Tarjetas con barrio, distancia, urgencia, antigüedad, postulados. Vacío distinto de vacío por filtros. Verificación pendiente: feed visible, postulaciones bloqueadas. |
| PR-03 | Detalle del pedido | `/trabajos/:id` | Sin datos del cliente más allá del nombre de pila. Guardar, ocultar, denunciar. Cupo de postulaciones lleno: botón deshabilitado con el motivo. **Con alguien ya elegido y cupo libre** (D2): se puede postular igual, con el aviso «el cliente ya eligió a un profesional, todavía quedan N lugares». Con los 3 elegidos: «el cliente ya completó su elección» y vuelta al feed. |
| PR-04 | Postularme | `/trabajos/:id/postularme` | Mensaje con plantillas, estimación (rango o «a definir en la visita»), disponibilidad, contador diario. Bloquea contactos en el mensaje. No perder el texto si falla. |
| PR-05 | Mis postulaciones | `/postulaciones` | Pestañas enviadas, seleccionadas, cerradas. Retirar postulación. Vacío enlaza al feed. Una postulación viva en un pedido con otro ya elegido (D2) se muestra en «enviadas» con la nota «el cliente eligió a otro; todavía podés ser elegido». |
| PR-06 | Te eligieron | `/postulaciones/:id/elegido` | Nombre completo, teléfono y dirección exacta. WhatsApp, llamar, cómo llegar, «no puedo tomarlo». Aviso si hay otros elegidos. |
| PR-07 | Mi perfil y reputación | `/perfil` | Vista previa pública, verificaciones con vencimiento, plantillas, indicadores, pausar perfil. |

## Back office (`/admin`, rol moderador o soporte)

| Código | Pantalla | Ruta | Notas clave |
| --- | --- | --- | --- |
| AD-01 | Cola de verificación | `/admin/verificaciones` | Documentos y datos declarados; aprobar o rechazar con motivo tipificado indicando qué recargar. Objetivo < 24 h hábiles. |
| AD-02 | Moderación de pedidos | `/admin/pedidos` | Dos colas: pedidos `en_revision` (D1, objetivo < 4 h hábiles) y denunciados. Aprobar publica; rechazar bloquea con motivo tipificado. |
| AD-03 | Usuarios | `/admin/usuarios` | Búsqueda, historial, suspensión, notas internas. Soporte: solo lectura. |
| AD-04 | Catálogo | `/admin/catalogo` | Categorías, subcategorías, preguntas guía, exigencia de matrícula, y **barrios activos del piloto** (D10). |
| AD-05 | Tablero | `/admin` | Métricas de `docs/dominio.md` §10 por zona y categoría. |
