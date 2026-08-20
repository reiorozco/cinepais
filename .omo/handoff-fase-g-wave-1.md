# Fase G — Handoff de la Ola 1

**Plan:** `.omo/plans/cinepais-phase-6-posters.md` · **Rama:** `phase-6-posters` (sin publicar)
**Cierre:** 2026-08-20 · **Todos 1–11 completos.** Ola 2 = Todos 12–16.

---

## 1. Qué se entregó

Dos problemas, una fase: el catálogo ya no depende de imágenes externas, y `/films` ya no puede
contradecir su propio badge de estado.

### Arte de las carátulas (Todos 2–6)

- **`web/scripts/generate-posters.ts`** (332 líneas) — generador determinista de SVG. Sin dependencia
  nueva: sólo la librería estándar de Node y el toolchain existente. Campo oscuro cinematográfico,
  título en el tercio inferior, grano (`feTurbulence`) + viñeta, paleta según el primer género.
- **`web/public/posters/film-01…10.svg`** — 10 carátulas, ya commiteadas aparte en `af824c4` (Todo 4).
- **`web/prisma/seed.ts`** — `FilmSeed` / `FILMS` exportados en el sitio (no extraídos a otro archivo:
  eso habría movido 100 líneas de datos sin ganancia); `posterUrlFor()` ahora emite `/posters/film-XX.svg`.
- **`web/next.config.ts`** — se eliminó la clave `remotePatterns` completa, no sólo la entrada de
  `placehold.co`. Dejar `remotePatterns: []` habría sido configuración muerta; ausente y `[]` son
  idénticos en Next, y ya no queda ninguna fuente de imagen remota en la app.
- **`web/tests/poster-generation.test.ts`** (91 líneas, ~400 ms) — guardia de deriva. Ejecuta el
  generador como **subproceso `tsx`**, nunca como import, porque `generate-posters.ts` llama a `main()`
  a nivel de módulo: importarlo dentro de vitest sería un arma cargada apuntando a `public/posters/`.

### Coherencia del catálogo (Todos 7–10)

- **`web/src/components/films/film-tabs.ts`** (78 líneas) — `FILM_TAB_COPY` es un
  `Record<Film["status"], FilmTabCopy>` **total**; el arreglo ordenado `FILM_TABS` se **deriva** de él.
  Un cuarto estado no compila hasta que alguien le escriba su copy — que es exactamente la clase de
  defecto que esta fase existe para matar.
- **`web/src/app/films/page.tsx`** — las tres pestañas (triggers *y* paneles) salen de `FILM_TABS`.
  `grep '"cartelera"\|"pronto"\|"preventa"' films/page.tsx` ya no devuelve nada.
- **`web/src/components/films/film-grid-client.tsx`** — copy de vacío por pestaña
  (`emptyTitle`/`emptyDescription` + `cityEmptyTitle`/`cityEmptyDescription`), más **la corrección de
  visibilidad** descrita en §4.
- **Fixtures** (`web/tests/schemas.test.ts`, `agent/tests/test_mcp_server.py`,
  `agent/tests/test_api_client.py`) — la URL vieja reemplazada en los 6 sitios. `agent/src/` intacto.

---

## 2. Medidas reales

### El gate de cierre (2026-08-20, en este orden, sin solaparse)

| Paso | Comando | Exit | Medida |
|---|---|---|---|
| (a) | `uv run ruff check .` | **0** | `All checks passed!` |
| (a) | `uv run basedpyright` | **0** | `0 errors, 0 warnings, 0 notes` |
| (a) | `uv run pytest tests/ -m "not evals" -q` | **0** | `158 passed, 1 skipped, 15 deselected in 10.73s` |
| (b) | `pnpm lint` | **0** | eslint sin hallazgos |
| (c) | `npx tsc --noEmit` | **0** | 0 errores |
| (d) | `pnpm test` (desprendido) | **0** | `Test Files 14 passed (14)` · `Tests 178 passed (178)` · 174.24 s (244 s de reloj) |
| (e) | `bash web/scripts/reseed.sh` | **0** | **91 s**, `businessDate 2026-08-21 -> 2026-08-27`, 672 funciones, 119 280 sillas |
| (f) | `curl …/api/showtimes?filmId=film-01` | **0** | **87 funciones**, 19 315 bytes, 10 películas |
| (g) | `pnpm build` | **0** | `Compiled successfully in 478ms`, 10/10 páginas estáticas |

