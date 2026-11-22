import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import fastifyStatic from "@fastify/static";
import { registerScanRoutes } from "./scan.js";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { assignUnowned, initializeDatabase, openDatabase, type CardRow } from "./database.js";
import { IMPORT_FORMATS, type ImportFormat, importCollectionCsv } from "./collection-import.js";

const readImportFormat = (value: unknown): ImportFormat | undefined =>
  (typeof value === "string" && value in IMPORT_FORMATS ? value as ImportFormat : undefined);
import { importDecklist } from "./deck-import.js";
import { createBackup, inspectBackup, restoreBackup } from "./backup.js";
import { parseCardQuery, SEARCH_SORTS, type SearchSort, searchOrder } from "./card-search.js";
import { type CatalogUpdateStatus } from "./catalog-updater.js";
import { registerInsightRoutes } from "./insights.js";
import { logDeck, registerDeckRoutes } from "./decks.js";
import { registerDeckBuilderRoutes } from "./deck-builder.js";
import { registerTradeRoutes } from "./trades.js";
import { CUSTOM_PUBLIC, registerCustomRoutes } from "./custom.js";
import { EXTRAS_PUBLIC, registerExtrasRoutes } from "./extras.js";
import { copiesAdded } from "./copy-events.js";
import { activeOpeningOf, initializePurchases, purchasesFromPrices, registerPurchaseRoutes } from "./purchases.js";
import { type Fetcher, registerProxyRoutes } from "./proxies.js";
import { deviceUser, handleCrossOrigin, registerMobileRoutes, Revision } from "./mobile.js";
import { areasOf, CLIENT_HEADER, Events, type OpeningNote, registerEventRoutes } from "./events.js";
import { registerAppUpdateRoutes } from "./app-updates.js";
import { access, createCollection, forgetItem, itemSharing, registerLibraryRoutes } from "./library.js";
import { isAdmin, logActivity, registerAdminRoutes, startBackupSchedule, useInvite } from "./admin.js";
import { type Locks, type ServerSettings, Settings } from "./settings.js";
import { type PictureController, registerPictureRoutes } from "./pictures.js";
import {
  AuthStore, COOKIE_NAME, DEFAULT_ITERATIONS, GUARD_HEADER, Limiter, readCookie, sessionCookie,
  type User, validName, validPassword,
} from "./auth.js";

declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
    /** Set when the request was signed in with an Android app device token. */
    deviceId?: string;
  }
}

export interface AppOptions {
  /** Sign-in and the request guard. Only tests of the card and deck logic turn this off. */
  requireSignIn?: boolean;
  /** Whether the sign-in page offers "Create account". */
  signup?: boolean;
  /** auto marks the session cookie secure when the request arrived over HTTPS (directly or through a proxy). */
  secureCookie?: "auto" | "always" | "never";
  passwordIterations?: number;
  /** Failed sign-ins and new accounts allowed per address in 15 minutes. Raised only by the browser tests. */
  addressAttemptLimit?: number;
  version?: string;
  /** Downloads card pictures and mana symbols from Scryfall; tests replace it. */
  fetcher?: Fetcher;
  /** Wait before the second try of a card picture download, in milliseconds (800). */
  pictureRetryDelay?: number;
  /** Settings locked by environment variables (index.ts reads them). */
  settingsEnv?: { forced: Partial<ServerSettings>; locks: Locks };
  /** The database file, for backups, restores and storage figures. */
  databasePath?: string;
  /** Stop the server after a restore is saved, so Docker starts it on the restored data. */
  exitAfterRestore?: boolean;
  /** Changes the card database update schedule. */
  setUpdateInterval?: (hours: number) => void;
  /** Turns off the background picture downloads (tests). */
  pictureDownloads?: boolean;
}

declare module "fastify" {
  interface FastifyInstance {
    pictures: PictureController;
    serverSettings: Settings;
    events: Events;
  }
}

// Paths anyone may load without signing in.
const PUBLIC_PATHS = new Set([
  "/login", "/login.html", "/icon.svg", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest", "/sw.js",
  "/api/health", "/api/config", "/api/login", "/api/signup", "/api/logout",
  // the app for this server version (0.17.0): the same file as on the public releases page
  "/api/app/latest", "/api/app/apk",
]);
// card pictures are public, like Scryfall's own
const PICTURE_PATH = /^\/pictures\//;

