# Dominio de Fixeo

Extracto operativo de "Fixeo — Documento funcional v1", más las decisiones que cerraron sus huecos (§12). Las referencias `(documento §n)` apuntan a las secciones del documento funcional.

Si el código y este archivo se contradicen, gana este archivo. Si este archivo y el documento funcional se contradicen, mirá §12: las diferencias son deliberadas y están listadas ahí.

## 1. Vocabulario (documento §4)

| Término              | Significa                                                                              | En código                                |
| -------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------- |
| Pedido               | Lo que publica el cliente: un problema a resolver, no una orden de trabajo.            | `Pedido`                                 |
| Postulación          | Respuesta de un profesional a un pedido: mensaje, estimación opcional, disponibilidad. | `Postulacion`                            |
| Estimación           | Rango de precio orientativo, sujeto a visita. Nunca «presupuesto».                     | `estimacion_min/max/a_definir`           |
| Seleccionar / elegir | Acción del cliente que habilita el contacto. No es «contratar».                        | `profesional_seleccionado`               |
| Contacto habilitado  | Ambas partes ven el teléfono de la otra.                                               | `Contacto`, estado `contacto_habilitado` |
| Cerrar el pedido     | Declarar el desenlace.                                                                 | estado `cerrado`                         |
| Oficio               | Categoría de trabajo que declara un profesional (puede tener varios).                  | `OficioProfesional`                      |
| Zona de cobertura    | Barrios o partidos (o radio) donde acepta trabajar.                                    | `ZonaCobertura`                          |

Categorías del piloto (documento §2.3): plomería, gas, electricidad, pintura, albañilería, aire acondicionado, carpintería, cerrajería. Matrícula **obligatoria** en gas y electricidad, **recomendada** en aire acondicionado, no exigida en el resto (`categoria.requiere_matricula`).

## 2. Actores (documento §3)

- **Cliente**: publica, lee postulaciones, elige, contacta, reseña. Necesita teléfono verificado.
- **Profesional**: configura oficios y zona, ve el feed, se postula. Necesita teléfono e identidad verificados, y matrícula validada si su oficio la exige.
- **Moderador**: revisa verificaciones, pedidos en revisión o denunciados y usuarios reportados (back office).
- **Soporte**: atiende consultas, casos de contacto fallido, recupera cuentas. Solo lectura en el back office.

Una cuenta puede tener los dos perfiles y alternar (`usuario.rol_activo`). Moderador y soporte son roles de sistema aparte.

## 3. Pedido: estados (documento §5)

Flujo principal: `borrador → [en_revision] → publicado → con_postulaciones → contacto_habilitado → cerrado`. Salidas laterales: `expirado`, `cancelado`, `bloqueado`.

`en_revision` es un estado agregado por decisión D1 (§12): solo lo atraviesan los pedidos que un control automático marca o que se publican en la categoría «Otro».

| De → A                                                    | Disparador                                                                                    | Efectos                                                                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| (nada) → `borrador`                                       | Cliente autenticado abandona el asistente. Anónimo: el borrador queda solo en el dispositivo. | Tarjeta «Seguí donde dejaste».                                                                              |
| `borrador` → `publicado`                                  | Confirma, teléfono verificado y controles automáticos OK.                                     | Calcula coincidentes, avisa a los primeros 30, evento `pedido_publicado`.                                   |
| `borrador` → `en_revision`                                | Categoría «Otro», o un control automático marca el pedido.                                    | El cliente ve «Lo estamos revisando, te avisamos en unas horas». No se notifica a nadie más. Entra a AD-02. |
| `en_revision` → `publicado`                               | El moderador lo aprueba.                                                                      | Igual que una publicación normal: `publicado_en` y `expira_en` se fijan **acá**, no antes.                  |
| `en_revision` → `bloqueado`                               | El moderador lo rechaza.                                                                      | Motivo tipificado y vía de apelación.                                                                       |
| `en_revision` → `cancelado`                               | El cliente cancela mientras espera revisión (D12).                                            | Igual que cancelar desde `publicado`: sin postulaciones que avisar todavía.                                 |
| `publicado` → `con_postulaciones`                         | Llega la primera postulación.                                                                 | Push + WhatsApp al cliente.                                                                                 |
| `publicado` / `con_postulaciones` → `contacto_habilitado` | El cliente selecciona la **primera** postulación.                                             | Crea `Contacto`, revelado simultáneo, avisos (ver §4). Fija `cierre_automatico_en` a +14 días.              |
| `contacto_habilitado` → `cerrado`                         | El cliente declara el desenlace, o llega `cierre_automatico_en`.                              | Invitación a reseñar si hubo trabajo.                                                                       |
| `publicado` / `con_postulaciones` → `expirado`            | 7 días desde `publicado_en` sin ninguna selección (job).                                      | Postulaciones abiertas → `caducada`. Opción de republicar en un toque.                                      |
| `publicado` / `con_postulaciones` → `cancelado`           | El cliente cancela.                                                                           | Postulaciones abiertas → `caducada` y aviso a los postulantes.                                              |
| estado activo → `bloqueado`                               | Moderación, por denuncia o contenido inadecuado.                                              | Sale del feed; el cliente ve el motivo y cómo apelar.                                                       |

