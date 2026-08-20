import type { ReactNode } from "react";

/**
 * A deliberately tiny Markdown renderer for assistant messages.
 *
 * The agent's system prompt (`agent/src/cinepais_agent/prompts.py`) constrains the
 * model to exactly three constructs: plain prose, `**negrita**`, and `- ` bullet
 * lists. Headings, tables, horizontal rules, code fences and emoji are forbidden
 * there. This module is the client-side counterpart to that constraint, so it
 * parses that subset and nothing else.
 *
 * Two rules govern everything below:
 *
 * 1. **Never build an HTML string.** Every output is a React element or a plain
 *    string child, so React escapes text for us and React's raw-HTML injection
 *    prop never has to appear anywhere in `web/src` — a property the accept
 *    check greps for, which is why this comment does not spell the prop out.
 *    A message containing `<script>alert(1)</script>` is text, and renders as
 *    the characters a person typed.
 * 2. **Degrade to literal text, never mangle.** Anything outside the subset — a
 *    stray `#`, a table pipe, an emoji, a `---` rule — is emitted verbatim, which
 *    is exactly what the bubble did before this module existed. Losing formatting
 *    is acceptable; losing the message is not.
 *
 * Streaming matters as much as the final string. Tokens arrive one at a time
 * (`use-copilot-chat.ts` appends each `token` event to `message.content`), so this
 * renderer is called on every partial prefix — including prefixes that cut a
 * `**bold**` span in half. The bold pattern requires a closing `**`, so an
 * unterminated one simply does not match and the half-written span stays visible
 * as literal text until the closing token arrives.
 */

/** A blank line — the only paragraph separator the subset recognises. */
const BLOCK_SEPARATOR = /\n[ \t]*\n/;

/**
 * A bullet line: `- ` followed by content. The trailing space and the non-empty
 * content are both required, which is what keeps a forbidden `---` rule out of
 * the list branch — it has no space after the first `-`, so it falls through to
 * the text branch and renders literally, as intended.
 */
const BULLET_LINE = /^[ \t]*- (.+)$/;

type Segment =
  | { readonly kind: "text"; readonly lines: readonly string[] }
  | { readonly kind: "list"; readonly items: readonly string[] };

/**
 * Splits one line into text and `<strong>` children.
 *
 * The pattern is non-greedy and demands a closing `**`, so `"Encontré **2 sillas"`
 * mid-stream yields a single literal string rather than throwing or dropping the
 * words after the marker. The regex is built per call: a module-level `/g` regex
 * carries `lastIndex` between calls, which turns a shared instance into a
 * cross-render bug the moment two messages render in the same tick.
 */
function renderInline(line: string, keyPrefix: string): ReactNode[] {
  const bold = /\*\*([\s\S]+?)\*\*/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = bold.exec(line)) !== null) {
    if (match.index > cursor) {
      nodes.push(line.slice(cursor, match.index));
    }
    nodes.push(
      <strong key={`${keyPrefix}-b${match.index}`} className="font-semibold text-white">
        {match[1]}
      </strong>,
    );
    cursor = match.index + match[0].length;
  }

  if (cursor < line.length) {
    nodes.push(line.slice(cursor));
  }

  return nodes;
}

/**
 * Groups a block's lines into consecutive runs of bullets and non-bullets, so a
 * lead-in sentence followed immediately by a list — the shape the agent actually
 * produces, with no blank line between them — becomes a paragraph plus a `<ul>`
 * rather than one run of either.
 */
function segmentBlock(block: string): Segment[] {
  const segments: Segment[] = [];

  for (const line of block.split("\n")) {
    const bullet = BULLET_LINE.exec(line);
    const previous = segments.at(-1);

    if (bullet !== null) {
      if (previous?.kind === "list") {
        segments[segments.length - 1] = {
          kind: "list",
          items: [...previous.items, bullet[1]],
        };
      } else {
        segments.push({ kind: "list", items: [bullet[1]] });
      }
      continue;
    }

    if (previous?.kind === "text") {
      segments[segments.length - 1] = {
        kind: "text",
        lines: [...previous.lines, line],
      };
    } else {
      segments.push({ kind: "text", lines: [line] });
    }
  }

  // A run of blank lines inside a block leaves an all-whitespace text segment
  // with nothing to say; dropping it avoids rendering an empty paragraph.
  return segments.filter((segment) =>
    segment.kind === "list"
      ? segment.items.length > 0
      : segment.lines.join("\n").trim().length > 0,
  );
}

/**
 * Renders the constrained Markdown subset as React elements.
 *
 * Returns a fragment rather than its own wrapper: the caller owns the bubble
 * (`copilot-widget.tsx` renders it inside a `<div>`, because a `<ul>` inside a
 * `<p>` is invalid nesting) and supplies the vertical rhythm via `space-y-*` on
 * the direct children this fragment contributes. `whitespace-pre-wrap` lives on
 * the text nodes here, not on that wrapper, so soft line breaks inside a
 * paragraph survive exactly as they did before Markdown was parsed at all.
 */
export function MarkdownLite({ text }: { text: string }): ReactNode {
  const blocks = text.split(BLOCK_SEPARATOR);

  return (
    <>
      {blocks.flatMap((block, blockIndex) =>
        segmentBlock(block).map((segment, segmentIndex) => {
          const key = `${blockIndex}-${segmentIndex}`;

          if (segment.kind === "list") {
            return (
              <ul key={key} className="list-disc space-y-1 pl-5">
                {segment.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>
                    {renderInline(item, `${key}-${itemIndex}`)}
                  </li>
                ))}
              </ul>
            );
          }

          return (
            <p key={key} className="whitespace-pre-wrap">
              {renderInline(segment.lines.join("\n"), key)}
            </p>
          );
        }),
      )}
    </>
  );
}