export async function buildApp(
  database = openDatabase(),
  webRoot = process.env.WEB_DIST_PATH ?? fileURLToPath(new URL("../../web/dist", import.meta.url)),
  getCatalogUpdateStatus: () => CatalogUpdateStatus = () => ({
    scheduled: false,
    intervalHours: null,
    isUpdating: false,
    lastAttemptAt: null,
    lastImportedCount: null,
    lastError: null,
  }),
  requestCatalogUpdate: () => boolean = () => false,
  options: AppOptions = {},
): Promise<FastifyInstance> {
  initializeDatabase(database);
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  const requireSignIn = options.requireSignIn ?? true;
  const secureMode = options.secureCookie ?? "auto";
  const auth = new AuthStore(database, options.passwordIterations ?? DEFAULT_ITERATIONS);
  // settings saved in Administration; environment variables (and test options) lock some of them
  const forced: Partial<ServerSettings> = { ...(options.settingsEnv?.forced ?? {}) };
  const locks: Locks = { ...(options.settingsEnv?.locks ?? {}) };
  if (options.signup !== undefined) {
    forced.signup = options.signup ? "open" : "closed";
    locks.signup = "MANAVAULT_SIGNUP";
  }
  if (options.addressAttemptLimit !== undefined) forced.attemptLimit = options.addressAttemptLimit;
  const settings = new Settings(database, locks, forced);
  app.decorate("serverSettings", settings);
  const nameLimiter = new Limiter(5, 5 * 60_000);
  const addressLimiter = new Limiter(settings.get().attemptLimit, 15 * 60_000);
  const databasePath = options.databasePath
    ?? String(database.prepare("PRAGMA database_list").all().find((row) => row.name === "main")?.file || "data/mana-vault.sqlite");
  app.decorateRequest("user", null);
  // tests of the card and deck logic run without sign-in as one built-in account
  const localUser = requireSignIn ? null : (auth.checkPassword("local", "local-test-account") ?? auth.addUser("local", "local-test-account"));
  if (localUser) assignUnowned(database);

  const revision = new Revision();
  // live updates (0.18.0): every change is told to the open pages and apps of the people it concerns
  const events = new Events(database);
  app.decorate("events", events);
  const activeOpening = (userId: number): OpeningNote => activeOpeningOf(database, userId);
  app.addHook("onResponse", async (request, reply) => {
    if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS" && reply.statusCode < 400 && request.url.startsWith("/api/")) {
      revision.bump();
      if (!request.user) return;
      const path = request.url.split("?")[0] ?? "";
      const client = request.headers[CLIENT_HEADER];
      // starting, ending, continuing or undoing an opening also sends the opening, so the phone's scanner follows it
      const openingChange = /^\/api\/purchases\/(.+\/open$|openings\/)/.test(path);
      const areas = areasOf(path);
      if (openingChange) areas.push("opening");
      try {
        events.publish(request.user.id, areas, typeof client === "string" ? client : null, openingChange ? activeOpening(request.user.id) : undefined);
      } catch (error) {
        request.log.warn({ error }, "Could not send a live update");
      }
    }
  });

  app.addHook("onRequest", async (request, reply) => {
    if (handleCrossOrigin(request, reply)) return reply;
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "same-origin");
    if (!requireSignIn) {
      request.user = localUser;
      return;
    }
    const path = request.url.split("?")[0] ?? "/";
    // Every request that changes something must carry the guard header. Browsers do not let other sites
    // add custom headers without a CORS preflight, which this server never allows.
    if (path.startsWith("/api/") && request.method !== "GET" && request.method !== "HEAD" && request.headers[GUARD_HEADER] !== "1") {
      return reply.code(403).send({ error: "This request is missing its safety header. Reload the page and try again." });
    }
    const token = readCookie(request.headers.cookie, COOKIE_NAME);
    request.user = token ? auth.session(token) : null;
    // the app's live update stream cannot carry a header, so it signs in with its device token in the address
    const streamToken = path === "/api/events" && !request.headers.authorization ? new URLSearchParams(request.url.split("?")[1] ?? "").get("device") : null;
    if (!request.user && (request.headers.authorization || streamToken)) {
      const device = deviceUser(database, request.headers.authorization ?? `Bearer ${streamToken}`);
      if (device) {
        request.user = { id: device.id, name: device.name };
        request.deviceId = device.deviceId;
      }
    }
    // the shared trade binder is the one page that works without signing in
    if (PUBLIC_PATHS.has(path) || request.user || (path === "/api/devices" && request.method === "POST")
      || ((request.method === "GET" || request.method === "HEAD") && (/^\/share\/[\w-]{10,64}$/.test(path) || CUSTOM_PUBLIC.test(path) || EXTRAS_PUBLIC.test(path) || PICTURE_PATH.test(path)))) return;
    if (path.startsWith("/api/")) return reply.code(401).send({ error: "You are signed out. Sign in again to continue." });
    if (path === "/" || path.endsWith(".html") || !path.includes(".")) return reply.redirect("/login");
    return reply.code(401).send({ error: "Signed out" });
  });

  const secure = (request: { protocol: string; headers: Record<string, string | string[] | undefined> }) =>
    secureMode === "always" ? true : secureMode === "never" ? false
      : request.protocol === "https" || String(request.headers["x-forwarded-proto"] ?? "").toLowerCase() === "https";
  const address = (request: { ip: string }) => request.ip;

  app.addContentTypeParser(
    "text/csv",
    { parseAs: "string", bodyLimit: 5 * 1024 * 1024 },
    (_request, body, done) => done(null, body),
  );
  app.addContentTypeParser(
    "text/plain",
    { parseAs: "string", bodyLimit: 5 * 1024 * 1024 },
    (_request, body, done) => done(null, body),
  );
  app.addContentTypeParser(
    "application/vnd.mana-vault.backup+json",
    { parseAs: "string", bodyLimit: 250 * 1024 * 1024 },
    (_request, body, done) => done(null, body),
  );

  await app.register(fastifyStatic, {
    root: webRoot,
    prefix: "/",
    index: ["index.html"],
    wildcard: false,
  });

  // Addresses inside the app (such as /about/decks) load the app page; anything else is not found.
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split("?")[0] ?? "/";
    if (request.method === "GET" && !path.startsWith("/api/") && !path.includes(".")) {
      reply.header("cache-control", "no-store");
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "Not found" });
  });

  registerLibraryRoutes(app, database);
  registerDeckRoutes(app, database);
  registerDeckBuilderRoutes(app, database);
  registerTradeRoutes(app, database);
  initializePurchases(database);
  registerPurchaseRoutes(app, database, join(webRoot, "ocr"));
  registerInsightRoutes(app, database);
  registerScanRoutes(app, database);
  registerCustomRoutes(app, database);
  registerProxyRoutes(app, database, options.fetcher, options.pictureRetryDelay);

  // card pictures kept on the server, the picture downloads and Administration
  const pictures = registerPictureRoutes(app, { database, settings, databasePath, fetcher: options.fetcher, downloads: options.pictureDownloads ?? true });
  app.decorate("pictures", pictures);
  const applySettings = () => {
    addressLimiter.max = settings.get().attemptLimit;
    options.setUpdateInterval?.(settings.get().updateIntervalHours);
    pictures.apply();
  };
  const adminContext = {
    database, auth, settings, version: options.version ?? "", startedAt: Date.now(), databasePath,
    fetcher: (options.fetcher ?? fetch) as unknown as Parameters<typeof registerAdminRoutes>[1]["fetcher"],
    applySettings, exitAfterRestore: options.exitAfterRestore ?? false, pictureSummary: () => pictures.summary(),
  };
  registerAdminRoutes(app, adminContext);
  registerExtrasRoutes(app, database, settings, options.fetcher as typeof fetch | undefined);
  const stopBackups = startBackupSchedule(adminContext);
  registerEventRoutes(app, events, activeOpening);
  app.addHook("onClose", async () => {
    events.close();
    stopBackups();
    pictures.stop();
  });
  applySettings();

  app.post<{ Params: { deckId: string }; Body: string }>("/api/decks/:deckId/import/preview", async (request, reply) => {
    if (typeof request.body !== "string" || !request.body.trim()) {
      return reply.code(400).send({ error: "Upload a non-empty decklist file" });
    }
    const deck = database.prepare("SELECT id, mode FROM decks WHERE id = ?").get(request.params.deckId);
    if (!deck) return reply.code(404).send({ error: "Deck not found" });
    try {
      return importDecklist(database, request.params.deckId, deck.mode as "normal" | "theme", request.body, false);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not preview decklist" });
    }
  });

  app.post<{ Params: { deckId: string }; Body: string }>("/api/decks/:deckId/import", async (request, reply) => {
    if (typeof request.body !== "string" || !request.body.trim()) {
      return reply.code(400).send({ error: "Upload a non-empty decklist file" });
    }
    const deck = database.prepare("SELECT id, mode FROM decks WHERE id = ?").get(request.params.deckId);
    if (!deck) return reply.code(404).send({ error: "Deck not found" });
    try {
      const result = importDecklist(database, request.params.deckId, deck.mode as "normal" | "theme", request.body, true, request.user!.id);
      if (result.importedQuantity) logDeck(database, request.params.deckId, String(request.user?.name ?? ""), `Imported ${result.importedQuantity} cards`);
      return result;
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not import decklist" });
    }
  });

  app.get("/api/health", async () => ({ status: "ok", version: options.version ?? null }));

  // ---------- accounts ----------
  app.get("/login", async (request, reply) => {
    if (request.user) return reply.redirect("/");
    reply.header("cache-control", "no-store");
    return reply.sendFile("login.html");
  });

  // the first account can always be made, so a new server is never locked
  const signupMode = () => (auth.userCount() === 0 ? "open" : settings.get().signup);
  app.get("/api/config", async () => ({
    signup: signupMode() !== "closed", signupMode: signupMode(), serverName: settings.get().serverName,
    minPasswordLength: settings.get().minPasswordLength, version: options.version ?? null,
  }));

  const startSession = (request: Parameters<typeof secure>[0], reply: { header: (name: string, value: string) => unknown }, user: User) => {
    const days = settings.get().sessionDays;
    const token = auth.newSession(user.id, days);
    reply.header("set-cookie", sessionCookie(token, days * 86_400, secure(request)));
    return { id: user.id, name: user.name };
  };

  app.post<{ Body: { name?: unknown; password?: unknown; invite?: unknown } }>("/api/signup", async (request, reply) => {
    const mode = signupMode();
    if (mode === "closed") return reply.code(403).send({ error: "New accounts are turned off on this server." });
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const invite = typeof request.body?.invite === "string" ? request.body.invite.trim() : "";
    if (!validName(name)) {
      return reply.code(400).send({ error: "User names are 3 to 32 letters, digits, dots, dashes or underscores, starting with a letter or digit." });
    }
    const minimum = settings.get().minPasswordLength;
    if (!validPassword(password, minimum)) return reply.code(400).send({ error: `Passwords need at least ${minimum} characters.` });
    if (addressLimiter.blocked(address(request))) return reply.code(429).send({ error: "Too many attempts. Try again in a few minutes." });
    addressLimiter.hit(address(request));
    if (mode === "invite" && !invite) return reply.code(403).send({ error: "This server needs an invite code to create an account." });
    if (database.prepare("SELECT 1 FROM users WHERE name = ?").get(name)) return reply.code(409).send({ error: "That user name is taken." });
    if (mode === "invite" && !useInvite(database, invite, name)) return reply.code(403).send({ error: "That invite code is not valid or was already used." });
    const user = auth.addUser(name, password);
    if (!user) return reply.code(409).send({ error: "That user name is taken." });
    logActivity(database, name, "Account created", mode === "invite" ? `With invite ${invite.toUpperCase()}` : "Sign-up", request.ip);
    assignUnowned(database);
    // every account starts with a collection, so Add to collection works at once
    if (!database.prepare("SELECT 1 FROM collections WHERE owner_id = ?").get(user.id)) {
      createCollection(database, user.id, { name: "Main collection", description: "", completion: "main", finish: "any", kind: "collection", sets: [] });
    }
    return startSession(request, reply, user);
  });

  // Checks a name and password with the rate limits. On failure the reply is already sent and null is returned.
  const signIn = async (name: string, password: string, request: { ip: string }, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) => {
    const key = name.toLowerCase();
    if (nameLimiter.blocked(key) || addressLimiter.blocked(address(request))) {
      reply.code(429).send({ error: "Too many attempts. Try again in a few minutes." });
      return null;
    }
    const user = auth.checkPassword(name, password);
    if (!user) {
      nameLimiter.hit(key);
      addressLimiter.hit(address(request));
      logActivity(database, name, "Failed sign-in", "", address(request));
      reply.code(401).send({ error: "Wrong user name or password." });
      return null;
    }
    if (auth.disabled(user.id)) {
      logActivity(database, user.name, "Failed sign-in", "Account disabled", address(request));
      reply.code(403).send({ error: "This account is turned off. Ask the server's admin." });
      return null;
    }
    nameLimiter.reset(key);
    logActivity(database, user.name, "Sign-in", "", address(request));
    return user;
  };

  app.post<{ Body: { name?: unknown; password?: unknown } }>("/api/login", async (request, reply) => {
    const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const user = await signIn(name, password, request, reply);
    if (!user) return reply;
    return startSession(request, reply, user);
  });

  registerMobileRoutes(app, database, revision, signIn);
  registerAppUpdateRoutes(app, { version: options.version ?? "", databasePath, fetcher: options.fetcher });

  app.post("/api/logout", async (request, reply) => {
    const token = readCookie(request.headers.cookie, COOKIE_NAME);
    if (token) auth.endSession(token);
    if (request.deviceId) database.prepare("DELETE FROM devices WHERE id = ?").run(request.deviceId);
    reply.header("set-cookie", sessionCookie("", 0, secure(request)));
    return { ok: true };
  });

  app.get("/api/me", async (request) => {
    if (!request.user) return { id: 0, name: "" };
    const row = database.prepare("SELECT is_admin, must_change FROM users WHERE id = ?").get(request.user.id);
    return { ...request.user, admin: Number(row?.is_admin ?? 0) === 1, mustChange: Number(row?.must_change ?? 0) === 1 };
  });

  app.post<{ Body: { old?: unknown; new?: unknown } }>("/api/password", async (request, reply) => {
    const user = request.user;
    if (!user) return reply.code(401).send({ error: "You are signed out. Sign in again to continue." });
    const key = user.name.toLowerCase();
    if (nameLimiter.blocked(key)) return reply.code(429).send({ error: "Too many attempts. Try again in a few minutes." });
    if (!auth.checkPassword(user.name, typeof request.body?.old === "string" ? request.body.old : "")) {
      nameLimiter.hit(key);
      return reply.code(401).send({ error: "The current password is wrong." });
    }
    const next = typeof request.body?.new === "string" ? request.body.new : "";
    const minimum = settings.get().minPasswordLength;
    if (!validPassword(next, minimum)) return reply.code(400).send({ error: `Passwords need at least ${minimum} characters.` });
    auth.setPassword(user.id, next);
    // phones signed in to the account are signed out too, except the one making the change
    database.prepare("DELETE FROM devices WHERE user_id = ? AND id IS NOT ?").run(user.id, request.deviceId ?? null);
    // other sessions were ended; this one continues with a new token
    return startSession(request, reply, user);
  });

  app.get("/api/prefs", async (request) => (request.user ? auth.prefs(request.user.id) : {}));

  app.put<{ Body: unknown }>("/api/prefs", { bodyLimit: 1024 * 1024 }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "You are signed out. Sign in again to continue." });
    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
      return reply.code(400).send({ error: "Preferences must be an object" });
    }
    auth.savePrefs(request.user.id, request.body);
    return { ok: true };
  });

  // cards the last update left out because their record failed a check
  const catalogSkipped = () => {
    const read = (key: string) => String(database.prepare("SELECT value FROM catalog_metadata WHERE key = ?").get(key)?.value ?? "");
    let names: string[] = [];
    try {
      const parsed = JSON.parse(read("last_skipped_names") || "[]");
      if (Array.isArray(parsed)) names = parsed.map(String);
    } catch {
      names = [];
    }
    return { count: Number(read("last_skipped_count") || 0), names };
  };
  app.get("/api/catalog/status", async () => ({
    printingCount: database.prepare("SELECT COUNT(*) AS count FROM cards").get()?.count ?? 0,
    updatedAt: database.prepare("SELECT value FROM catalog_metadata WHERE key = 'updated_at'").get()?.value ?? null,
    skipped: catalogSkipped(),
    migrations: (() => {
      try {
        return JSON.parse(String(database.prepare("SELECT value FROM catalog_metadata WHERE key = 'last_migrations'").get()?.value ?? "null")) as { merged: number; removed: number } | null;
      } catch {
        return null;
      }
    })(),
    update: getCatalogUpdateStatus(),
    tags: {
      art: Number(database.prepare("SELECT COUNT(*) AS n FROM tags WHERE kind = 'art'").get()?.n ?? 0),
      oracle: Number(database.prepare("SELECT COUNT(*) AS n FROM tags WHERE kind = 'oracle'").get()?.n ?? 0),
    },
    languages: database.prepare("SELECT lang, COUNT(*) AS n FROM cards GROUP BY lang ORDER BY n DESC").all().map((row) => ({ lang: String(row.lang), count: Number(row.n) })),
    priceHistoryDays: Number(database.prepare("SELECT COUNT(DISTINCT day) AS n FROM price_history").get()?.n ?? 0),
  }));

  app.post("/api/catalog/update", async (request, reply) => {
    if (requireSignIn && !isAdmin(database, request.user?.id)) return reply.code(403).send({ error: "Only an admin can update the card database." });
    if (!requestCatalogUpdate()) {
      const update = getCatalogUpdateStatus();
      if (update.isUpdating) {
        return reply.code(409).send({ error: "A card catalog update is already running", update });
      }
      return reply.code(503).send({ error: "Card catalog updates are unavailable", update });
    }
    return reply.code(202).send({ status: "started", update: getCatalogUpdateStatus() });
  });

  app.get("/api/backup", async (request, reply) => {
    reply.header("content-disposition", 'attachment; filename="mana-vault-backup.json"');
    return createBackup(database, request.user!.id);
  });

  app.post<{ Body: string }>("/api/backup/validate", async (request, reply) => {
    if (typeof request.body !== "string" || !request.body.trim()) {
      return reply.code(400).send({ error: "Choose a Mana Vault backup file" });
    }
    try {
      return inspectBackup(request.body);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not validate backup" });
    }
  });

  app.post<{ Body: string }>("/api/backup/restore", async (request, reply) => {
    if (typeof request.body !== "string" || !request.body.trim()) {
      return reply.code(400).send({ error: "Choose a Mana Vault backup file" });
    }
    try {
      restoreBackup(database, request.body, request.user!.id);
      return { status: "restored" };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not restore backup" });
    }
  });

  app.get<{ Querystring: { q?: string; color?: string; type?: string; set?: string; rarity?: string; format?: string; mvMin?: string; mvMax?: string; limit?: string; offset?: string; paged?: string; group?: string; sort?: string; currency?: string } }>(
    "/api/cards",
    async (request, reply) => {
      const { q = "", color, type, set, rarity, format, mvMin, mvMax, limit = "40", offset = "0", paged, group, sort = "best", currency } = request.query;
      if (typeof sort !== "string" || !(SEARCH_SORTS as readonly string[]).includes(sort)) return reply.code(400).send({ error: "Choose a valid sort" });
      const order = searchOrder(sort as SearchSort, typeof q === "string" ? q : "", { currency: typeof currency === "string" ? currency : undefined, userId: request.user?.id });
      const parsedLimit = Number(limit);
      const parsedOffset = Number(offset);
      if (!Number.isInteger(parsedOffset) || parsedOffset < 0 || parsedOffset > 1_000_000) return reply.code(400).send({ error: "Invalid search parameters" });
      if (
        typeof q !== "string" ||
        q.length > 400 ||
        (color !== undefined && typeof color !== "string") ||
        (type !== undefined && typeof type !== "string") ||
        (set !== undefined && typeof set !== "string") ||
        (rarity !== undefined && typeof rarity !== "string") ||
        (format !== undefined && typeof format !== "string") ||
        (mvMin !== undefined && typeof mvMin !== "string") ||
        (mvMax !== undefined && typeof mvMax !== "string") ||
        typeof limit !== "string" ||
        !Number.isInteger(parsedLimit) ||
        parsedLimit < 1 ||
        parsedLimit > 100
      ) {
        return reply.code(400).send({ error: "Invalid search parameters" });
      }
      if (color && !/^[WUBRG]$/.test(color.toUpperCase())) {
        return reply.code(400).send({ error: "Color must be one of W, U, B, R, or G" });
      }

      // printings Scryfall removed stay for the copies that hold them, but are no longer found by search
      const conditions: string[] = ["removed = 0"];
      const values: (string | number)[] = [];
      try {
        for (const clause of parseCardQuery(q, { userId: request.user?.id })) {
          conditions.push(clause.sql);
          values.push(...clause.values);
        }
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid card search" });
      }
      if (color) {
        conditions.push("instr(colors, ?) > 0");
        values.push(color.toUpperCase());
      }
      if (type?.trim()) {
        conditions.push("type_line LIKE ? ESCAPE '\\'");
        values.push(`%${type.trim().replace(/[\\%_]/g, "\\$&")}%`);
      }
      if (set?.trim()) {
        conditions.push("set_code = ?");
        values.push(set.trim().toLowerCase());
      }
      if (rarity?.trim()) {
        if (!["common", "uncommon", "rare", "mythic", "special", "bonus"].includes(rarity.trim().toLowerCase())) {
          return reply.code(400).send({ error: "Choose a valid rarity" });
        }
        conditions.push("rarity = ?");
        values.push(rarity.trim().toLowerCase());
      }
      if (format?.trim()) {
        if (!/^[a-z0-9-]{2,30}$/i.test(format.trim())) return reply.code(400).send({ error: "Invalid format filter" });
        conditions.push("json_extract(legalities, ?) = 'legal'");
        values.push(`$.${format.trim().toLowerCase()}`);
      }
      for (const [parameter, operator] of [[mvMin, ">="], [mvMax, "<="]] as const) {
        if (parameter !== undefined && parameter.trim()) {
          const manaValue = Number(parameter);
          if (!Number.isFinite(manaValue) || manaValue < 0 || manaValue > 100) {
            return reply.code(400).send({ error: "Mana value filters must be from 0 to 100" });
          }
          conditions.push(`mana_value ${operator} ?`);
          values.push(manaValue);
        }
      }
      if (mvMin && mvMax && Number(mvMin) > Number(mvMax)) {
        return reply.code(400).send({ error: "Minimum mana value cannot exceed maximum" });
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const columns = `id, oracle_id, name, mana_cost, mana_value, type_line, oracle_text, colors, color_identity, legalities,
                set_code, set_name, collector_number, rarity, image_url, released_at, artist, ${CARD_PRICE_COLUMNS}`;
      // grouped: one result per card, showing its newest regular English printing, with how many printings matched
      const grouped = group === "1";
      // Grouped search picks one printing per card. Only the few columns the pick needs go through the window step,
      // and the total comes from the same pass, so the cards table is read once; the page's full rows are joined last.
      const rows = grouped
        ? database.prepare(
          `WITH ${order.with ? `${order.with},` : ""} ranked AS (SELECT id AS pid, ROW_NUMBER() OVER (PARTITION BY oracle_id ORDER BY removed, lang != 'en', promo, variation, released_at IS NULL, released_at DESC) AS pick,
                                  COUNT(*) OVER (PARTITION BY oracle_id) AS printings FROM cards ${where}),
                picked AS (SELECT pid, printings, COUNT(*) OVER () AS matches FROM ranked WHERE pick = 1)
           SELECT ${columns}, p.printings, p.matches FROM picked p JOIN cards x ON x.id = p.pid ORDER BY ${order.sql} LIMIT ? OFFSET ?`,
        ).all(...(order.withValues ?? []), ...values, ...order.values, parsedLimit, parsedOffset)
        : database.prepare(`${order.with ? `WITH ${order.with} ` : ""}SELECT ${columns} FROM cards x ${where} ORDER BY ${order.sql} LIMIT ? OFFSET ?`)
          .all(...(order.withValues ?? []), ...values, ...order.values, parsedLimit, parsedOffset);
      if (paged !== "1") return rows.map(toCardRow);
      // a page of results with the total number of matches and how many copies the account owns, by finish
      const total = grouped && rows.length
        ? Number(rows[0]!.matches)
        : Number(database.prepare(grouped ? `SELECT COUNT(DISTINCT oracle_id) AS count FROM cards ${where}` : `SELECT COUNT(*) AS count FROM cards ${where}`).get(...values)?.count ?? 0);
      const userId = request.user!.id;
      const ownedOf = database.prepare(
        `SELECT i.foil, COALESCE(SUM(i.quantity), 0) AS owned FROM collection_cards i JOIN collections col ON col.id = i.collection_id
         WHERE ${grouped ? "i.card_id IN (SELECT id FROM cards WHERE oracle_id = ?)" : "i.card_id = ?"} AND i.proxy = 0 AND col.kind = 'collection'
           AND (col.owner_id = ? OR EXISTS (SELECT 1 FROM members m WHERE m.kind = 'collection' AND m.item_id = col.id AND m.user_id = ?))
         GROUP BY i.foil`,
      );
      return {
        total,
        cards: rows.map((row) => {
          const finishes = ownedOf.all(String(grouped ? row.oracle_id : row.id), userId, userId);
          const count = (foil: number) => Number(finishes.find((item) => Number(item.foil) === foil)?.owned ?? 0);
          return {
            ...toCardRow(row), owned: count(0) + count(1) + count(2), ownedFinishes: { regular: count(0), foil: count(1), etched: count(2) },
            ...(grouped ? { printings: Number(row.printings) } : {}),
          };
        }),
      };
    },
  );

  // the printing ids a search matches, for filters on collection and deck cards that need the card database (art, roles...)
  app.get<{ Querystring: { q?: string } }>("/api/cards/match", async (request, reply) => {
    const q = typeof request.query.q === "string" ? request.query.q : "";
    if (!q.trim() || q.length > 400) return reply.code(400).send({ error: "Invalid card search" });
    try {
      const clauses = parseCardQuery(q, { userId: request.user?.id });
      const where = clauses.length ? `WHERE ${clauses.map((clause) => clause.sql).join(" AND ")}` : "";
      const ids = database.prepare(`SELECT id FROM cards ${where} LIMIT 200000`).all(...clauses.flatMap((clause) => clause.values)).map((row) => String(row.id));
      return { ids };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid card search" });
    }
  });

  // tag suggestions for the Art shows and Role filters
  app.get<{ Querystring: { kind?: string; q?: string } }>("/api/tags", async (request) => {
    const kind = request.query.kind === "oracle" ? "oracle" : "art";
    const q = typeof request.query.q === "string" ? request.query.q.trim().slice(0, 60) : "";
    return database.prepare(
      `SELECT t.label, t.description, (SELECT COUNT(*) FROM tag_links l WHERE l.tag_id = t.id) AS uses FROM tags t
       WHERE t.kind = ? AND t.label LIKE ? ESCAPE '\\' ORDER BY t.label LIKE ? ESCAPE '\\' DESC, uses DESC LIMIT 30`,
    ).all(kind, `%${q.replace(/[\\%_]/g, "\\$&")}%`, `${q.replace(/[\\%_]/g, "\\$&")}%`)
      .map((row) => ({ label: String(row.label), description: String(row.description), uses: Number(row.uses) }));
  });

  // the saved price history of a printing, oldest first
  app.get<{ Params: { cardId: string } }>("/api/cards/:cardId/prices", async (request) => {
    return database.prepare("SELECT day, usd, usd_foil, usd_etched, eur, eur_foil FROM price_history WHERE card_id = ? ORDER BY day").all(request.params.cardId)
      .map((row) => ({ day: String(row.day), usd: row.usd, usdFoil: row.usd_foil, usdEtched: row.usd_etched, eur: row.eur, eurFoil: row.eur_foil }));
  });

  app.get<{ Params: { cardId: string } }>("/api/cards/:cardId", async (request, reply) => {
    const row = database.prepare(
      `SELECT id, oracle_id, name, mana_cost, mana_value, type_line, oracle_text, colors, color_identity, legalities,
              set_code, set_name, collector_number, rarity, image_url, released_at, artist, ${CARD_PRICE_COLUMNS}
       FROM cards WHERE id = ?`,
    ).get(request.params.cardId);
    if (!row) return reply.code(404).send({ error: "Card printing not found" });
    const card = toCardRow(row);
    const userId = request.user!.id;
    const collections = database.prepare(
      `SELECT col.id, COALESCE(m.display_name, col.name) AS name, col.kind,
              COALESCE(SUM(CASE WHEN i.card_id = ? AND i.foil = 0 AND i.proxy = 0 THEN i.quantity END), 0) AS regular,
              COALESCE(SUM(CASE WHEN i.card_id = ? AND i.foil = 1 AND i.proxy = 0 THEN i.quantity END), 0) AS foil,
              COALESCE(SUM(CASE WHEN i.card_id = ? AND i.foil = 2 AND i.proxy = 0 THEN i.quantity END), 0) AS etched,
              COALESCE(SUM(CASE WHEN i.proxy = 1 THEN i.quantity END), 0) AS proxies,
              COALESCE(SUM(i.trade), 0) AS trade,
              COALESCE(SUM(CASE WHEN i.proxy = 0 THEN i.quantity END), 0) AS all_printings
       FROM collections col
       LEFT JOIN members m ON m.kind = 'collection' AND m.item_id = col.id AND m.user_id = ?
       JOIN collection_cards i ON i.collection_id = col.id
       JOIN cards c ON c.id = i.card_id AND c.oracle_id = ?
       WHERE col.owner_id = ? OR m.user_id IS NOT NULL
       GROUP BY col.id ORDER BY col.created_at, col.rowid`,
    ).all(card.id, card.id, card.id, userId, card.oracle_id, userId).map((row) => ({
      id: String(row.id), name: String(row.name), wishlist: row.kind === "wishlist", regular: Number(row.regular), foil: Number(row.foil),
      etched: Number(row.etched), proxies: Number(row.proxies), trade: Number(row.trade), allPrintings: Number(row.all_printings),
    }));
    // copies in wishlists are wanted, not owned
    const owned = collections.filter((item) => !item.wishlist);
    const sum = (key: "regular" | "foil" | "etched" | "proxies" | "allPrintings") => owned.reduce((total, item) => total + item[key], 0);
    return {
      ...card,
      owned: { regular: sum("regular"), foil: sum("foil"), etched: sum("etched"), proxies: sum("proxies"), allPrintings: sum("allPrintings"), collections: owned },
      wanted: collections.filter((item) => item.wishlist),
      pricesUpdatedAt: String(database.prepare("SELECT value FROM catalog_metadata WHERE key = 'updated_at'").get()?.value ?? "") || null,
    };
  });

  app.get<{ Params: { cardId: string } }>("/api/cards/:cardId/rulings", async (request, reply) => {
    const card = database.prepare("SELECT oracle_id FROM cards WHERE id = ?").get(request.params.cardId);
    if (!card) return reply.code(404).send({ error: "Card printing not found" });
    return database.prepare("SELECT published_at, comment FROM rulings WHERE oracle_id = ? ORDER BY published_at, rowid")
      .all(String(card.oracle_id)).map((row) => ({ date: String(row.published_at), text: String(row.comment) }));
  });

  app.post<{ Params: { collectionId: string }; Querystring: { format?: string }; Body: string }>("/api/collections/:collectionId/import/preview", async (request, reply) => {
    if (typeof request.body !== "string" || !request.body.trim()) {
      return reply.code(400).send({ error: "Upload a non-empty file" });
    }
    try {
      const { additions: _additions, ...preview } = importCollectionCsv(database, request.body, false, request.params.collectionId, readImportFormat(request.query.format));
      return preview;
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not preview collection CSV" });
    }
  });

  app.post<{ Params: { collectionId: string }; Querystring: { format?: string; purchases?: string }; Body: string }>("/api/collections/:collectionId/import", async (request, reply) => {
    if (typeof request.body !== "string" || !request.body.trim()) {
      return reply.code(400).send({ error: "Upload a non-empty file" });
    }
    try {
      const { additions, ...result } = importCollectionCsv(database, request.body, true, request.params.collectionId, readImportFormat(request.query.format));
      // copies added while an opening is where pulled cards go are tied to it; imported prices can become purchases (0.16.0)
      const userId = request.user?.id;
      copiesAdded(database, userId, request.params.collectionId, (additions ?? []).map((item) => ({ key: item.key, quantity: item.quantity })));
      const mode = request.query.purchases === "one" || request.query.purchases === "date" ? request.query.purchases : null;
      const purchases = mode && userId && additions?.length
        ? purchasesFromPrices(database, userId, mode, { collectionId: request.params.collectionId, items: additions, source: `${result.formatName.replace(/ CSV$/, "")} import` }) : [];
      return { ...result, purchases };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not import CSV" });
    }
  });

  return app;
}

