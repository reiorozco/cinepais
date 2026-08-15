import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { toolLabel } from "../src/components/copilot/use-copilot-chat";
import { parseAgentEvent } from "../src/lib/agent/events";
import { createSseParser } from "../src/lib/agent/sse";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "agent-sse",
);

/**
 * The four tools the agent exposes (`agent/README.md` §Architecture), plus the
 * unknown-tool fallback. Driving the map directly is the only deterministic way
 * to cover all five: a fixture replay exercises whichever tools that one turn
 * happened to call, and `route.fulfill` delivers the whole stream in a single
 * reader chunk, so a mid-flight label is not observable there either.
 */
describe("toolLabel", () => {
  test("maps each known tool to its Spanish label", () => {
    expect(toolLabel("recommend_best")).toBe("Buscando la mejor función…");
    expect(toolLabel("search_showtimes")).toBe("Consultando funciones…");
    expect(toolLabel("seat_availability")).toBe("Revisando disponibilidad…");
    expect(toolLabel("adjacent_seats")).toBe("Buscando sillas juntas…");
  });

  test("falls back for an unrecognized tool name", () => {
    expect(toolLabel("some_future_tool")).toBe("Consultando…");
  });

  test("never leaks an English tool identifier into the label", () => {
    const tools = [
      "recommend_best",
      "search_showtimes",
      "seat_availability",
      "adjacent_seats",
      "some_future_tool",
    ];
    for (const tool of tools) {
      expect(toolLabel(tool)).not.toContain(tool);
    }
  });
});

/**
 * The tool-only shape (`sse-contract.md` §Event ordering) has no real capture,
 * so it is covered by a synthetic fixture. This asserts the authored stream is
 * actually valid on the wire before the browser replay relies on it — a typo in
 * a hand-written payload would otherwise surface as a mysteriously empty panel.
 */
describe("synthetic tool-only fixture", () => {
  test("parses to tool_call + recommendation + done with zero tokens", () => {
    const raw = readFileSync(
      path.join(FIXTURE_DIR, "synthetic-tool-only-no-tokens.txt"),
      "utf8",
    );

    const frames = createSseParser().feed(raw);
    const events = frames
      .map((frame) => parseAgentEvent(frame.event, frame.data))
      .filter((event) => event !== null);

    expect(events.map((event) => event.type)).toEqual([
      "tool_call",
      "recommendation",
      "done",
    ]);
  });
});
