const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeFrame(payload: unknown): Uint8Array {
  const body = encoder.encode(JSON.stringify(payload));
  const header = encoder.encode(`Content-Length: ${body.length}\r\n\r\n`);
  const frame = new Uint8Array(header.length + body.length);
  frame.set(header, 0);
  frame.set(body, header.length);
  return frame;
}

export class FrameDecoder {
  private pending = new Uint8Array(0);

  push(chunk: Uint8Array): unknown[] {
    this.pending = concat(this.pending, chunk);
    const messages: unknown[] = [];
    while (this.pending.length > 0) {
      const headerEnd = indexOfHeaderEnd(this.pending);
      if (headerEnd < 0) {
        break;
      }
      const headerText = decoder.decode(this.pending.slice(0, headerEnd));
      const match = /Content-Length:\s*(\d+)/i.exec(headerText);
      if (!match) {
        this.pending = new Uint8Array(0);
        throw new Error("MCP frame is missing Content-Length.");
      }
      const length = Number(match[1]);
      if (length > 1_000_000) {
        this.pending = new Uint8Array(0);
        throw new Error("MCP frame is too large.");
      }
      const bodyStart = headerEnd + 4;
      if (this.pending.length < bodyStart + length) {
        break;
      }
      const body = this.pending.slice(bodyStart, bodyStart + length);
      this.pending = this.pending.slice(bodyStart + length);
      let parsed: unknown;
      try {
        parsed = JSON.parse(decoder.decode(body)) as unknown;
      } catch {
        throw new Error("MCP frame body is not JSON.");
      }
      messages.push(parsed);
    }
    return messages;
  }
}

function indexOfHeaderEnd(bytes: Uint8Array): number {
  for (let index = 0; index <= bytes.length - 4; index += 1) {
    if (bytes[index] === 13 && bytes[index + 1] === 10 && bytes[index + 2] === 13 && bytes[index + 3] === 10) {
      return index;
    }
  }
  return -1;
}

function concat(left: Uint8Array, right: Uint8Array): Uint8Array {
  const merged = new Uint8Array(left.length + right.length);
  merged.set(left, 0);
  merged.set(right, left.length);
  return merged;
}