Reglas del ciclo:

- El pedido **solo se edita hasta la primera postulación**.
- El cliente **cancela desde `publicado`, `con_postulaciones` o `en_revision`** (D5, D12). Desde `contacto_habilitado` la salida es declarar el desenlace; «ya no lo necesito» cierra el pedido.
- Moderación puede **bloquear en cualquier estado activo**, incluido `contacto_habilitado` (D5).
- Selección múltiple: el pedido **entra una sola vez** a `contacto_habilitado`, con la primera selección. Las selecciones 2 y 3 crean otro `Contacto` sin cambiar el estado (D2, D3).
- Controles automáticos al publicar: datos de contacto en el texto, contenido fuera de catálogo, duplicados del mismo cliente. Un control que salta manda el pedido a `en_revision`, no lo rechaza.
- Desenlaces que puede declarar el cliente: **lo hizo este profesional** (pide reseña y cierra) · **lo hizo otro** (cierra sin reseña) · **ya no lo necesito** (cierra sin reseña) · **todavía no lo resolví** (no cierra, ver D4).

## 4. Postulación: estados (documento §5.1)

`enviada → vista → seleccionada`, o `descartada`, `retirada`, `caducada`.

- `vista`: el cliente la abrió.
- `descartada`: la descarta el cliente; **reversible durante 24 h**.
- `retirada`: la genera el profesional. Retirarse seguido afecta su reputación.
- `caducada`: la genera el sistema. No afecta reputación.
- Rechazar después de ser elegido queda registrado y, si se repite, baja la prioridad en el feed.

**Qué pasa con las no elegidas cuando el cliente elige a alguien** (D2):

| Momento                                                           | Estado de las demás        | Qué se le avisa al profesional                                                                                                                                 |
| ----------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selección 1 o 2, quedando cupo de elegibles                       | Siguen `enviada` o `vista` | Push: «El cliente ya eligió a un profesional, pero tu propuesta sigue en juego». En PR-05 aparecen como «El cliente eligió a otro; todavía podés ser elegido». |
| Se completa el cupo de 3 elegidos                                 | `caducada`                 | Push: «El cliente ya completó su elección».                                                                                                                    |
| El pedido pasa a `cerrado`, `expirado`, `cancelado` o `bloqueado` | `caducada`                 | Aviso solo en `cancelado` (lo pide el documento).                                                                                                              |

Nunca se le dice a un profesional que «el pedido se cerró» mientras siga pudiendo ser elegido. Esta es la diferencia deliberada con el texto de documento §7.4.

## 5. Parámetros de negocio (documento §11.1 y decisiones §12)

Todos viven en la tabla `parametro_negocio` y se leen con `ParametrosService`. Los valores son iniciales y van a cambiar durante el piloto.

