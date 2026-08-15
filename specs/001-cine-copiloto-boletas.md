# 001 — CinePaís: réplica de compra de boletas + agente copiloto

> Marca ficticia de trabajo: **CinePaís** (visualmente inspirada en un portal de cine colombiano, identidad propia; renombrable). MVP de portafolio: full-stack + agéntico.

## Objetivo
Construir una web réplica *visualmente inspirada* en un portal de cine colombiano, con **datos mock**, que reproduce el flujo real de compra de boletas — y le suma un **agente copiloto** que resuelve el dolor real de UX: hoy el usuario debe entrar función por función, día por día, cine por cine, y **escanear visualmente** el mapa de sillas para saber si hay disponibilidad / sillas juntas / buena ubicación. El copiloto responde eso en **una sola pregunta en lenguaje natural**, considerando disponibilidad + adyacencia + **calidad de ubicación**.

## Historias de usuario
- Como cinéfilo, quiero preguntar en lenguaje natural (película + formato + finde + N personas) y recibir **la mejor función con N sillas juntas y bien ubicadas**, sin navegar función por función.
- Como usuario indeciso, quiero que el copiloto me **explique el tradeoff** (disponibilidad vs. calidad de silla) para decidir mejor.
- Como comprador, quiero que el copiloto me **lleve a la función y pre-seleccione** las sillas sugeridas, y yo confirmar (human-in-the-loop).
- Como visitante, quiero **también poder navegar manualmente** (cartelera → película → horarios → mapa de sillas) como en el sitio real.

## Flujos

### Happy path (con copiloto)
1. Usuario abre el sitio (cartelera) y abre el copiloto.
2. Pregunta: *"¿Dónde veo The Odyssey en IMAX este finde con 2 sillas juntas y buenas?"*
3. El agente consulta funciones (película + formato + ciudad + rango de fechas), evalúa **disponibilidad + adyacencia (N contiguas) + calidad**, y responde con **la mejor opción + alternativas + el porqué**.
4. Usuario acepta → el agente **navega a esa función y resalta/pre-selecciona** las sillas.
5. Usuario confirma → **checkout simulado** → confirmación mock.

### Flujo manual (sin copiloto)
Cartelera → película → fecha/cine/formato → mapa de sillas (vendidas en gris / disponibles) → selección → checkout simulado. (Deliberadamente reproduce la fricción actual, para el contraste "antes vs. después".)

### Sad path / edge cases
- **Sin funciones** para el criterio → el agente lo dice y ofrece la alternativa más cercana (otro día/formato/cine).
- **Hay disponibilidad pero no N juntas** → ofrece N juntas en otra función, o sillas separadas cercanas, explicando.
- **Solo sillas de baja calidad** (primera fila) → lo **advierte** y sugiere una mejor función.
- **Sold out** → informa y propone alternativas.
- **Consulta ambigua** (sin ciudad/fecha/N) → el agente pregunta **lo mínimo** para desambiguar.

## Escenarios clave (Gherkin)

**1 — Recomendación óptima considerando calidad**
- Dado que "The Odyssey" tiene funciones IMAX el sábado y el domingo en varios cines
- Y algunas funciones solo tienen sillas de primera fila (baja calidad)
- Cuando el usuario pide "2 sillas juntas y bien ubicadas este finde en IMAX"
- Entonces el agente recomienda la función que maximiza **(2 contiguas + calidad)**
- Y **explica por qué descartó** las funciones con solo primera fila.

**2 — No hay N contiguas**
- Dado que una función solo tiene sillas disponibles no contiguas
- Cuando el usuario pide 3 sillas juntas
- Entonces el agente informa que **no hay 3 contiguas** en esa función
- Y ofrece la **función más cercana** que sí las tiene.

**3 — Pre-selección con confirmación (HITL)**
- Dado que el agente recomendó la función X con sillas F10–F11
- Cuando el usuario acepta la sugerencia
- Entonces el sistema navega a la función X y **marca F10–F11 como seleccionadas (no compradas)**
- Y **espera confirmación** del usuario antes del checkout simulado.

