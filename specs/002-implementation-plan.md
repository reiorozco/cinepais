# 002 — Plan de implementación: CinePaís (mock + agente copiloto)

> **Cómo usar este plan.** Cada **sesión** está pensada para un **chat fresco** con contexto limpio (no saturar una sola conversación). Cada sesión trae su **prompt listo para pegar** e indica qué debe leer. Empezar cada chat en **plan mode** (analizar/validar) y ejecutar tras aprobación. Spec base: [`001-cine-copiloto-boletas.md`](./001-cine-copiloto-boletas.md). Guía visual + modelo de datos: [`design-reference/README.md`](./design-reference/README.md).

## Stack (confirmado)
- **App (front+back):** Next.js (lean, App Router) + TypeScript + Tailwind + **Prisma** (SQLite en dev → Neon Postgres en deploy). Deploy en Vercel.
- **Agente:** Python + **LangGraph + MCP** + FastAPI/SSE (patrón MatchDay). Deploy aparte (Fly.io). El front lo consume vía SSE.
- **Reglas:** código y nombres en **inglés**; UI y agente conversan en **español**. Datos **mock deterministas** (seed); **sin** API real de CineColombia; **marca ficticia** (CinePaís), sin logo/nombre reales.

## Estructura de repo propuesta
```
cinepais/
  web/          # Next.js app (UI + read API + Prisma + seed)
  agent/        # Python LangGraph + MCP + FastAPI
  specs/        # 001 spec, 002 plan, design-reference/
```

## Contrato de datos (clave para paralelizar)
La **web** expone un **read API** que consumen tanto la UI como el agente (vía MCP tools) — igual que un cliente real:
- `GET /api/cities` · `GET /api/films` · `GET /api/films/:id`
- `GET /api/showtimes?filmId&city&date&format` → funciones (hora, sala, formato, siteId)
- `GET /api/showtimes/:id/seats` → mapa: `seatId` (`area_row_col`), `status`, `areaCategory`, **`qualityTier`**, + `summary`
Definir/estabilizar este contrato en la **Sesión A**. Con eso, **UI (B)** y **agente (C)** se construyen en paralelo.

---

## Secuencia de sesiones
`A` primero → luego `B` y `C` en **paralelo** (dos chats) → `D` → `E`.

| Sesión | Fase | Depende de | ¿Chat fresco? |
|---|---|---|---|
| A | 0 · Scaffold + mock data + read API | — | ✅ (arranca) |
| B | 1 · UI de compra manual ("antes") | A | ✅ |
| C | 2 · Agente (LangGraph + MCP) | A | ✅ (paralelo a B) |
| D | 3 · Integración agente ↔ UI | B + C | ✅ |
| E | 4 · Pulido + demo + post | D | ✅ |

---

### Sesión A — Fase 0: Scaffold + datos mock + read API
**Objetivo:** monorepo + Next.js lean + Prisma con **seed determinista** (sites/films/showtimes/seats con `qualityTier`) + **read API** documentado.
**Entregables:** repo `web/` corriendo; schema Prisma; seed reproducible (~2 ciudades, ~6 cines, ~8-10 pelis, formatos incl. IMAX, ~7 días, mapas con zonas + calidad); endpoints del contrato de datos; README de cómo correr/seedear.
**Prompt para pegar:**
> Proyecto CinePaís (ver `specs/001-cine-copiloto-boletas.md` y `specs/design-reference/README.md`). Estoy en la **Fase 0**. Trabaja primero en **plan mode**: analiza y valida un plan para (1) montar el monorepo con `web/` (Next.js lean + TS + Tailwind + Prisma, SQLite dev), (2) modelar el schema y un **seed determinista** siguiendo el modelo de datos del design-reference (sites, films, showtimes, seats con `seatId=area_row_col`, `status`, `areaCategory` y nuestro `qualityTier` por fila), y (3) exponer el **read API** del contrato de datos (cities, films, showtimes, showtimes/:id/seats). Código en inglés, datos en español, marca ficticia, sin API real. Cuando apruebe, implementa y deja el seed + endpoints andando.