| Clave                                   | Valor                            | Nota                                                                                         |
| --------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| `postulaciones_max_por_pedido`          | 8                                | Cupo del pedido.                                                                             |
| `postulaciones_max_por_profesional_dia` | 10                               | Es la palanca de monetización futura.                                                        |
| `pedidos_activos_max_por_cliente`       | 3                                | Cuentan `borrador`, `en_revision`, `publicado`, `con_postulaciones` y `contacto_habilitado`. |
| `seleccionables_max_por_pedido`         | 3                                |                                                                                              |
| `pedido_vigencia_dias`                  | 7                                | Desde `publicado_en`.                                                                        |
| `cierre_automatico_dias`                | 14                               | Desde el primer contacto.                                                                    |
| `postergacion_desenlace_dias`           | 7                                | «Todavía no lo resolví» corre el cierre una sola vez (D4).                                   |
| `notificados_iniciales`                 | 30                               | Profesionales avisados al publicar.                                                          |
| `cuota_rotacion_porcentaje`             | 20                               | De esos 30, cuántos se reservan a perfiles nuevos (D6).                                      |
| `rotacion_resenias_umbral`              | 5                                | Menos de N reseñas = perfil nuevo para la cuota (D6).                                        |
| `aviso_sin_postulaciones_horas`         | 12                               |                                                                                              |
| `consulta_contacto_horas`               | 48                               | «¿Pudiste contactarte?».                                                                     |
| `consulta_desenlace_dias`               | 7                                | Desde el primer contacto.                                                                    |
| `aviso_expiracion_dia`                  | 6                                | Push «tu pedido se cierra mañana».                                                           |
| `descarte_reversible_horas`             | 24                               |                                                                                              |
| `descripcion_min` / `descripcion_max`   | 20 / 1000                        | Caracteres.                                                                                  |
| `fotos_max`                             | 6                                | Solo fotos: el video queda fuera de la v1 (D8).                                              |
| `limite_diario_zona_horaria`            | `America/Argentina/Buenos_Aires` | El día del límite corre de medianoche a medianoche local (D7).                               |

## 6. Coincidencia y feed (documento §11.2, PR-02)

Un profesional recibe un pedido si: su oficio incluye la categoría, su zona cubre la ubicación, su verificación está aprobada y su perfil no está pausado.

**Aviso inicial** al publicar, `notificados_iniciales` profesionales en total (D6):

1. Se reserva `cuota_rotacion_porcentaje` de los cupos (20 % de 30 = 6) para perfiles con menos de `rotacion_resenias_umbral` reseñas, ordenados por cercanía.
2. Los cupos restantes se ordenan por un puntaje que combina cercanía, promedio de reseñas y tasa de respuesta.
3. Si no hay suficientes perfiles nuevos para llenar la cuota, los cupos sobrantes van al grupo general. Nunca se avisa a menos profesionales por no poder llenar la cuota.

Otras reglas del feed:

- Los pedidos de emergencia se destacan y amplían el radio de aviso.
- Feed del profesional: antigüedad descendente con los urgentes arriba. Sin orden pago en la v1. Filtros: oficio, distancia, urgencia, con fotos, sin postulaciones. Distintivo en pedidos con menos de 3 postulaciones.
- Un profesional sin verificación aprobada **ve** el feed pero **no puede postularse**.
- Un pedido en `contacto_habilitado` **sigue en el feed** mientras quede cupo de elegibles y de postulaciones, marcado como «el cliente ya eligió a alguien» (D2, D3). Sale del feed cuando se completan los 3 elegidos o el pedido se cierra.

## 7. Visibilidad de datos (documento §11.3)

| Dato                            | Antes de la selección   | Después                 |
| ------------------------------- | ----------------------- | ----------------------- |
| Teléfono del cliente            | Oculto                  | Visible para el elegido |
| Dirección exacta                | Solo barrio o localidad | Visible para el elegido |
| Nombre del cliente              | Nombre de pila          | Completo                |
| Teléfono del profesional        | Oculto                  | Visible para el cliente |
| Nombre y perfil del profesional | Completo                | Completo                |

«El elegido» es cada profesional con un `Contacto` propio: elegir a un segundo no le revela nada al primero, ni al revés. El revelado es simultáneo. Piso y departamento nunca son públicos. Los teléfonos, emails y usuarios de redes en texto libre (descripción, mensaje de postulación) se detectan y se advierte o bloquea con el motivo a la vista.

## 8. Reseñas (documento §11.5)