**Conteo de tests web: 178** (14 archivos). La línea base del Todo 1 era 162 por conteo estático con
grep; la diferencia no es regresión — `test.each` registra un caso por película, así que el grep de
plantillas subcuenta. 178 es la cifra honesta medida en una corrida real; es la primera vez en la fase
que se corrió la suite completa.

### Las carátulas

10 archivos, **22 413 bytes en total (21.89 KiB)** — 10.9 % del techo de 200 KB.

| Archivo | Bytes | Archivo | Bytes |
|---|---|---|---|
| film-01.svg | 2066 | film-06.svg | 2106 |
| film-02.svg | 2319 | film-07.svg | 2247 |
| film-03.svg | 2268 | film-08.svg | 2387 |
| film-04.svg | 2395 | film-09.svg | 2286 |
| film-05.svg | 2291 | film-10.svg | 2048 |

⚠️ `du -sh` reporta `40K` para este directorio — son 10 × 4 KiB de bloque asignado, no contenido. La
suma de `ls -l` es la cifra correcta.

### Qué película cae en qué pestaña (de `FILM_STATUS`, `seed.ts:201-212`)

| Pestaña | N | Películas |
|---|---|---|
| **Cartelera** | 6 | film-01 *La Odisea* · film-02 *Sombras del Puente* · film-03 *El Corazón del Bosque* · film-04 *Códigos Rotos* · film-05 *La Última Estrella* · film-06 *Cielo Vacío* |
| **Pronto** | 2 | film-07 *Vientos del Sur* · film-08 *Espejo Roto* |
| **Preventa** | 2 | film-09 *El Guardián de Nubes* · film-10 *Marea Alta* |

Particiones disjuntas y exhaustivas: 6 + 2 + 2 = 10. `film-01` y `film-02` están fijadas por
`SCENARIO_ANCHORS` y no deben cambiar de estado.

### Guardas de alcance (verificadas en el cierre)

- `git diff main --name-only -- agent/src/ | wc -l` → **0** (lógica del agente intacta)
- `git diff main -- web/package.json | wc -l` → **0** (ninguna dependencia de runtime nueva)
- `grep -rn "placehold\.co"` acotado a fuente propia → **0** (control positivo: `posterUrl` en `web/src` → 46)
- Gasto LLM: **0 llamadas a `/chat`** (presupuesto de la fase: 0)

---

## 3. Trampas ya pagadas — no volver a pisarlas

1. **🔴 `grep -rn "placehold"` es una máquina de falsos positivos.** El comando literal del plan
   devuelve **585 líneas**, no ~7: la palabra inglesa `placeholder` contiene `placehold`, y ni
   `web/node_modules/` (111 archivos) ni **`agent/.venv/lib/python3.12/site-packages/`** (~110) están
   excluidos. Sólo 2 de esas 585 eran el host real. Usar **`grep -rn "placehold\.co"`** o acotar a
   fuente de primera parte. Los 7 aciertos de `placehold**er**` en `web/src` (clases Tailwind, props
   `placeholder=`, comentarios) **no son una regresión.** *F2 va a chocar con esta misma trampa.*
2. **🔴 `git checkout -- <archivo>` restaura desde el ÍNDICE.** En el Todo 5 borró todo el trabajo del
   Todo 2 (`seed.ts` estaba ` M`, nunca preparado, así que el índice tenía la versión de HEAD). Se
   recuperó sólo porque el diff se había volcado a `/tmp` antes. Para cualquier QA que mute un archivo
   temporalmente: capturar `git diff` + `shasum -a 256` **antes**, preferir invertir la edición, y
   **verificar** el revert.
3. **Commitear siempre por pathspec en esta rama.** El índice está sucio por diseño (los dos archivos
   de planeación quedaron preparados desde el Todo 1). Un `git commit` pelado en el Todo 4 los habría
   barrido dentro del commit del arte. En este cierre sí se commitea todo junto — a propósito.
4. **Los SVG hacen imposible el screenshot byte-idéntico.** Chromium rasteriza `feTurbulence` de forma
   **no determinista entre cargas**: dos capturas del *mismo* código difirieron en 41 639 px, más que
   el par antes/después (28 669 px). Un SHA distinto en un screenshot con carátula **no** es evidencia
   de cambio visual. Probar con huella de texto + diff enmascarado + control del mismo código.
