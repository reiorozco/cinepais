# 003 — Guion de demo: «antes vs. después»

> Guion de rodaje para el video/GIF del portafolio. Lo ejecuta una persona frente a la pantalla.
> Duración objetivo: **2:15 – 2:30**. Dos actos: el flujo manual (ANTES) y el copiloto (DESPUÉS).
> Todo corre contra el sitio desplegado. Los datos son mock y la marca es ficticia.

- **Web:** <https://cinepais.vercel.app>
- **Agente:** <https://cinepais-agent.fly.dev>
- **Presupuesto de LLM para el rodaje: 2 llamadas `POST /chat` como máximo.** Ver §7.

---

## 0. La regla que gobierna todo este guion

El seed escribe una **ventana móvil de 7 días** que arranca en `SEED_NOW`. El id de cada función
codifica un **desfase en días** respecto de `SEED_NOW`, no una fecha:

```
st-<siteId>-<room>-<dayOffset>-<hhmm>      # web/prisma/seed.ts:423
```

De ahí salen dos consecuencias que este guion respeta en todas sus líneas:

1. **Nunca se escribe una fecha literal, ni un día de la semana literal, ni un id de función literal.**
   Todo eso caduca en cuanto alguien vuelve a sembrar. Las coordenadas se **resuelven en tiempo de
   ejecución** en el pre-vuelo (§1) y se usan como variables (`$FRONT`, `$GOOD`, `$SOLD`, `$DIA_FRONT`).

2. **La estructura sí es estable; solo se mueven las fechas.** `SEED` está fijo, y `pickFourSlots()`
   (`seed.ts:218-223`) y `computeSeatStatus()` (`:278-300`) sortean únicamente contra `SEED`.
   `SEED_NOW` solo alimenta `businessDate` (`seed.ts:415-416`). Por eso este guion puede describir
   los planos por **posición** («el segundo chip de fecha», «la función más tarde de las dos») y eso
   sigue siendo cierto después de cada re-siembra, aunque el calendario haya cambiado.

---

## 1. Pre-vuelo — obligatorio, antes de pulsar REC

Ninguno de estos comandos aparece en el video. Ejecutarlos **en orden**; todos deben salir con
código `0`. El paso P4 existe por una sola razón: el primer request al agente paga el arranque en
frío y **eso no puede quedar grabado**.

```bash
WEB_URL="https://cinepais.vercel.app"
AGENT_URL="https://cinepais-agent.fly.dev"
```

### P0 — nadie más está tocando la base

El seed borra el catálogo entero antes de reinsertarlo y no es transaccional. Si otra sesión tiene
la base, esto se detiene aquí.

```bash
pgrep -fl "prisma db seed|vitest|pnpm test" || echo "clear: no seed/test process holding the database"
```

### P1 — re-siembra, con `SEED_NOW` recalculado

`reseed.sh` recalcula `SEED_NOW` por dentro (siempre *mañana*, nunca una fecha escrita a mano),
corre el seed y **relee el rango desde la base** para reportarlo:

```bash
bash web/scripts/reseed.sh
```

Salida esperada (forma, no valores — las fechas cambian en cada corrida):

```
reseed: refreshing CinePaís demo data
  SEED:         20260801
  SEED_NOW:     <SEED_NOW>  (recomputed: tomorrow)
...
reseed: OK — demo data refreshed.
  businessDate range: <SEED_NOW> -> <SEED_NOW + 6 días>  (7 days)
  showtimes:          672
```

Tarda entre **40 s y 70 s**. No interrumpirlo.

> Si se quiere ver el `SEED_NOW` que se va a usar antes de correr nada:
> `python3 -c "from datetime import date, timedelta; print((date.today()+timedelta(days=1)).strftime('%Y-%m-%d'))"`

### P2 — el catálogo responde y no está vacío

Un 200 en la home se satisface con un catálogo vacío. Esta es la comprobación que de verdad importa:

```bash
curl -s "$WEB_URL/api/showtimes?filmId=film-01" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);console.log('showtimes for film-01:',a.length);process.exit(Array.isArray(a)&&a.length>0?0:1)})"
```

Debe imprimir un número **mayor que cero** y salir con `0`.

### P3 — calentar el agente (el plano que no puede salir en cámara)