- Solo reseña el cliente cuyo pedido llegó a contacto habilitado; **una por contacto**, así que un pedido con 3 elegidos admite hasta 3 reseñas, pero solo del profesional que declaró que hizo el trabajo.
- Se publica con nombre de pila, inicial del apellido, categoría y fecha. Puntaje 1 a 5, atributos (puntual, prolijo, claro con el precio) y comentario opcional.
- El profesional puede responder **una vez**, públicamente.
- Se puede denunciar una reseña; se oculta mientras se revisa solo si alega datos personales o agresión.
- No se borran reseñas negativas a pedido del profesional.
- El monto final declarado es privado y solo alimenta rangos de referencia.
- Sin reseñas se muestra «Nuevo en Fixeo» con la fecha de verificación, nunca un cero.

## 9. Notificaciones y jobs (documento §12)

| Evento                                    | Para        | Canal           | Momento                                                             |
| ----------------------------------------- | ----------- | --------------- | ------------------------------------------------------------------- |
| Pedido nuevo que coincide                 | Profesional | Push            | Al publicar (o al aprobarse en AD-02)                               |
| Primera postulación                       | Cliente     | Push + WhatsApp | Al llegar                                                           |
| Te eligieron                              | Profesional | Push + WhatsApp | Al seleccionar                                                      |
| Contacto habilitado                       | Cliente     | Push            | Al seleccionar                                                      |
| El cliente eligió a otro, seguís en juego | Profesional | Push            | Al seleccionar (D2)                                                 |
| El cliente completó su elección           | Profesional | Push            | Al llenarse el cupo de 3 (D2)                                       |
| Verificación resuelta                     | Profesional | Push            | Al resolver el moderador                                            |
| Pedido aprobado o rechazado en revisión   | Cliente     | Push            | Al resolver el moderador (D1)                                       |
| Sin postulaciones                         | Cliente     | Push            | 12 h                                                                |
| ¿Pudiste contactarte?                     | Cliente     | Push            | 48 h desde el primer contacto                                       |
| ¿Cómo terminó?                            | Cliente     | Push            | Día 7 desde el primer contacto, y una sola vez más si postergó (D4) |
| Pedido por expirar                        | Cliente     | Push            | Día 6                                                               |

WhatsApp **solo** en los dos eventos que definen el negocio, con plantillas aprobadas. El profesional puede pausar los avisos de pedidos nuevos por franja horaria; los avisos sobre sus propias postulaciones no se pueden apagar. Existe una lista unificada en la app (CO-05), por lo que toda notificación se persiste en `notificacion`.

## 10. Métricas y eventos (documento §14)

Objetivos iniciales: cobertura del pedido (>= 1 postulación en 6 h) > 70 %; mediana a la primera postulación < 45 min; tasa de contacto > 50 %; trabajo declarado > 40 %; finalización del asistente > 65 %; tasa de selección mediana > 15 % (si baja de 10 %, revisar el cupo de 8).

Eventos (todos con **categoría, zona y rol**): `asistente_iniciado`, `asistente_paso_completado`, `asistente_abandonado`, `pedido_publicado`, `pedido_visto_por_profesional`, `postulacion_iniciada`, `postulacion_enviada`, `postulacion_vista`, `perfil_profesional_visto`, `profesional_seleccionado`, `contacto_habilitado`, `whatsapp_abierto`, `llamada_iniciada`, `pedido_cerrado`, `resenia_publicada`, `verificacion_enviada`, `verificacion_resuelta`, `limite_alcanzado`.

## 11. Modelo de datos (documento §13)

Nombres de tablas y columnas como en el documento (`snake_case`). En TS y JSON se exponen en `camelCase`.

- `usuario`: id, telefono, nombre, apellido, email, foto_url, rol_activo, creado_en, ultimo_acceso, estado
- `perfil_profesional`: id, usuario_id, presentacion, anios_experiencia, estado_verificacion, verificado_en, pausado, tasa_respuesta, promedio_resenias, cantidad_resenias, trabajos_cerrados
- `oficio_profesional`: id, perfil_id, categoria_id, subcategorias[], matricula_numero, matricula_ente, matricula_estado, matricula_vence_en
- `zona_cobertura`: id, perfil_id, tipo (barrios | radio), barrios[], centro_lat, centro_lng, radio_km
- `categoria`: id, nombre, slug, subcategorias[], preguntas_guia[], requiere_matricula, activa
- `pedido`: id, cliente_id, categoria_id, subcategoria, descripcion, respuestas_guia, urgencia, franjas[], direccion_id, barrio, lat, lng, estado, publicado_en, expira_en, cierre_automatico_en, desenlace_postergado, desenlace, motivo_moderacion, vistas, cantidad_postulaciones, cantidad_contactos
- `foto_pedido`: id, pedido_id, url, orden, subida_en
- `postulacion`: id, pedido_id, profesional_id, mensaje, estimacion_min, estimacion_max, estimacion_a_definir, disponibilidad, estado, enviada_en, vista_en
- `contacto`: id, pedido_id, postulacion_id, orden, habilitado_en, abierto_whatsapp_en, confirmado_por_cliente
- `resenia`: id, pedido_id, contacto_id, profesional_id, cliente_id, puntaje, atributos[], comentario, monto_declarado, respuesta_profesional, publicada_en
- `verificacion`: id, perfil_id, tipo (identidad | matricula), documentos[], estado, revisada_por, motivo_rechazo, revisada_en
- `denuncia`: id, reportante_id, tipo_objeto, objeto_id, motivo, detalle, estado, resuelta_en