function toCardRow(row: Record<string, unknown>): CardRow & {
  flavor_name: string | null; power: string | null; toughness: string | null; prices: Record<string, number | null>; custom?: boolean; finishes?: string;
  promo_types?: string; lang?: string;
} {
  const required = (key: string): string => {
    const value = row[key];
    if (typeof value !== "string") throw new Error(`Invalid card database value for ${key}`);
    return value;
  };
  const optional = (key: string): string | null => {
    const value = row[key];
    if (value === null || typeof value === "string") return value;
    throw new Error(`Invalid card database value for ${key}`);
  };
  return {
    id: required("id"),
    oracle_id: required("oracle_id"),
    name: required("name"),
    mana_cost: optional("mana_cost"),
    mana_value: typeof row.mana_value === "number" ? row.mana_value : null,
    type_line: required("type_line"),
    oracle_text: optional("oracle_text"),
    colors: required("colors"),
    color_identity: required("color_identity"),
    legalities: required("legalities"),
    set_code: required("set_code"),
    set_name: required("set_name"),
    collector_number: required("collector_number"),
    rarity: required("rarity"),
    image_url: optional("image_url"),
    released_at: optional("released_at"),
    artist: optional("artist"),
    flavor_name: optional("flavor_name"),
    power: typeof row.power === "string" ? row.power : null,
    toughness: typeof row.toughness === "string" ? row.toughness : null,
    // a card made in the card maker
    ...(Number(row.custom ?? 0) === 1 ? { custom: true } : {}),
    // the finishes the printing is made in, such as "nonfoil,foil"
    ...(typeof row.finishes === "string" ? { finishes: row.finishes } : {}),
    // Scryfall's promo types (surgefoil, galaxyfoil...) and the printed language, when not English
    ...(typeof row.promo_types === "string" && row.promo_types ? { promo_types: row.promo_types } : {}),
    ...(typeof row.lang === "string" && row.lang !== "en" ? { lang: row.lang } : {}),
    prices: {
      usd: price(row.price_usd), usd_foil: price(row.price_usd_foil), usd_etched: price(row.price_usd_etched),
      eur: price(row.price_eur), eur_foil: price(row.price_eur_foil),
    },
  };
}

const price = (value: unknown) => (typeof value === "number" ? value : null);
const CARD_PRICE_COLUMNS = "flavor_name, power, toughness, price_usd, price_usd_foil, price_usd_etched, price_eur, price_eur_foil, custom, finishes, promo_types, lang";
