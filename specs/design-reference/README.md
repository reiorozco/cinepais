# Design reference — CinePaís

Capturas de referencia + modelo de datos, tomados del portal real (CineColombia, que corre sobre **Vista OCAPI**) **solo como inspiración de layout y esquema de datos**. NO se scrapea ni se consume la API real: construimos un **mock** con marca ficticia (CinePaís) e identidad propia. Ver alcance en [`../001-cine-copiloto-boletas.md`](../001-cine-copiloto-boletas.md).

## Capturas (vistas a replicar)
| Archivo | Vista | Qué mostrar en la réplica |
|---|---|---|
| `01-home.png` | Home | Nav, selector de ciudad, carrusel de estrenos, grid de cartelera |
| `02-catalog.png` | Cartelera (`/films`) | Grid de pósters, tabs (Cartelera/Pronto/Preventa), filtros |
| `03-movie-showtimes.png` | Detalle de película | Backdrop, ficha (duración, director, reparto, sinopsis, clasificación) + sección "Horarios" con selector de fecha |
| `04-showtimes-expanded.png` | Horarios desplegados | Acordeón por cine → lista de funciones (hora, sala, formato: IMAX/2D/Doblada/Subtitulada) |
| `05-seat-map.png` | Mapa de sillas | Tarjeta de función + grilla de sillas con leyenda + botones Atrás / Seleccionar boletas |

## Modelo de datos (para el seed mock)
Derivado del esquema real observado. Reproducir esta forma con datos propios (deterministas).

- **Site (cine):** `id`, `name`, `city`, `geo{lat,lng}`, `formats[]` (IMAX, 2D, Onyx, Megasala, Dinamix, Doblada, Subtitulada).
- **Film:** `id`, `title`, `posterUrl`, `synopsis`, `durationMin`, `rating`, `director`, `cast[]`, `genres[]`.
- **Showtime:** `id`, `filmId`, `siteId`, `businessDate`, `time`, `room` (sala), `formats[]`.
- **Seat:** `seatId` con formato **`area_fila_columna`** (ej. `1_10_8`), `status` (`Available` | `Sold`), `areaCategory` (`general` | `premium` | `wheelchair` | `preferential`).
- **SeatMap summary:** `totalCount`, `availableCount`, y por área.

### Añadido nuestro (no existe en el original): calidad de silla
- Cada fila tiene un **quality tier** por distancia a la pantalla:
  - Filas de adelante (ej. A–C) = **baja** (cuello, demasiado cerca).
  - Filas del medio (ej. D–H) = **óptima**.
  - Filas de atrás/arriba (ej. I–L) = **alta** (mejor para formatos grandes tipo IMAX).
- El agente pondera **disponibilidad + N sillas contiguas + calidad**, con **equilibrio de negocio**: complace al cliente sin desanimar la compra (no pierde la venta). Ver decisión #3 de la spec.

### Leyenda del mapa (observada)
verde = seleccionada · gris = no disponible (vendida) · azul = general · negro = preferencial · ícono = silla de ruedas. Arriba: "Pantalla".

## Nota de datos reales (contexto, NO para publicar)
- Endpoints reales observados (solo referencia de forma): `ocapi/v1/films`, `.../films/{id}/availability`, `.../film-screening-dates`, `.../showtimes/by-business-date`, `.../showtimes/{id}/seat-availability`.
- Ejemplo de dolor cuantificado: función IMAX con **304 sillas, 38 disponibles**, zona premium 92→0. El usuario debe entrar función-por-función y escanear. Ese es el problema que el copiloto elimina.
- **No** incluir tokens, endpoints ni marca real en el repo público.