**Campos agregados a lo que modela el documento**: en `pedido`, `cierre_automatico_en` y `desenlace_postergado` (D4), `desenlace` (documento §7.5, no estaba en el modelo), `motivo_moderacion` (D1) y `cantidad_contactos`; en `contacto`, `orden` (1 a 3); en `resenia`, `contacto_id` (una reseña por contacto); en `oficio_profesional`, `matricula_ente` (D9).

**Entidades que el documento menciona pero no modela** (crearlas con estos nombres): `direccion` (con piso y departamento privados, y tipo de propiedad), `barrio` (catálogo, con `activo` para marcar la zona del piloto), `plantilla_mensaje` (del profesional), `notificacion`, `evento_analitico`, `parametro_negocio`, `acceso_documento` (auditoría), `refresh_token`.

Relaciones: un pedido tiene muchas postulaciones y hasta tres contactos; un contacto habilita como máximo una reseña; un perfil profesional tiene muchos oficios y una zona de cobertura.

## 12. Decisiones sobre los huecos del documento

El documento funcional dejaba estos puntos sin resolver o con partes contradictorias. Están **decididos** para poder avanzar: implementalos tal cual, sin volver a preguntar. Son revisables durante el piloto, pero se cambian editando este archivo, no improvisando en el código.

**D1 · Pedido en revisión manual.** Estado propio `en_revision`, entre `borrador` y `publicado`. Lo produce la categoría «Otro» o un control automático que marca el pedido. El moderador resuelve en AD-02: aprobar lleva a `publicado` (y recién ahí se fijan `publicado_en` y `expira_en`, así la revisión no le come días de vigencia al cliente) o rechazar lleva a `bloqueado` con motivo tipificado. Mientras espera, el cliente ve «Lo estamos revisando» y ningún profesional se entera del pedido.

**D2 · Aviso a los no elegidos.** Con selección múltiple, «el pedido se cerró» sería mentira, así que no se usa. Mientras quede cupo de elegibles, las demás postulaciones siguen abiertas y se les avisa «el cliente ya eligió a un profesional, tu propuesta sigue en juego». Pasan a `caducada` recién cuando se completan los 3 elegidos o el pedido termina. La tabla completa está en §4.

**D3 · Reabrir tras 48 h sin respuesta.** No hay estado de reapertura ni vuelta atrás desde `contacto_habilitado`. El caso de CL-10 se resuelve con lo mismo que D2: el cliente elige otra postulación mientras le quede cupo de elegibles. Si ya usó los 3, la única salida es cerrar el pedido y republicarlo.

**D4 · Desenlace «todavía no lo resolví».** No cierra el pedido. Corre `cierre_automatico_en` en `postergacion_desenlace_dias` (7) y marca `desenlace_postergado`, que solo puede pasar **una vez**. El job vuelve a preguntar en la nueva fecha y, si no hay respuesta, cierra sin reseña. Es decir: contacto en día 0, se pregunta el día 7, si posterga se pregunta el día 14 y cierra el día 21 como máximo.

**D5 · Quién puede sacar un pedido de circulación.** El cliente cancela desde `publicado`, `con_postulaciones` o `en_revision` (ver D12); desde `contacto_habilitado` declara el desenlace («ya no lo necesito» cierra el pedido). Moderación puede bloquear desde cualquier estado activo, `contacto_habilitado` incluido; en ese caso se les avisa a las dos partes.

