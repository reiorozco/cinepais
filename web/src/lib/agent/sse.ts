/**
 * Incremental Server-Sent Events frame parser.
 *
 * Implements the field-parsing half of WHATWG HTML §9.2.6 "Interpreting an
 * event stream". Pure and synchronous: strings in, frames out. Decoding bytes
 * to strings is the caller's job, which keeps this module trivially testable.
 *
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
 */

export type SseFrame = {
  event: string;
  data: string;
};

export type SseParser = {
  feed(chunk: string): SseFrame[];
};

const DEFAULT_EVENT_TYPE = "message";

export function createSseParser(): SseParser {
  let buffer = "";
  let eventType = "";
  let dataLines: string[] = [];

  function resetFrameBuffers(): void {
    eventType = "";
    dataLines = [];
  }

  function consumeLine(line: string, frames: SseFrame[]): void {
    if (line === "") {
      // An empty data buffer means nothing was accumulated (a lone comment or a
      // bare `event:` line), and the spec dispatches no event in that case.
      if (dataLines.length > 0) {
        frames.push({
          event: eventType === "" ? DEFAULT_EVENT_TYPE : eventType,
          data: dataLines.join("\n"),
        });
      }
      resetFrameBuffers();
      return;
    }

    if (line.startsWith(":")) return;

    const colonIndex = line.indexOf(":");
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    const rawValue = colonIndex === -1 ? "" : line.slice(colonIndex + 1);
    // Exactly one leading space is the field separator; any further spaces are
    // content. Trimming here would corrupt Spanish copy with meaningful spacing.
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

    if (field === "event") {
      eventType = value;
    } else if (field === "data") {
      dataLines.push(value);
    }
  }

  return {
    feed(chunk: string): SseFrame[] {
      buffer += chunk;

      // A CR at the very end of the buffer is ambiguous: the LF that would make
      // it a single CRLF terminator may still arrive in the next chunk. Holding
      // it back stops normalization from splitting one terminator into two and
      // dispatching a phantom frame a line early.
      let heldCarriageReturn = "";
      if (buffer.endsWith("\r")) {
        heldCarriageReturn = "\r";
        buffer = buffer.slice(0, -1);
      }

      const lines = buffer
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n");

      buffer = (lines.pop() ?? "") + heldCarriageReturn;

      const frames: SseFrame[] = [];
      for (const line of lines) {
        consumeLine(line, frames);
      }
      return frames;
    },
  };
}
