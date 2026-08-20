/**
 * The committed poster art must stay in sync with the film table it was drawn
 * from.
 *
 * Every SVG in `public/posters/` embeds its film's title, genre and duration as
 * real text. Nothing in the build re-renders them, so a title edited in
 * `prisma/seed.ts` without a regeneration ships a poster that *lies about the
 * film underneath it* — the site would say one thing and the artwork another,
 * and no compiler or type would notice. A convention ("remember to regenerate")
 * does not prevent that. This does.
 *
 * The check is a byte-for-byte comparison against a fresh render, which works
 * only because the generator is deterministic (no `Date`, no `Math.random`, no
 * locale-sensitive formatting, no object-key iteration — see the header of
 * `scripts/generate-posters.ts`). Any drift in the inputs, in the layout code or
 * in the palette therefore shows up here as a differing byte.
 *
 * The generator is run the way a human runs it — as a `tsx` subprocess, with
 * `POSTERS_OUT_DIR` pointed at a temp directory — rather than imported. It
 * writes files at module scope, so importing it into this process would be a
 * loaded gun aimed at the committed artwork; a subprocess cannot touch
 * `public/posters/` even if the redirection breaks, and it exercises the exact
 * documented invocation path at the same time.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

import { FILMS } from "../prisma/seed";

const WEB_ROOT = resolve(__dirname, "..");
const COMMITTED_DIR = resolve(WEB_ROOT, "public/posters");
const GENERATOR = resolve(WEB_ROOT, "scripts/generate-posters.ts");
const TSX = resolve(WEB_ROOT, "node_modules/.bin/tsx");

const REGENERATE = "npx tsx scripts/generate-posters.ts";

/** A fresh render of the whole catalogue, written outside the repo. */
let freshDir: string;

beforeAll(() => {
  freshDir = mkdtempSync(join(tmpdir(), "cinepais-posters-"));
  // stdout is the generator's progress table — noise here. stderr is inherited
  // so that a crash inside the generator is readable instead of an opaque
  // "Command failed".
  execFileSync(TSX, [GENERATOR], {
    cwd: WEB_ROOT,
    env: { ...process.env, POSTERS_OUT_DIR: freshDir },
    stdio: ["ignore", "ignore", "inherit"],
  });
});

describe("poster art matches the film table", () => {
  // Guards the vacuous pass: with an empty FILMS the per-film cases below would
  // register zero tests and this file would go green having proved nothing.
  test("the film table is non-empty, so the per-film cases are real", () => {
    expect(FILMS.length).toBeGreaterThan(0);
  });

  test("every film has a committed poster", () => {
    const missing = FILMS.filter(
      (film) => !existsSync(join(COMMITTED_DIR, `${film.id}.svg`))
    ).map((film) => `${film.id} (${film.title})`);

    // `posterUrl` is NOT NULL in the Prisma schema and every film's value points
    // at `/posters/<id>.svg`, so a missing file is a broken seed, not a
    // cosmetic gap.
    expect(
      missing,
      `films with no SVG in public/posters — run \`${REGENERATE}\` and commit the result`
    ).toEqual([]);
  });

  test.each(FILMS.map((film) => [film.id, film.title] as const))(
    "%s — the committed SVG is byte-identical to a fresh render of %s",
    (id, title) => {
      const committed = readFileSync(join(COMMITTED_DIR, `${id}.svg`));
      const fresh = readFileSync(join(freshDir, `${id}.svg`));

      expect(
        fresh.equals(committed),
        `public/posters/${id}.svg is STALE — it does not match what the generator ` +
          `now renders for "${title}" (committed ${committed.length} bytes, ` +
          `fresh render ${fresh.length} bytes). The film table changed without the ` +
          `art being redrawn: run \`${REGENERATE}\` and commit the result.`
      ).toBe(true);
    }
  );
});