**D6 · Cuota de rotación del feed.** 20 % de los avisos iniciales (6 de 30) reservados a perfiles con menos de 5 reseñas, ordenados por cercanía. Si no alcanzan los perfiles nuevos, los cupos vuelven al grupo general. Parametrizado en `cuota_rotacion_porcentaje` y `rotacion_resenias_umbral`.

**D7 · Renovación del límite diario.** El día corre de medianoche a medianoche en `America/Argentina/Buenos_Aires`. El contador de PR-04 muestra a qué hora se renueva.

**D8 · Video en el pedido.** Fuera de la v1: solo fotos. Subir, transcodificar, moderar y reproducir video cuesta un slice entero y el documento no muestra que mueva la aguja. Es la única función de una ficha (CL-03) que se deja afuera; si el piloto lo pide, entra después.

**D9 · Validación de matrícula.** Manual, sin integración con padrones. El profesional carga número, ente emisor, vencimiento y foto; el moderador verifica contra el padrón público que corresponda (ENARGAS en gas; colegio o municipio en electricidad) y aprueba o rechaza en AD-01. El sistema avisa el vencimiento 30 días antes y suspende el oficio cuando vence.

**D10 · Barrios del piloto.** El catálogo `barrio` se siembra con los 48 barrios de CABA y los partidos del primer cordón del GBA, cada uno con `activo`. La zona del piloto es el subconjunto con `activo = true`, editable desde AD-04 sin migración ni deploy. El código nunca tiene una lista de barrios escrita a mano.

**D11 · Reclutamiento de profesionales.** Fuera del software: el equipo los da de alta con el flujo normal de PR-01 y su verificación se prioriza a mano en AD-01. No se construye alta asistida, importación masiva ni códigos de invitación.

**D12 · Cancelar desde `en_revision`.** El texto original de D5 solo hablaba de `publicado` y `con_postulaciones`, pero CL-07 ya decía «en revisión: solo se puede cancelar», y la moderación (AD-02) no se construye hasta el slice 9: sin esta transición, un falso positivo del control automático de datos de contacto dejaba al cliente con un pedido colgado, ocupando cupo activo, sin ninguna salida. Se agrega `en_revision → cancelado` a la tabla de §3.

**D13 · El estado `borrador` no se persiste del lado del servidor.** El documento (§5) y este mismo archivo (§11) dan a entender que existe una fila `Pedido` en estado `borrador`, pero implementarlo exige columnas nulificables en un modelo con FKs `NOT NULL` (categoría, dirección, barrio) que recién se conocen al final del asistente — construir un modelo de borrador aparte es más de lo que el slice de «Publicar pedido» necesita. El asistente (CL-02 a CL-06) vive enteramente en el dispositivo (`localStorage`), para anónimos y logueados por igual; «Seguí donde dejaste» (CL-01) lee ese almacenamiento local, no una fila en la base. Si el piloto necesita continuar un borrador entre dispositivos, hay que modelarlo aparte.

Si aparece un caso que estas decisiones no cubren, ahí sí preguntá antes de inventar una regla.

## 13. Datos personales y marco legal (documento §15)

- Documentos de verificación cifrados, con acceso registrado y limitado a moderación.
- Eliminación de cuenta desde la app, con **anonimización** de reseñas (no borrado). Alcanza tambien a `evento_analitico.usuario_id`: esa tabla no tiene FK hacia `usuario` a propósito (el evento tiene que sobrevivir al borrado de la cuenta para no perder la métrica), así que el slice de eliminación de cuenta tiene que poner ese campo en `NULL` explícitamente — nada lo hace en cascada.
- Fotos sin metadatos de ubicación; dirección exacta solo tras la selección y solo para los elegidos.
- Canal de denuncia en perfil, pedido y postulación, con respuesta comprometida en 48 h. Verificación de profesionales objetivo < 24 h hábiles; revisión de pedidos en `en_revision`, objetivo < 4 h hábiles.
- Insignias con significado explicado al tocarlas (qué se verificó y cuándo).
- Los términos deben dejar claro que Fixeo pone en contacto y no presta ni supervisa el servicio, ni fija precios. Esto son criterios de producto, no asesoramiento legal: validar con un abogado antes del lanzamiento.