5. **`web/tsconfig.json:33` excluye `tests`.** Un `npx tsc --noEmit` verde no dice **nada** sobre los
   14 archivos de test. Para chequear uno hay que nombrarlo en la línea de comandos. *Decisión abierta
   de la fase* — no se arregló aquí porque metería 13 archivos preexistentes a modo estricto.
6. **`${PIPESTATUS[0]}` se expande VACÍO en este shell** (es zsh: `$pipestatus`, indexado desde 1).
   Redirigir a archivo y hacer `echo $?` en la línea siguiente, o se reporta un gate verde que nunca se
   midió.
7. **`pnpm dev` pelea con `pnpm build` por `.next/`.** Este cierre encontró un `next dev` colgado desde
   un todo previo y lo bajó antes del gate; levantó uno nuevo sólo para el paso (f) y lo volvió a bajar
   antes de (g).
8. **`tsc --noEmit --listFiles` miente con `incremental: true`.** El control positivo confiable es
   introducir un error de tipo a propósito y ver el gate ponerse rojo.

---

## 4. Desviaciones declaradas

1. **🔴 Corrección de visibilidad en `film-grid-client.tsx` (Todo 8) — un archivo que el Todo 8 no
   nombra.** El Todo 8 no podía pasar su propio QA como estaba escrito: pedía renderizar
   `<FilmGridClient>` para una partición no vacía *y* que *Espejo Roto* y *Vientos del Sur* aparecieran
   bajo Pronto. Mutuamente excluyente, por una línea — `film-grid-client.tsx:53` hacía
   `if (!cities || cities.length === 0) return false;`. `filmCityMap` se construye desde las funciones,
   y una película `pronto` tiene **cero funciones por construcción**, así que nunca es una clave y el
   filtro de ciudad la borraba. Verificado empíricamente antes de tocar nada: la primera pasada de QA
   devolvió `{ active: "Pronto", films: [] }`.
   **Arreglo:** `return false` → `return true` para el caso sin entrada. Una película sin funciones en
   ningún lado es un anuncio, no una cartelera: ninguna ciudad puede reclamarla ni excluirla. Es
   demostrablemente seguro porque dentro de `/films` una clave faltante es inequívoca (con `?format=`,
   `filteredFilms` se filtra sobre el mismo arreglo que construye el mapa; sin él, la ausencia
   significa cero funciones — no hay tercera causa). Cartelera (6) y Preventa (2) idénticas antes y
   después. **Lección:** "sin funciones" y "sin funciones en tu ciudad" son hechos distintos, y
   cualquier código que los confunda borra los títulos `pronto`.
2. **Comentario de 4 líneas en `seed.ts` (Todo 2).** El plan pedía que el diff fuera "sólo líneas de
   export/import/move". El comentario explica por qué existe el export, no cambia dato ni
   comportamiento, y sigue la convención del archivo (`FILM_STATUS`, `pickFourSlots`, `ROOM_BLOCKS`).
3. **`web/README.md:94,117` intactos a propósito (Todo 10).** La cláusula `--include='*.md'` del Todo
   10 es insatisfacible por construcción: el **Todo 15** nombra esas dos líneas exactas como su propio
   trabajo. Editarlas aquí habría dejado al Todo 15 sin señal. **Siguen ahí, esperando.**
4. **Los triggers del `TabsList` también se mapearon (Todo 8),** no sólo los `<TabsContent>` que el
   todo nombra. Dejarlos habría mantenido dos listas de estados en un mismo archivo — la deriva exacta
   que `FILM_TABS` existe para evitar.
5. **Advertencia de LCP preexistente, dejada quieta.** `/films/film-01` registra
   `Image with src "/posters/film-01.svg" was detected as the Largest Contentful Paint`. Es un `priority`
   faltante en un **consumidor de carátulas**, y §Scope OUT prohíbe editarlos. Preexistente (el mismo
   componente ya lo tenía con la URL vieja). **Va a reaparecer en el Todo 14; no es un defecto de las
   carátulas.**