```bash
curl -s -o /dev/null -w 'cold  http_code=%{http_code}  time_total=%{time_total}s\n' "$AGENT_URL/health"
curl -s -o /dev/null -w 'warm  http_code=%{http_code}  time_total=%{time_total}s\n' "$AGENT_URL/health"
```

Ambas deben devolver `200`. La primera paga el arranque en frío (medido: **~9 s**, y el precedente
del proyecto llegó a medir ~21 s); la segunda debe bajar a **menos de 1 s**. **Si la segunda no baja,
no grabar todavía** — repetir hasta que la máquina esté caliente.

> La máquina se vuelve a dormir sola: se observó entre **~2 y ~9 minutos** sin tráfico. El pre-vuelo
> caduca. Si entre P3 y el primer plano del Acto 2 pasan más de dos minutos, **repetir P3**.

### P4 — resolver las coordenadas de la demo en tiempo de ejecución

Esto reemplaza cualquier tentación de escribir un id o un día a mano.

```bash
# helper: día de la semana en español para un desfase, leído de la API — nunca escrito a mano
day_of () {  # uso: day_of <showtimeId>
  curl -s "$WEB_URL/api/showtimes/$1/seats" \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const st=JSON.parse(s).showtime;console.log(new Date(st.businessDate+'T12:00:00Z').toLocaleDateString('es-CO',{weekday:'long',timeZone:'UTC'}),'·',st.time,'·',st.siteName)})"
}

# las cuatro funciones IMAX de site-med-2 en el desfase 1, en orden cronológico
SLOTS=$(curl -s "$WEB_URL/api/showtimes" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);const day=id=>{const m=id.match(/-(\d+)-\d+\$/);return m?+m[1]:null};console.log(a.filter(x=>x.siteId==='site-med-2'&&x.room==='imax'&&day(x.id)===1).sort((p,q)=>p.time<q.time?-1:1).map(x=>x.id).join(' '))})")

GOOD=$(echo $SLOTS | cut -d' ' -f1)   # slot 0 — sala abierta de par en par
FRONT=$(echo $SLOTS | cut -d' ' -f2)  # slot 1 — el escenario plantado `front-only`

test -n "$GOOD" && test -n "$FRONT" || { echo "FAIL: no se resolvieron las coordenadas"; exit 1; }
echo "GOOD  = $GOOD  ->  $(day_of $GOOD)"
echo "FRONT = $FRONT ->  $(day_of $FRONT)"
```

Anotar en un papel el día de la semana que imprime `FRONT`: es el `$DIA_FRONT` que se teclea en el
Acto 2. **No inventarlo.**

### P5 — preparar la ventana

- Navegador limpio, **sin sesión de Vercel**, ventana **1440 × 900** (o 16:9 equivalente).
- Zoom del navegador al **100 %**. El mapa de sillas tiene su propio control (`0.75× / 1× / 1.25×`):
  dejarlo en `1×`.
- Cerrar notificaciones del sistema, barra de marcadores y cualquier pestaña extra.
- Selector de ciudad del header en **Medellín** (arranca en Bogotá). Los cuatro escenarios plantados
  que hacen interesante la demo viven en Medellín.
- Abrir <https://cinepais.vercel.app> y dejarla arriba del todo. **Ahora sí: REC.**

---

## 2. El escenario que se usa, y por qué

`seed.ts:232` define cuatro escenarios plantados. La demo usa **`front-only`** porque es el único que
hace visible el dolor en cámara en menos de quince segundos:

| Escenario | Dónde vive (`seed.ts:234-253`) | Qué se ve |
|---|---|---|
| `soldout` | `site-med-1` · imax · desfase 0 · slot 0 | sala entera vendida — no da plano, es un callejón sin salida |
| **`front-only`** | **`site-med-2` · imax · desfase 1 · slot 1** | **quedan 40 de 260 sillas y todas están en las dos primeras filas** |
| `optimal` | `site-med-2` · imax · desfase 2 · slot 0 | filas centrales abiertas — buen destino, mal conflicto |
| `no-adjacent` | `site-bog-1` · 2d-1 · desfase 3 · slot 0 | tablero de ajedrez: nada de a dos |

