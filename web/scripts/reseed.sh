#!/usr/bin/env bash
#
# reseed.sh — one-command refresh of the CinePaís demo data.
#
# The seed writes a rolling 7-day window of showtimes starting at SEED_NOW.
# Once that window falls into the past, GET /api/showtimes returns [] and the
# demo looks broken. This script refreshes the window: it recomputes SEED_NOW
# (always tomorrow, never a hardcoded date), runs the seed, and prints the
# businessDate range the database actually ended up holding.
#
# Usage (from anywhere — the script locates the web/ directory itself):
#
#   bash web/scripts/reseed.sh
#
# Takes about a minute. Requires DATABASE_URL_UNPOOLED to be resolvable, either
# exported in the shell or present in web/.env.local (the same precedence the
# seed itself uses: a shell value wins, the env file is the fallback). If it is
# resolvable from neither, this script fails loudly and exits non-zero WITHOUT
# invoking the seed — the seed is destructive and un-transactioned, so it must
# never start against a connection string that does not exist.
#
# Overridable environment variables:
#   SEED      PRNG seed for deterministic data.        Default: 20260801
#   ENV_FILE  Env file inspected by the precondition.  Default: web/.env.local
#             Override only to exercise the failure path in tests; the seed
#             always loads web/.env.local on its own regardless of this value.
#
set -euo pipefail

readonly REQUIRED_VAR="DATABASE_URL_UNPOOLED"
readonly SEED_TZ="America/Bogota"
readonly SEED_WINDOW_DAYS=7

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly SCRIPT_DIR WEB_DIR

SEED_VALUE="${SEED:-20260801}"
ENV_FILE="${ENV_FILE:-${WEB_DIR}/.env.local}"
readonly SEED_VALUE ENV_FILE

die() {
  echo "" >&2
  echo "reseed: ERROR — $*" >&2
  exit 1
}

