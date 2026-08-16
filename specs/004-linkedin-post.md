# 004 — Post de LinkedIn: CinePaís

Draft listo para copiar y pegar. Formato tomado como referencia de
`matchday-agent/docs/marketing/linkedin.md` (hook + contexto + highlight técnico
+ punto de negocio + links), adaptado al ángulo de este proyecto.

---

## Post — Español

```
En Fleet AI replicaba web apps completas para entrenar agentes de IA.

Acá agarré esa misma habilidad y construí CinePaís: una réplica de un
sitio de venta de boletas de cine, más un copiloto que resuelve un dolor
real de UX — encontrar buenas sillas, juntas, sin perder 5 minutos
comparando funciones.

Le preguntás en español:

  "¿Dónde veo La Odisea en IMAX este finde con 2 sillas juntas?"

Y responde en streaming (SSE) con una recomendación ya armada — sillas
elegidas por calidad (no solo disponibilidad), pre-seleccionadas en el
mapa de asientos. Vos revisás y confirmás; el copiloto nunca compra por
vos.

El stack: Next.js + Prisma del lado del sitio, un agente LangGraph sobre
MCP del lado del copiloto (4 tools de solo lectura — ni siquiera puede
navegar ni tocar el filesystem), Gemini Flash como modelo.

El punto de negocio que más me interesó resolver: el copiloto prioriza
calidad de silla, pero nunca desalienta la venta. Si la opción perfecta
no existe, ofrece la mejor alternativa disponible — nunca un "no hay
nada". Ese balance entre experiencia del cliente y conversión es, para
mí, el corazón del ejercicio.

Todo el proceso de orquestación (cómo planifiqué y ejecuté las fases del
proyecto con agentes) queda visible en el repo, en `.omo/` — una decisión
deliberada de transparencia, no un detalle que se esconde.

Honestidad ante todo: los datos son mock (determinísticos, sembrados),
"CinePaís" es una marca ficticia, y no se conecta a ningún API real de
cine ni se hace scraping de nada.

Demo en vivo: https://cinepais.vercel.app
Repo: https://github.com/reiorozco/cinepais

#LangGraph #MCP #NextJS #IA #CinePais #Portfolio
```

---

## Notas de formato

- Tono profesional pero personal, coherente con el precedente de
  `matchday-agent/docs/marketing/linkedin.md`.
- Ángulo: la historia de habilidad de `specs/002` §Sesión E — de replicar
  web apps en Fleet AI a construir esta réplica + copiloto.
- El punto de negocio (calidad de silla sin desalentar la venta) se
  nombra explícitamente, sin rodeos.
- Sin líneas de atribución. Nunca se nombra a la cadena real de cines.