El truco narrativo: en el acordeón de horarios, `$FRONT` y `$GOOD` se ven **idénticas** — misma sede,
misma sala, mismo «Desde $ 32.000». La interfaz no da ninguna pista de que una de las dos es una
trampa. Hay que entrar a mirar. Eso es exactamente lo que el copiloto ahorra.

---

## 3. ACTO 1 — ANTES: el flujo manual (≈ 1:28)

La regla de actuación: **moverse como alguien que de verdad está buscando**, no como quien ya sabe
dónde está todo. Un titubeo corto antes de cada clic vale más que la fluidez.

| # | Plano | En pantalla | Acción | Duración |
|---|---|---|---|---|
| 1 | Home | Carrusel de estrenos + grilla de películas con pestañas **Cartelera / Pronto / Preventa** | Abrir el selector **Ciudad** del header y elegir **Medellín** | 8 s |
| 2 | Home | Pestaña **Cartelera** activa por defecto, grilla de pósters | Bajar hasta la grilla y hacer clic en **La Odisea** (sexta tarjeta; *no* está en el carrusel) | 8 s |
| 3 | `/films/film-01` | Hero, ficha técnica, sinopsis | Bajar hasta la sección **Horarios** | 6 s |
| 4 | Horarios | Fila de 7 chips de fecha, el primero seleccionado | Clic en el **segundo chip** (desfase 1) | 4 s |
| 5 | Horarios | Filtro **Formato**: `Todos · IMAX · 2D` | Clic en **IMAX** | 4 s |
| 6 | Horarios | Acordeón de sedes; solo la primera viene abierta | Clic en **CinePaís Laureles** (`2 funciones · IMAX`) para desplegarla | 5 s |
| 7 | Horarios | Las dos funciones, visualmente idénticas | Clic en **la más tarde de las dos** (`$FRONT`) | 5 s |
| 8 | **`/showtimes/$FRONT`** | **`Sillas · 40 / 260 disponibles`. Filas A y B en verde; C a M apagadas** | **Detenerse aquí. Pasar el cursor por la sala vacía. Este es el plano que justifica todo el proyecto: hay sillas, sí — pero todas pegadas a la pantalla, y la leyenda no dice una palabra sobre calidad de ubicación** | **14 s** |
| 9 | ↩ | — | **Atrás**, y clic en la **otra** función (`$GOOD`) | 8 s |
| 10 | `/showtimes/$GOOD` | Sala con ocupación realista — la mayoría de las sillas disponibles, algunas ya vendidas salpicadas por la sala (nunca `0 / N` ni `N / N`: ninguna función queda vacía ni llena) | Buscar dos sillas juntas y decentes. Elegir **fila D** (cuarta fila): clic en dos asientos contiguos. El contador pasa a `Sillas (2/4)`, total `$ 64.000` | 12 s |
| 11 | `/checkout` | «Resumen de compra», boletas, totales, aviso de demo | Clic en **Seleccionar boletas** y dejar leer el resumen | 8 s |
| 12 | `/checkout/confirmation` | «¡Boletas confirmadas!», número de orden `CP-XXXXXX`, «Esto es una demo — no se realizó ningún cobro.» | Clic en **Confirmar compra (demo)** | 6 s |

**Lo que el espectador debe haber entendido al terminar el Acto 1:** doce interacciones, dos mapas de
sillas abiertos, un callejón sin salida, y en ningún momento la interfaz dijo *qué sillas son buenas*.
Eso último no es un defecto de esta réplica: es cómo funcionan los portales de cine de verdad.

> **Rótulo sugerido en edición (sobreimpreso, sin voz):** `12 clics · 2 salas revisadas · 0 pistas sobre calidad de ubicación`

---

## 4. ACTO 2 — DESPUÉS: una sola pregunta (≈ 0:45)