6. **🔴 La ventana de carátulas rotas en producción YA EMPEZÓ — y en el sentido contrario al que
   anticipa el Todo 12.** Como hay **una sola base** (§The fourth rule), la re-siembra obligatoria del
   paso (e) corrió con el `seed.ts` de *esta rama*, así que la base de **producción** ya devuelve
   `"posterUrl":"/posters/film-06.svg"`. Pero el build desplegado sigue siendo el de `main`, que **no
   contiene** `web/public/posters/*.svg`. Verificado en vivo al cerrar la ola:
   `https://cinepais.vercel.app/api/films` → `/posters/film-06.svg` · `GET /posters/film-01.svg` →
   **404**.
   **El texto del Todo 12 está al revés:** dice que el push servirá rutas nuevas "contra una base cuyo
   `posterUrl` todavía tiene los valores viejos". No — la base se movió primero. La rotura empezó en el
   cierre de la Ola 1, no en el Todo 12, y **se cura sola en cuanto `main` despliegue con los SVG**
   (Todos 12/14), porque la base ya apunta a ellos.
   **Consecuencia para el Todo 13:** su objetivo declarado ("re-sembrar para que `posterUrl` apunte al
   arte commiteado") ya está cumplido de hecho. **Aun así hay que correrlo** — sigue siendo el paso que
   refresca la ventana de 7 días y lo verifica; no es decisión de esta ola saltárselo. Lo que cambia es
   que su criterio de aceptación (`cero` ocurrencias de `placehold`) ya se cumple *antes* de correrlo,
   así que ese criterio no da señal: **verificar el rango de `businessDate`, no el `posterUrl`.**
   El sitio es usable mientras tanto (200, catálogo con 87 funciones, agente `{"status":"ok"}`); lo
   único degradado son las imágenes.

Nada más se desvió. Ningún consumidor de carátulas fue modificado, ninguna dependencia nueva, cero
llamadas al LLM, ninguna semántica de `Film.status` ni de ocupación tocada.

---

## 5. El paso siguiente, literal

**Ola 2 = Todos 12–16.** Empezar en un chat NUEVO con `/start-work cinepais-phase-6-posters`.

El Todo 12 exige como precondición que exista
`.omo/evidence/wave-1-closed-cinepais-phase-6-posters.txt` — ya existe.

1. **Todo 12 — merge a `main` y push, en ese orden.** Antes de nada irreversible, verificar que el
   merge no deshizo la curaduría de publicación:
   `git log --oneline main -- '.omo/evidence/*' '.omo/run-continuation/*' '.omo/notepads/*' '.omo/start-work/*' '.omo/boulder.json' | wc -l` → **`0`**
   (control positivo: `git log --oneline main -- '.omo/plans/*' | wc -l` → distinto de cero).
   ⚠️ **Leer la desviación 6 antes de este todo.** La advertencia del plan está invertida: la base ya
   tiene los `posterUrl` nuevos y es el *build desplegado* el que no tiene los SVG, así que las
   carátulas **ya están rotas en vivo** (404) y el push las **arregla** en lugar de romperlas.
   Registrar igualmente si se disparó un despliegue automático, para que el Todo 14 se describa como
   re-disparo y no como el primero.
2. **Todo 13 — re-siembra de producción** para que `posterUrl` apunte al arte commiteado.
   **La operación más riesgosa de la fase**: el seed borra todo el catálogo antes de reinsertar, sin
   transacción. Una corrida muerta a la mitad deja producción **vacía, no obsoleta**. Una sola
   ejecución, cronometrada, sin nada más tocando la base. Línea base sana: 40–91 s (medido tres veces
   esta fase). **`reseed.sh:131` dice "re-run this script" cuando falla — IGNORAR ese mensaje.**
3. **Todo 14 — redesplegar y probar que las carátulas realmente se ven** en los cinco consumidores,
   también en viewport móvil. Un 200 no es una imagen renderizada. El agente **no** se redespliega.
4. **Todo 15 — poner la documentación al día.** `web/README.md:94,117` (ver desviación 3),
   README raíz, y `specs/003-demo-script.md`.
5. **Todo 16 — cierre de la Ola 2**, mismo gate estándar, incluida la re-siembra después de
   `pnpm test`, y `.omo/handoff-fase-g-final.md`.

Después de la Ola 2 queda la ola de verificación F1–F5, y luego el único paso humano que queda:
**grabar el video de la demo**.

---

## 6. Estado al cerrar

- Rama `phase-6-posters`, **2 commits sobre `main`** (`af824c4` el arte + el commit de esta ola).
- **Nada publicado:** `git ls-remote --heads origin phase-6-posters` → vacío. Publicar es el Todo 12.
- El demo local quedó **funcionando**: catálogo re-sembrado, ventana `2026-08-21 → 2026-08-27`.
- El servidor de desarrollo quedó **apagado** a propósito (pelea con `pnpm build` por `.next/`).
  El siguiente todo levanta el suyo.