**4 — Navegación manual equivalente**
- Dado un usuario que no usa el copiloto
- Cuando navega cartelera → película → fecha → cine → función → mapa de sillas
- Entonces ve el mapa con sillas **vendidas (gris)** y disponibles, y puede seleccionar y llegar al checkout simulado.

**5 — Máximo de sillas por compra**
- Dado que el máximo por compra son **4 sillas**
- Cuando el usuario pide 6 sillas juntas
- Entonces el agente informa que el máximo son 4
- Y ofrece 4 juntas o dividir la reserva, **sin desanimar la compra**.

**6 — No dejar sillas huérfanas**
- Dado una selección que dejaría exactamente **1 silla aislada** (entre la selección y sillas vendidas o el extremo de la fila)
- Cuando el usuario o el agente intenta esa selección
- Entonces el sistema la **impide** y sugiere una alternativa válida
- Y el agente **explica el porqué** (regla de no huérfanas).

**7 — Rechazo de off-topic (anti "LLM gratis")**
- Dado un usuario que le pide al copiloto algo ajeno al cine (ej. *"escríbeme un ensayo"*)
- Cuando envía la consulta
- Entonces el agente **rehúsa cortésmente** y reencauza al dominio de cine
- Y no genera contenido largo fuera de alcance (protege costo y marca).

## Requisitos funcionales
- **Catálogo:** cartelera (lista de películas) + detalle de película.
- **Funciones:** por película, filtrables por ciudad / cine / fecha / formato; muestran horario, sala y formato.
- **Mapa de sillas por función:** zonas (general / premium), estado (vendida / disponible), y **calidad por fila** (adelante = baja, centro = óptima, atrás/arriba = alta).
- **Selección de sillas + checkout simulado** (sin pasarela real ni auth compleja).
- **Datos mock deterministas** (seed reproducible) que modelan `sites / films / showtimes / seat-availability` con el esquema real capturado (`seatId = area_fila_columna`, `status`, zonas, calidad).
- **Agente copiloto** (chat en español) con capacidades: buscar funciones, consultar disponibilidad, encontrar **N sillas contiguas**, y **recomendar la mejor opción** ponderando disponibilidad + adyacencia + calidad + preferencias. Debe **explicar tradeoffs** y ejecutar **pre-selección** (HITL).
- El agente **no inventa datos**: solo responde desde la DB mock a través de sus herramientas.
- **Recorrido "antes vs. después"** demostrable (flujo manual tedioso vs. una pregunta al copiloto) para grabar el video/GIF.

## Reglas de negocio (core)
1. **Máximo 4 sillas por compra** (como el sitio real). Si el usuario pide más, el agente lo informa y ofrece 4 juntas o dividir la reserva.
2. **No sillas huérfanas:** una selección no puede dejar exactamente **1 silla aislada** (entre la selección y sillas vendidas, o el extremo de la fila). La UI lo valida; el agente lo respeta al recomendar. *(Encarna el equilibrio cliente↔cine: llena salas + guía al usuario.)*
3. **Precios por formato + zona + día:** IMAX/Onyx > 2D; premium > general; **día de descuento** (ej. miércoles) más barato. Habilita consultas tipo *"la función más económica del finde"*.
4. **Sillas de accesibilidad** (silla de ruedas / preferencial) reservadas para quien las necesita, con **silla acompañante**; el agente **no las recomienda por defecto**.
5. **Cutoff de tiempo:** no se pueden comprar funciones **ya iniciadas** o que empiezan en **menos de 15 minutos**.

> *Nice-to-have (si sobra tiempo):* hold temporal de sillas (~10 min), upsell suave a premium, filtro por idioma (Doblada/Subtitulada).

## Seguridad y hardening (tratar el demo como producción)
- **Tools de mínimo privilegio:** el agente solo tiene tools de cine (sin correo/navegación/ejecución/archivos). Aunque lo jailbreakeen, el daño posible es bajo. Datos mock → sin PII.
- **Scope estrecho (system prompt):** solo responde de cine/compra; **rechaza off-topic** cortésmente (evita el uso como "LLM gratis"); no revela el system prompt ni internos; **grounded** en las tools (no inventa).
- **Controles de abuso/costo:** rate limit por IP/sesión (slowapi); cap de tokens in/out; tope de consultas por sesión (mensaje amable); **budget cap + alertas** en el LLM; CORS al origen del front; agente scale-to-zero.
- **Validación + observabilidad:** validar args de las tools; moderar/acortar salida; LangSmith tracing; loguear rechazos.
- Ref: OWASP LLM01 (prompt injection) / OWASP Top-10 for Agentic Applications 2026.