| # | Plano | En pantalla | Acción | Duración |
|---|---|---|---|---|
| 13 | Home | Burbuja flotante abajo a la derecha | Clic en **Abrir el copiloto de CinePaís**. Se abre el panel: «Copiloto CinePaís / Funciones, sillas y disponibilidad», cuatro sugerencias y el aviso «Datos ficticios de CinePaís. Desde aquí no se compra nada.» | 5 s |
| 14 | Panel | Campo «Pregunta por funciones o sillas…» | **Teclear la consulta a mano** (ver abajo). No usar los chips de sugerencia: se ven pre-cocinados en cámara | 8 s |
| 15 | Panel | Chips de herramienta → tokens en streaming → **tarjeta de recomendación** | Enviar y **no tocar nada**. Llegan primero los `tool_call`, después el texto token a token, y al final la tarjeta con sede, hora, formato, `ZONA ÓPTIMA`, `2 SILLAS JUNTAS`, precio y el CTA | 16–26 s |
| 16 | Panel | CTA **Ver y confirmar sillas** | Clic | 3 s |
| 17 | **`/showtimes/<id>?preselect=<ids>`** | **Mapa de sillas con las sillas recomendadas ya marcadas en verde, el banner «Tienes N sillas pre-seleccionadas por el copiloto. Revísalas y confirma — aún no se ha comprado nada.» y el pie en `Sillas (2/4)`** | **Quedarse quieto. Este es el money shot: la tarjeta a la derecha y las sillas marcadas a la izquierda, en el mismo cuadro** | **10 s** |

### La consulta exacta que se teclea

**Consulta A — principal.** Sustituir `$DIA_FRONT` por el día que imprimió el pre-vuelo P4:

```
Quiero 2 sillas juntas para La Odisea en IMAX en Medellín el $DIA_FRONT en la noche, con la mejor vista posible.
```

Es deliberadamente **la misma pregunta que el Acto 1 acaba de resolver a mano y a ciegas**. El
copiloto tiene que enfrentar la misma sala de la trampa, y su respuesta esperada no es esquivarla
sino **nombrar el tradeoff y llevar la venta a otra parte**: recomienda una función con sillas
realmente buenas y ofrece la de las primeras filas como alternativa, marcada como calidad baja.
Nunca desanima la compra — esa es la postura de negocio del proyecto, y se ve en cámara.

El par que marca en el mapa no cae en cualquier sitio libre: el ranking centra la pareja de sillas
sobre el eje horizontal de la sala (no sobre el centro de su propio bloque) y, dentro de la banda de
calidad ganadora, sobre la fila media de esa banda — así que en una sala vacía la recomendación
aterriza en el bloque central, nunca en la esquina lateral de la primera fila.

**Consulta B — respaldo / segunda toma.** Sin ninguna referencia temporal, así que no puede caducar:

```
Quiero 2 sillas juntas para La Odisea en IMAX en Medellín, con la mejor vista posible.
```

**Qué NO teclear:** las dos consultas del Todo 31 ya están gastadas y registradas en el archivo de
gasto; repetirlas desperdicia presupuesto sin aportar un plano nuevo.

### Qué es aceptable que pase, y qué no

- **El copiloto elige otra función de la que uno esperaba:** aceptable, no es un defecto. La
  trayectoria de un LLM no es determinista; lo que la demo tiene que mostrar es que **razona por
  calidad de silla** y que el CTA pre-selecciona de verdad.
- **Alguna silla recomendada se cae al llegar al mapa:** aceptable y además interesante — el banner
  lo dice en español. La pre-selección vuelve a pasar por las reglas de negocio (máximo 4, sin sillas
  huérfanas, sillas de accesibilidad aparte), así que puede marcar menos de las pedidas.
- **La tarjeta no aparece o el stream se corta:** eso sí es un problema. Cortar, revisar §8 y
  **no quemar la segunda llamada a ciegas**.

---

## 5. Cierre

Último plano, 4 s, sin voz: volver a la home con el panel del copiloto abierto y vacío. Sirve de
frame final para el GIF.

---

## 6. Encuadre — referencias reales del repo

Tres capturas ya existentes muestran el encuadre que hay que reproducir en el plano 17. Abrirlas
antes de grabar:

| Captura | Qué enseña |
|---|---|
| [`.omo/evidence/task-14-hitl-money-shot.png`](../.omo/evidence/task-14-hitl-money-shot.png) | **El encuadre a imitar.** ~16:9. Panel del copiloto ocupando ~40 % a la derecha, mapa completo (filas A–L) legible a la izquierda, banner de pre-selección arriba y el pie con el total abajo. Tarjeta y sillas verdes en un mismo cuadro |
| [`.omo/evidence/task-16-live-hitl.png`](../.omo/evidence/task-16-live-hitl.png) | Mismo momento con la tarjeta ya con badge `Recomendado` y las etiquetas `IMAX` / `ZONA ÓPTIMA`. **Aviso:** aquí el panel se come ~45 % y el mapa queda cortado en la fila G — es el error de encuadre a evitar |
| [`.omo/evidence/task-31-cinepais-phase-4-deploy.png`](../.omo/evidence/task-31-cinepais-phase-4-deploy.png) | El mismo plano contra el sitio **desplegado**, con 4 sillas pre-seleccionadas. Referencia de cómo se ve en producción |

