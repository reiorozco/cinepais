# Single-stage Python image for the CinePaís copilot agent (Fly.io).
#
# Deliberately NO Node stage. The precedent this adapts (matchday-agent) needs
# one because its MCP server is an external npm package; CinePaís's MCP server
# is an in-repo Python module — agent.py:99-108 spawns
# `sys.executable -m cinepais_agent.mcp_server`. Starting uvicorn from
# /app/.venv/bin makes sys.executable resolve to /app/.venv/bin/python, so the
# child interpreter is the same venv that has the dependencies installed.
FROM python:3.12-slim

# uv pinned to 0.9.20 — the version that produced uv.lock (revision 3) and the
# range pyproject.toml requires for the uv_build backend (>=0.9.20,<0.10.0).
RUN pip install --no-cache-dir uv==0.9.20

# Non-root user, and WORKDIR owned by it BEFORE `uv sync` runs. If the sync
# runs as root, /app/.venv ends up root-owned and anything that later writes
# there hits "Permission denied" and crash-loops the container.
RUN useradd -m -u 1000 appuser && mkdir -p /app && chown appuser:appuser /app
WORKDIR /app
USER appuser

# Venv on PATH so build-time RUNs and the runtime CMD invoke installed entry
# points directly, never through `uv run` (which re-syncs on every start).
ENV PATH="/app/.venv/bin:${PATH}"

# .python-version pins 3.12 and the base image already provides it. Without
# this, uv may fetch its own managed CPython instead of using /usr/local/bin.
ENV UV_PYTHON_DOWNLOADS=never

# Copy instead of hardlink: the uv cache and /app can land on different
# filesystems, which otherwise emits warnings and falls back to copying anyway.
ENV UV_LINK_MODE=copy

# Precompile .pyc at build time — a pure win for Fly cold starts, since the
# machine scales to zero and pays interpreter startup on the first request.
ENV UV_COMPILE_BYTECODE=1

# Unbuffered stdio so `fly logs` / `docker logs` show startup records as they
# happen rather than after a buffer flush.
ENV PYTHONUNBUFFERED=1

# Two-step sync, step 1: third-party dependencies ONLY.
# `--no-install-project` skips the local cinepais-agent package (src/ is not
# here yet). This layer is cached across every source-only change.
# `--frozen` uses uv.lock verbatim and fails if it has drifted from
# pyproject.toml, so the deployed resolution is the committed one.
COPY --chown=appuser:appuser pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen --no-install-project

# App source. See .dockerignore for what is kept out (.env, .venv, caches).
COPY --chown=appuser:appuser . .

# Two-step sync, step 2: install the local cinepais_agent package now that
# src/ exists. Omitting this is what made the precedent's first deploy die on
# `ModuleNotFoundError` — the venv had every dependency but not the app.
RUN uv sync --no-dev --frozen

EXPOSE 8080

# Liveness probe against the /health endpoint (main.py:100-102). start-period
# covers lifespan startup, which builds the agent and probes the MCP server
# before the listener accepts traffic.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["/app/.venv/bin/python", "-c", "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=3).status == 200 else 1)"]

# Absolute venv path, never `uv run uvicorn` — `uv run` re-syncs the project on
# every container start, which is slow, needs network, and fails on a
# read-only layer. It also matters here beyond speed: this is what pins
# sys.executable to the venv interpreter the MCP subprocess is spawned with.
CMD ["/app/.venv/bin/uvicorn", "cinepais_agent.main:app", "--host", "0.0.0.0", "--port", "8080"]