### Sesión B — Fase 1: UI de compra manual ("antes")
**Objetivo:** replicar el flujo manual completo consumiendo el read API (esta es la experiencia "antes", con su fricción).
**Entregables:** home, cartelera, detalle+horarios, acordeón por cine, **mapa de sillas** interactivo (leyenda, sold/available, zonas), selección + **checkout simulado**. Fiel a las capturas de `design-reference/`.
**Prompt para pegar:**
> Proyecto CinePaís (lee `specs/001-...md`, `specs/002-implementation-plan.md` y `specs/design-reference/` — usa las capturas 01–05 como guía visual). Fase 0 ya está (read API + seed). Estoy en la **Fase 1**. En **plan mode**, valida un plan para construir la **UI de compra manual** en `web/` consumiendo el read API: home, cartelera, detalle de película + horarios (selector de fecha), acordeón por cine con funciones (hora/sala/formato), **mapa de sillas** (grilla `area_row_col`, leyenda, gris=vendida), selección y **checkout simulado** (sin pago real). Replica el look&feel de las capturas con identidad CinePaís. Código inglés, UI español. Al aprobar, impleméntalo.

### Sesión C — Fase 2: Agente (LangGraph + MCP) — paralelo a B
**Objetivo:** el agente que resuelve el dolor, consumiendo el read API vía MCP tools.
**Entregables:** `agent/` (Python) con **MCP tools** (`search_showtimes`, `seat_availability`, `adjacent_seats(n)`, `recommend_best`), agente **LangGraph** que pondera **disponibilidad + N juntas + calidad + equilibrio de negocio** (no desanima la compra), **FastAPI + SSE**, y evals de las consultas clave.
**Prompt para pegar:**
> Proyecto CinePaís (lee `specs/001-...md` §killer feature/decisión #3, `specs/002-implementation-plan.md` y `specs/design-reference/README.md` para el modelo de datos y la heurística de calidad). Fase 0 expone el read API. Estoy en la **Fase 2** (independiente de la UI). En **plan mode**, valida un plan para `agent/` en Python con **LangGraph + MCP + FastAPI/SSE** (patrón MatchDay): MCP tools que consultan el read API (`search_showtimes`, `seat_availability`, `adjacent_seats(n)`, `recommend_best`), y un agente que responde en español consultas NL (disponibilidad, N sillas juntas, mejor función del finde por **calidad**, sold-out), **explicando el tradeoff** y con **equilibrio cliente↔cine** (ofrece, no desanima la venta). Incluye evals de ~5 consultas tipo. Código inglés, responde en español, solo datos del mock (no inventa). Al aprobar, impleméntalo.

### Sesión D — Fase 3: Integración agente ↔ UI
**Objetivo:** copiloto dentro del sitio con HITL.
**Entregables:** widget de chat en `web/` que consume el SSE del agente; **pre-selección** de sillas recomendadas en el mapa (marcadas, no compradas) con **confirmación del usuario**; navegación guiada (el agente lleva a la función).
**Prompt para pegar:**
> Proyecto CinePaís. Fases 1 (UI) y 2 (agente SSE) están listas. Estoy en la **Fase 3**. En **plan mode**, valida un plan para integrar el **copiloto** en `web/`: widget de chat que streamea desde el agente (SSE), y **human-in-the-loop** — cuando el agente recomienda una función + sillas, la UI navega a esa función y **pre-selecciona** las sillas en el mapa (resaltadas, sin comprar), esperando la confirmación del usuario antes del checkout simulado. Lee `specs/001-...md` (escenarios 3) y `002`. Al aprobar, impleméntalo.

### Sesión E — Fase 4: Pulido + demo + post
**Objetivo:** dejarlo impecable para portafolio y grabar el contraste.
**Entregables:** escenarios seed para el demo (casos "no hay juntas", "solo primera fila", "mejor del finde"), recorrido **"antes vs. después"**, video/GIF grabado, borrador del **post de LinkedIn** (ángulo skill-story + link a Fleet AI), deploy (Vercel + Fly.io).
**Prompt para pegar:**
> Proyecto CinePaís, todo integrado (Fase 3). Estoy en la **Fase 4**. En **plan mode**, valida un plan para: (1) sembrar escenarios que hagan brillar al agente (sin N juntas, solo primera fila con alternativa, mejor función del finde por calidad, sold-out), (2) preparar el recorrido **"antes vs. después"** grabable, (3) desplegar (web→Vercel, agent→Fly.io), y (4) redactar el borrador del post de LinkedIn (skill-story: "en Fleet AI replicaba web apps para entrenar agentes; acá construí una réplica de un cine + un copiloto que arregla un dolor real de UX", con equilibrio cliente↔cine). Al aprobar, ejecútalo.

---

## Definición de "listo" (global)
Ver criterios de aceptación en la spec. En resumen: flujo manual completo hasta checkout simulado ✅; copiloto responde ≥5 tipos de consulta correctamente y **recomienda por calidad con equilibrio de negocio** ✅; pre-selección HITL sin completar pago ✅; datos deterministas sin API real ✅; recorrido "antes vs. después" grabable ✅.