## Decisiones clave (supuestos resueltos)
1. **Marca ficticia** (CinePaís), sin logo/nombre reales de CineColombia — evita suplantación; look&feel inspirado, identidad propia.
2. **Agente = copiloto integrado** (widget de chat) que recomienda **y pre-selecciona** sillas (HITL); **no completa el pago**.
3. **Killer feature = calidad de silla con EQUILIBRIO de negocio (punto medio cliente ↔ cine).** El agente pondera disponibilidad + N juntas + **calidad**, pero con **objetivo doble**: satisfacer al cliente **Y** no perder la venta (interés del cine). **Nunca desanima la compra**: siempre presenta la mejor opción real disponible y enmarca los tradeoffs de forma constructiva (*ofrece, no descarta*). Si solo quedan sillas regulares (p.ej. primera fila), las muestra con honestidad **+ una alternativa**, pero **facilita la conversión**. Ese "punto medio" cliente↔cine es lo que el sitio real no modela — y es valor de **negocio**, no solo técnico.
4. **Alcance del flujo:** home → cartelera → película → horarios → mapa de sillas → **checkout simulado**.
5. **Datos mock acotados pero creíbles:** ~2 ciudades, ~6 cines, ~8–10 películas, formatos (IMAX/2D/Onyx/Doblada/Subtitulada), ~7 días, mapas con zonas + calidad.
6. **Idioma:** producto e interfaz en **español**; código/repo en inglés.
7. **Entregable optimizado para demo/portafolio** (no producción): foco en que el flujo y el agente se vean impecables para video y repo; auth y pago simulados.
8. **Stack** (detalle en el plan): front réplica visual + backend con DB mock + **agente LangGraph + MCP** (patrón MatchDay). **LLM del agente: Gemini Flash**, provider-agnostic vía `init_chat_model`. **Deploy:** web→Vercel, db→Neon/seed, agente→Fly.io scale-to-zero, con **budget cap** en el LLM (costo ≈ gratis–pocos USD). Sin API real; datos propios.

## Fuera de alcance
- Pago real / pasarela / facturación.
- Autenticación robusta / cuentas reales.
- Consumir la API real de CineColombia o scraping en vivo (todo es mock).
- Uso de marca, logo o nombre reales de CineColombia.
- App móvil nativa · multi-idioma (solo español) · disponibilidad/concurrencia en tiempo real.

## Criterios de aceptación
- Un usuario puede completar el **flujo manual** completo hasta el checkout simulado.
- El copiloto responde correctamente ≥5 tipos de consulta contra los datos mock: disponibilidad, N sillas juntas, calidad de ubicación, "mejor función del finde", y "sold out".
- El agente **recomienda considerando calidad** (no solo disponibilidad) y **explica el tradeoff** en al menos un caso.
- El agente **equilibra satisfacción del cliente y conversión**: ante sillas "regulares" presenta la mejor opción + alternativa **sin desanimar la compra** (no pierde la venta).
- El agente puede **pre-seleccionar** sillas y dejar la **confirmación al usuario** (HITL), sin completar pago.
- Los datos son **deterministas** (misma seed → misma demo), sin llamadas a la API real.
- Se respetan las **reglas de negocio**: máximo 4 sillas/compra, no se dejan sillas huérfanas, no se venden funciones ya iniciadas.
- El agente **recomienda respetando las reglas** (máximo, no-huérfanas, accesibilidad) y responde por **precio** (formato/zona/día de descuento).
- El agente **rechaza off-topic** (no se usa como LLM general), con **rate limit** y **budget cap** activos, y sus **tools son de mínimo privilegio**.
- Existe un recorrido **"antes vs. después"** grabable para el post de LinkedIn.