Regla de encuadre que sale de comparar las tres: **si el mapa de sillas queda cortado, el plano está
mal**. Bajar el zoom del mapa a `0.75×` antes que perder filas.

---

## 7. Presupuesto y barreras

- **Máximo 2 llamadas `POST /chat` en todo el rodaje.** Una toma con la Consulta A, una de repuesto
  con la B. No hay tercera.
- **Anunciar antes de cada llamada.** Es el único paso del rodaje que cuesta dinero.
- **Después de cada llamada, añadir una línea** a `.omo/evidence/llm-spend-cinepais-phase-4-deploy.txt`,
  con el mismo formato que las entradas ya existentes (timestamp · todo · endpoint · host · COLD/WARM ·
  consulta · status · duración · outcome).
- El agente tiene además un tope propio de **40 `/chat` por día UTC**, un límite por IP y un tope por
  sesión. Nada de esto debería activarse en un rodaje de dos llamadas; si aparece un mensaje de tope,
  detenerse y revisar qué más está pegándole al agente.
- **Ensayar sin gastar:** los planos 1 a 13 y el 17 no tocan el LLM. El plano 17 se puede ensayar
  entrando a mano a `/showtimes/$GOOD?preselect=<dos ids contiguos>`; el formato de `seatId` es
  `area_fila_columna`. Se puede repetir las veces que haga falta con coste cero.

---

## 8. Si algo sale mal

| Síntoma | Causa más probable | Qué hacer |
|---|---|---|
| El sitio se ve vacío, sin funciones | La ventana de 7 días quedó en el pasado | Volver a P1. Es *la* falla más probable a mitad de rodaje |
| La primera respuesta del copiloto tarda ~10-20 s de más | La máquina se durmió entre el pre-vuelo y la toma | Cortar, repetir **P3**, volver a grabar. No dejar el arranque en frío en el video |
| «No pude conectarme al copiloto…» | Fallo real de transporte, no lentitud — el widget no tiene deadline de cliente | Comprobar `GET /health`. Si responde, reintentar; si no, parar el rodaje |
| El CTA lleva a un mapa sin nada marcado | La recomendación no traía `seatIds`, o todas se cayeron por reglas de negocio | Leer el banner: lo dice en español. Vale como toma alterna, pero no es el money shot |
| Los ids del pre-vuelo ya no existen | Alguien volvió a sembrar en medio | Rehacer **P4**. Jamás copiar un id de una corrida anterior |
| El acordeón de Laureles no muestra dos funciones | Se quedó el filtro en `Todos`, o el chip de fecha equivocado | Chip **2** + formato **IMAX**. La estructura es estable entre siembras; lo que cambia son las fechas |

---

## 9. Verificado en vivo

Este guion no se escribió de memoria. El pre-vuelo completo (P0–P4) se ejecutó tal cual está escrito,
y el Acto 1 se caminó plano por plano en <https://cinepais.vercel.app> antes de darlo por bueno:
grilla de la home, cambio de ciudad, ficha de la película, chips de fecha, filtro de formato,
acordeón de sedes, los dos mapas de sillas, checkout y confirmación. Las cifras del plano 8
(`40 / 260`, filas A y B, resto apagado) son una lectura del DOM desplegado, no una estimación.
Los dos escenarios plantados que el guion menciona como coordenadas (`front-only` y `soldout`) se
verificaron contra la API de lectura, con los ids resueltos en tiempo de ejecución.

Transcripciones y códigos de salida: `.omo/evidence/task-34-cinepais-phase-4-deploy.txt`.

El guion está al día con la realidad enviada a producción: pestañas de catálogo funcionando, sillas
del copiloto centradas por el ranking (no la esquina lateral) y ocupación realista en las salas
normales. **No queda ningún bloqueador conocido para grabar.** El video se guarda **fuera del repo**;
el README enlaza a él.
