// ---------- notes (0.23.0): web pages and pictures fetched for notes, never from the server's own network ----------
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import type { FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { type Fetched, type NoteFetcher, attachPicture, FILE_LIMIT } from "./notes.js";

export const PAGE_LIMIT = 10 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const REDIRECTS = 5;

/** Whether an address is on a private, local or reserved network (refused, so notes cannot reach the server's own network). */
export function privateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (isIP(ip) === 6) {
    if (ip === "::" || ip === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
    if (mapped) return privateAddress(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(ip) || ip.startsWith("64:ff9b:") || ip.startsWith("2001:db8:");
  }
  return true;
}

/** Checks an address before it is fetched. Returns a message for a refused address. */
export function refusedUrl(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return "Type a web address that starts with http:// or https://";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "Type a web address that starts with http:// or https://";
  if (url.username || url.password) return "Web addresses with a name and password are not fetched";
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || (isIP(host.replace(/^\[|\]$/g, "")) && privateAddress(host))) {
    return "Addresses on the server's own network are not fetched";
  }
  return null;
}

/** Name lookups that refuse private addresses, so a public name pointing inward is refused too. */
function guardedLookup(hostname: string, options: object, callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    const list = addresses as LookupAddress[];
    const bad = list.find((item) => privateAddress(item.address));
    if (bad || !list.length) return callback(Object.assign(new Error("Addresses on the server's own network are not fetched"), { code: "EREFUSED" }), "", 0);
    if ((options as { all?: boolean }).all) return callback(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
}

function getOnce(url: URL, limit: number): Promise<{ status: number; location?: string; type: string; bytes: Buffer }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.get(url, {
      lookup: guardedLookup as never,
      headers: { "user-agent": "Mana Vault notes (+https://github.com/Shwhat/mana-vault)", accept: "text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.5" },
      timeout: TIMEOUT_MS,
    }, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        resolve({ status, location: response.headers.location, type: "", bytes: Buffer.alloc(0) });
        return;
      }
      const declared = Number(response.headers["content-length"] ?? 0);
      if (declared > limit) {
        response.destroy();
        reject(new Error(`The file is larger than ${Math.round(limit / 1024 / 1024)} MB`));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > limit) {
          response.destroy();
          reject(new Error(`The file is larger than ${Math.round(limit / 1024 / 1024)} MB`));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ status, type: String(response.headers["content-type"] ?? ""), bytes: Buffer.concat(chunks) }));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("The site took too long to answer")));
    request.on("error", (error: NodeJS.ErrnoException) => reject(error.code === "EREFUSED" ? error : new Error(error.code === "ENOTFOUND" ? "The site was not found" : error.message)));
  });
}

/** Fetches an address from the internet, following up to 5 redirects, each checked again. */
export const guardedFetcher: NoteFetcher = async (address, limit) => {
  let url = new URL(address);
  for (let hop = 0; hop <= REDIRECTS; hop += 1) {
    const refused = refusedUrl(url.href);
    if (refused) throw new Error(refused);
    const answer = await getOnce(url, limit);
    if (answer.location) {
      url = new URL(answer.location, url);
      continue;
    }
    if (answer.status < 200 || answer.status >= 300) throw new Error(`The site answered with an error (${answer.status})`);
    return { url: url.href, type: answer.type, bytes: answer.bytes };
  }
  throw new Error("The site sent too many redirects");
};

const PICTURE_TYPES: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/avif": "avif",
};

/** The picture's kind from its first bytes, for sites that send no kind or a wrong one. */
function sniff(bytes: Buffer, declared: string): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (bytes.subarray(4, 12).toString("latin1").startsWith("ftypavi")) return "image/avif";
  const type = declared.split(";")[0]!.trim().toLowerCase();
  if (type === "image/svg+xml" || /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(bytes.subarray(0, 300).toString("utf8"))) return "image/svg+xml";
  return null;
}

export function registerNoteWebRoutes(app: FastifyInstance, database: DatabaseSync, fetcher: NoteFetcher = guardedFetcher): void {
  /** A web page for New page from web address...: the browser keeps the article and turns it into a page. */
  app.post<{ Body: { url?: unknown } }>("/api/notes/fetch", async (request, reply) => {
    const address = typeof request.body?.url === "string" ? request.body.url.trim() : "";
    const refused = refusedUrl(address);
    if (refused) return reply.code(400).send({ error: refused });
    let page: Fetched;
    try {
      page = await fetcher(address, PAGE_LIMIT);
    } catch (reason) {
      return reply.code(502).send({ error: `Could not fetch the page: ${reason instanceof Error ? reason.message : "no answer"}` });
    }
    const type = page.type.split(";")[0]!.trim().toLowerCase();
    if (type && type !== "text/html" && type !== "application/xhtml+xml") return reply.code(400).send({ error: "That address is not a web page" });
    const charset = /charset=([\w-]+)/i.exec(page.type)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(page.bytes.subarray(0, 4096).toString("latin1"))?.[1] ?? "utf-8";
    let html: string;
    try {
      html = new TextDecoder(charset.toLowerCase()).decode(page.bytes);
    } catch {
      html = page.bytes.toString("utf8");
    }
    return { url: page.url, html };
  });

  /** A copy of a picture from the web, kept as a note picture. */
  app.post<{ Body: { url?: unknown; pageId?: unknown; id?: unknown } }>("/api/notes/files/copy", async (request, reply) => {
    const address = typeof request.body?.url === "string" ? request.body.url.trim() : "";
    const refused = refusedUrl(address);
    if (refused) return reply.code(400).send({ error: refused });
    let picture: Fetched;
    try {
      picture = await fetcher(address, FILE_LIMIT);
    } catch (reason) {
      return reply.code(502).send({ error: `Could not copy the picture: ${reason instanceof Error ? reason.message : "no answer"}` });
    }
    const type = sniff(picture.bytes, picture.type);
    if (!type) return reply.code(400).send({ error: "That address is not a PNG, JPEG, GIF, WebP, AVIF or SVG picture" });
    const name = decodeURIComponent(new URL(picture.url).pathname.split("/").pop() || "picture").slice(0, 200) || `picture.${PICTURE_TYPES[type]}`;
    const saved = attachPicture(database, request.user!.id, typeof request.body?.pageId === "string" ? request.body.pageId : null, { name, type, bytes: picture.bytes }, request.body?.id);
    if (typeof saved === "string") return reply.code(404).send({ error: saved });
    return reply.code(201).send(saved);
  });
}