# Echo the raw value assigned to KEY in FILE, or nothing. Mirrors dotenv's
# "last assignment wins" behaviour and strips one layer of surrounding quotes.
env_file_value() {
  local key="$1" file="$2"
  [ -r "$file" ] || return 0
  sed -n "s/^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}${key}[[:space:]]*=[[:space:]]*//p" "$file" \
    | tail -n 1 \
    | sed -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

# --- Preflight: required tooling -------------------------------------------
for tool in python3 pnpm node; do
  command -v "$tool" >/dev/null 2>&1 \
    || die "\`${tool}\` is not on PATH. It is required to refresh the demo data."
done

# --- Precondition: the seed's connection string must be resolvable ---------
# Checked BEFORE anything else. The seed deletes the entire catalogue before
# reinserting it, so a run that starts without a usable connection string is
# strictly worse than a run that never starts.
credential_source=""
credential_length=0

if [ -n "${DATABASE_URL_UNPOOLED:-}" ]; then
  credential_source="shell environment"
  credential_length=${#DATABASE_URL_UNPOOLED}
else
  candidate="$(env_file_value "$REQUIRED_VAR" "$ENV_FILE")"
  if [ -n "$candidate" ]; then
    credential_source="$ENV_FILE"
    credential_length=${#candidate}
  fi
  unset candidate
fi

if [ -z "$credential_source" ]; then
  echo "" >&2
  echo "reseed: ERROR — ${REQUIRED_VAR} is not set." >&2
  echo "" >&2
  echo "  Looked in:" >&2
  echo "    1. the shell environment  -> not set" >&2
  if [ ! -e "$ENV_FILE" ]; then
    echo "    2. ${ENV_FILE}  -> file does not exist" >&2
  elif [ ! -r "$ENV_FILE" ]; then
    echo "    2. ${ENV_FILE}  -> file exists but is not readable" >&2
  else
    echo "    2. ${ENV_FILE}  -> file is readable, but has no non-empty ${REQUIRED_VAR}=" >&2
  fi
  echo "" >&2
  echo "  The seed needs Neon's DIRECT (non-pooled) URL. Get it with:" >&2
  echo "    cd web && vercel env pull .env.local --yes" >&2
  echo "  or export it for this shell:" >&2
  echo "    export ${REQUIRED_VAR}='postgresql://...'" >&2
  echo "" >&2
  echo "  Nothing was seeded and the database was NOT modified." >&2
  exit 1
fi

# --- Recompute SEED_NOW (always tomorrow; never a hardcoded date) ----------
# Held in SEED_NOW_VALUE, not SEED_NOW: the seed is invoked with a `SEED_NOW=...`
# environment prefix, and bash refuses to shadow a readonly variable of that name.
SEED_NOW_VALUE="$(python3 -c "from datetime import date, timedelta; print((date.today()+timedelta(days=1)).strftime('%Y-%m-%d'))")"
readonly SEED_NOW_VALUE
case "$SEED_NOW_VALUE" in
  [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
  *) die "computed SEED_NOW is not a YYYY-MM-DD date: '${SEED_NOW_VALUE}'" ;;
esac

EXPECTED_LAST="$(python3 -c "from datetime import date, timedelta; print((date.today()+timedelta(days=${SEED_WINDOW_DAYS})).strftime('%Y-%m-%d'))")"
readonly EXPECTED_LAST

echo "reseed: refreshing CinePaís demo data"
echo "  web dir:      ${WEB_DIR}"
echo "  ${REQUIRED_VAR}: resolved from ${credential_source} (${credential_length} chars)"
echo "  SEED:         ${SEED_VALUE}"
echo "  SEED_NOW:     ${SEED_NOW_VALUE}  (recomputed: tomorrow)"
echo "  TZ:           ${SEED_TZ}"
echo "  This takes about a minute. Do not interrupt it — the seed is not transactional."
echo ""

# --- Run the seed ----------------------------------------------------------
cd "$WEB_DIR"
if ! TZ="$SEED_TZ" SEED="$SEED_VALUE" SEED_NOW="$SEED_NOW_VALUE" pnpm prisma db seed; then
  die "the seed failed. The catalogue may be partially written — re-run this script before using the demo."
fi

# --- Report the businessDate range the database actually holds -------------
# Read back from the database rather than trusting SEED_NOW arithmetic, so the
# printed range can never drift from what the demo will really serve.
range_json="$(
  node --input-type=module -e '
    import { config } from "dotenv";
    config({ path: ".env.local" });
    config();
    const connectionString = process.env.DATABASE_URL_UNPOOLED;
    if (!connectionString) process.exit(3);
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString });
    await client.connect();
    const { rows } = await client.query(
      `SELECT to_char(MIN("businessDate"), \x27YYYY-MM-DD\x27) AS first,
              to_char(MAX("businessDate"), \x27YYYY-MM-DD\x27) AS last,
              COUNT(DISTINCT "businessDate")::int            AS days,
              COUNT(*)::int                                  AS showtimes
       FROM "Showtime"`
    );
    await client.end();
    console.log("__CINEPAIS_RANGE__" + JSON.stringify(rows[0]));
  ' 2>/dev/null | sed -n 's/^__CINEPAIS_RANGE__//p'
)" || true

echo ""
if [ -z "$range_json" ]; then
  # The seed succeeded; only the read-back failed. Report the derived window and
  # say plainly that it was not confirmed against the database.
  echo "reseed: OK — seed completed."
  echo "  businessDate range: ${SEED_NOW_VALUE} -> ${EXPECTED_LAST}  (${SEED_WINDOW_DAYS} days, derived from SEED_NOW)"
  echo "  NOTE: could not read the range back from the database to confirm it."
  exit 0
fi

first="$(printf '%s' "$range_json" | sed -n 's/.*"first":"\([^"]*\)".*/\1/p')"
last="$(printf '%s' "$range_json" | sed -n 's/.*"last":"\([^"]*\)".*/\1/p')"
days="$(printf '%s' "$range_json" | sed -n 's/.*"days":\([0-9]*\).*/\1/p')"
showtimes="$(printf '%s' "$range_json" | sed -n 's/.*"showtimes":\([0-9]*\).*/\1/p')"

if [ "$first" != "$SEED_NOW_VALUE" ]; then
  die "the database's first businessDate is '${first}' but SEED_NOW was '${SEED_NOW_VALUE}'. The refresh did not take effect as expected."
fi

echo "reseed: OK — demo data refreshed."
echo "  businessDate range: ${first} -> ${last}  (${days} days)"
echo "  showtimes:          ${showtimes}"
echo "  Refresh again in about a week, before ${last} falls into the past."
