// ---------- the newest server log lines, for Administration > Server ----------

const MAX_LINES = 500;
const lines: string[] = [];
let partial = "";

/** Keeps a copy of everything the server writes to its output, newest 500 lines. */
export function captureLogs(): void {
  for (const stream of [process.stdout, process.stderr]) {
    const write = stream.write.bind(stream) as (...args: unknown[]) => boolean;
    stream.write = ((chunk: unknown, ...rest: unknown[]) => {
      try {
        remember(typeof chunk === "string" ? chunk : Buffer.isBuffer(chunk) ? chunk.toString("utf8") : "");
      } catch {
        // logging must never stop the server
      }
      return write(chunk, ...rest);
    }) as typeof stream.write;
  }
}

/** Adds text to the kept lines (also used by tests). */
export function remember(text: string): void {
  const parts = (partial + text).split("\n");
  partial = parts.pop() ?? "";
  for (const line of parts) {
    if (!line.trim()) continue;
    lines.push(readable(line));
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  }
}

/** Server log lines are JSON from the web server or plain text; JSON lines are shown as time, level and message. */
function readable(line: string): string {
  if (!line.startsWith("{")) return line;
  try {
    const entry = JSON.parse(line) as { time?: number; level?: number; msg?: string; req?: { method?: string; url?: string }; res?: { statusCode?: number } };
    const time = entry.time ? new Date(entry.time).toISOString().replace("T", " ").slice(0, 19) : "";
    const level = (entry.level ?? 30) >= 50 ? "ERROR" : (entry.level ?? 30) >= 40 ? "WARN" : "INFO";
    const request = entry.req ? ` ${entry.req.method ?? ""} ${entry.req.url ?? ""}` : "";
    const status = entry.res?.statusCode ? ` ${entry.res.statusCode}` : "";
    return `${time} ${level} ${entry.msg ?? ""}${request}${status}`.trim();
  } catch {
    return line;
  }
}

export const logLines = (): string[] => [...lines];
