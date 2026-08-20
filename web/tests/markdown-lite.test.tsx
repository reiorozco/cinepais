// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { MarkdownLite } from "../src/components/copilot/markdown-lite";

/**
 * `vitest.config.ts` keeps the global environment on `node` for the eleven
 * business-rule suites, so this file opts into jsdom with the docblock above.
 * Auto-cleanup only registers when Vitest globals are enabled, which they are
 * not here — hence the explicit `afterEach`.
 */
afterEach(cleanup);

describe("MarkdownLite — supported subset", () => {
  test("**hola** renders a <strong> element containing hola", () => {
    const { container } = render(<MarkdownLite text="**hola**" />);

    const strong = container.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe("hola");
    expect(container.textContent).toBe("hola");
    // The markers themselves are consumed, not printed.
    expect(container.textContent).not.toContain("**");
  });

  test("a '- ' list renders a <ul> with one <li> per item", () => {
    const { container } = render(
      <MarkdownLite text={"- Sala Norte 19:30\n- Sala Sur 21:00\n- Sala Centro 22:15"} />,
    );

    const lists = container.querySelectorAll("ul");
    expect(lists).toHaveLength(1);

    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(3);
    expect([...items].map((item) => item.textContent)).toEqual([
      "Sala Norte 19:30",
      "Sala Sur 21:00",
      "Sala Centro 22:15",
    ]);
  });

  test("blank-line separated text renders as separate paragraphs", () => {
    const { container } = render(
      <MarkdownLite text={"Encontré tres funciones.\n\nTodas tienen sillas juntas."} />,
    );

    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toBe("Encontré tres funciones.");
    expect(paragraphs[1].textContent).toBe("Todas tienen sillas juntas.");
  });

  test("a lead-in sentence followed by bullets renders a paragraph plus a list, not a <ul> inside a <p>", () => {
    const { container } = render(
      <MarkdownLite text={"Te recomiendo **Sala Norte**:\n- 19:30 en IMAX\n- Sillas F7 y F8"} />,
    );

    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container.querySelectorAll("ul")).toHaveLength(1);
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("p ul")).toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe("Sala Norte");
  });

  test("a soft line break inside one paragraph keeps whitespace-pre-wrap on the text node", () => {
    const { container } = render(<MarkdownLite text={"Primera línea\nsegunda línea"} />);

    const paragraph = container.querySelector("p");
    expect(paragraph?.className).toContain("whitespace-pre-wrap");
    expect(paragraph?.textContent).toBe("Primera línea\nsegunda línea");
  });
});

describe("MarkdownLite — streaming safety", () => {
  test("a partial token mid-stream with an unterminated **bold renders without throwing and without swallowing the visible text", () => {
    // Tokens arrive one at a time via `use-copilot-chat.ts`, so every prefix of
    // the final string is rendered at least once — including this one.
    const partial = "Encontré **2 sillas";

    expect(() => render(<MarkdownLite text={partial} />)).not.toThrow();

    const { container } = render(<MarkdownLite text={partial} />);
    expect(container.textContent).toContain("2 sillas");
    expect(container.textContent).toContain("Encontré");
    // Nothing is emphasised yet, because the closing marker has not arrived.
    expect(container.querySelector("strong")).toBeNull();
  });

  test("every prefix of a streamed message renders without throwing", () => {
    const full = "Encontré **2 sillas juntas** en:\n\n- **Sala Norte** 19:30\n- Sala Sur 21:00";

    for (let length = 0; length <= full.length; length += 1) {
      const prefix = full.slice(0, length);
      expect(
        () => render(<MarkdownLite text={prefix} />),
        `prefix of length ${length}`,
      ).not.toThrow();
      cleanup();
    }
  });

  test("the completed bold span emphasises once the closing marker arrives", () => {
    const { container } = render(<MarkdownLite text="Encontré **2 sillas** juntas" />);

    expect(container.querySelector("strong")?.textContent).toBe("2 sillas");
    expect(container.textContent).toBe("Encontré 2 sillas juntas");
  });
});

describe("MarkdownLite — hostile and unsupported input degrades to literal text", () => {
  test("input containing <script>alert(1)</script> renders as literal text, never as an element", () => {
    const { container } = render(
      <MarkdownLite text="Mira esto: <script>alert(1)</script> y ya" />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelectorAll("*")).toHaveLength(1); // only the <p>
    expect(container.textContent).toBe("Mira esto: <script>alert(1)</script> y ya");
  });

  test("an <img onerror> payload renders as literal text, never as an element", () => {
    const { container } = render(<MarkdownLite text={'<img src=x onerror="alert(1)">'} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe('<img src=x onerror="alert(1)">');
  });

  test("an unsupported |table| row renders literally rather than being dropped", () => {
    const { container } = render(
      <MarkdownLite text={"| Cine | Hora |\n| --- | --- |\n| Norte | 19:30 |"} />,
    );

    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).toBe("| Cine | Hora |\n| --- | --- |\n| Norte | 19:30 |");
  });

  test("unsupported headings, rules and code fences render literally rather than being dropped", () => {
    const cases = ["### Funciones", "---", "```js\nalert(1)\n```", "> cita", "1. primero"];

    for (const source of cases) {
      const { container } = render(<MarkdownLite text={source} />);
      expect(container.querySelector("h1,h2,h3,hr,pre,code,blockquote,ol")).toBeNull();
      expect(container.textContent).toBe(source);
      cleanup();
    }
  });

  test("empty content renders nothing at all", () => {
    const { container } = render(<MarkdownLite text="" />);

    expect(container.textContent).toBe("");
    expect(container.querySelectorAll("*")).toHaveLength(0);
  });
});
