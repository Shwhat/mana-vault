# Mana Vault handoff

Last updated: 2026-11-18, version 0.1.0.

## Project

Mana Vault is Devon's self-hosted Magic: The Gathering collection and deck manager (repository Shwhat/mana-vault). It runs as one Docker container (Node.js 22, Fastify, SQLite) and serves a React interface for desktop browsers and phones. Version 0.1.0 rebuilt the interface in the OpenSchem design style (program-design-guide skill, "look and shell" adoption), added sign-in, per-account preferences, undo, the About guide and Dockhand-ready deployment.

## Rules

- Do not build or change the program until Devon says "build it". Settle the specification first with questions.
- Before building, review the enabled skills and state which apply (program-design-guide, program-about-guide, docker-server-setup at minimum). Load each one that applies.
- Do not commit or push until asked. Do not remind Devon about uncommitted work.
- Never use em dashes anywhere (code, comments, docs, interface text). A static test enforces this.
- Answer questions simply and directly, without extra unrequested actions.
- Keep a task list while building, update the README feature list and keep the keyboard shortcut list current (README, About guide page 13, `SHORTCUTS` in `actions.tsx`).
- Update this handoff (here and in the claude.ai manavault project, identical) with every build.
- Raise the version in every place with each delivered build: `package.json`, `apps/server/package.json`, `apps/web/package.json` and `package-lock.json` (run `npm install --package-lock-only`). Patch for fixes, minor for features, major only when Devon says so. A static test checks they match.
- Every pull request that changes what the app does, or the rules it follows, also updates the About guide: the affected pages, Capabilities, and a new entry in the release notes. It also raises the version. The version is shown in the guide.
- Every change gets tests; `npm run test:all` must pass before delivery.
- Deployment follows the docker-server-setup skill: Dockhand only, no Watchtower, absolute data path, UID 65532, no cloudflared or reverse proxy in the stack.

## Decisions (0.1.0 specification)

- Scope: OpenSchem look and shell on the existing React + TypeScript + Vite and Node/Fastify/SQLite stack. Not a rewrite to plain JS or Go.
- Desktop shell on wide screens; phone layout under 900 px (bottom tabs Cards, Collection, Decks, More; sheets; 44 px targets).
- Sign-in follows the OpenSchem method: PBKDF2 hashes, HTTP-only cookie with automatic secure flag behind HTTPS, rate limits, safety header (`X-Mana-Vault: 1`) on every change, signup switch `MANAVAULT_SIGNUP`.
- All accounts share one collection and one set of decks. Preferences are per account.
- Undo covers collection and deck card edits by sending the reverse change. Imports, restores, deck creation and catalog updates are not undoable.
- Tests: server unit tests, static checks, and a Playwright browser suite.

## Code map

| Path | Contents |
|---|---|
| `apps/server/src/app.ts` | Fastify app: request guard and security headers, account routes, prefs, card search, card detail, collection, decks, imports, backups, catalog status, SPA fallback for `/about/...` |
| `apps/server/src/auth.ts` | Users, sessions (token hashes), prefs table, PBKDF2, rate limiter, cookie helpers |
| `apps/server/src/index.ts` | Startup, environment variables, `-healthcheck` flag |
| `apps/server/src/backup.ts`, `collection-import.ts`, `deck-import.ts`, `card-search.ts`, `catalog-updater.ts`, `import-*.ts`, `database.ts` | Unchanged domain logic from before 0.1.0 (backup colorless fix in 0.1.0) |
| `apps/web/src/main.tsx` | Boot (loads `/api/me` and prefs), keyboard shortcuts, desktop or phone shell, scanner |
| `apps/web/src/store.tsx` | All app state and operations (`useStoreState`), undo stack, imports and exports, workspaces |
| `apps/web/src/actions.tsx` | The `ACTIONS` map: every command with label, short label, icon, key; shortcut list; workspace list |
| `apps/web/src/ribbon.ts` | `DEFAULT_RIBBON` and `MENUS` as data (action names) |
| `apps/web/src/dock.ts` | Panel registry, layout model (areas, columns, groups, floating), presets, move and remove operations |
| `apps/web/src/prefs.ts` | Preference defaults, merge (ribbon reset on new version), save to server, theme |
| `apps/web/src/icons.tsx` | `RI` inline SVG icon table |
| `apps/web/src/components/` | MenuBar, Ribbon, RibbonCustomize, Dock, StatusBar, Dialog (`dialog()`, `customDialog()`, `confirmDialog()`), Shell (desktop and phone), About (loader and Markdown renderer), CardScanner |
| `apps/web/src/panels/Panels.tsx` | Filters, Decks, Card, Deck list, Import review panels |
| `apps/web/src/views/Views.tsx` | Card search, collection and deck views |
| `apps/web/src/about/` | About guide pages `01-overview.md` to `17-release-notes.md` |
| `apps/web/src/static.test.ts` | Static checks: guide order and links, release note version, every label in the guide, versions equal, no em dashes |
| `apps/web/public/login.html` | Self-contained sign-in page |
| `tests/e2e/` | Playwright suite (`app.spec.ts`), fixtures, sample-data server (`serve.mjs`) |
| `docker-compose.yml`, `.env.example`, `Dockerfile` | Dockhand-ready deployment |

## Open bugs

None known.

## Open ideas

- Separate collections and decks per account.
- Rename and delete decks.
- Price information; deck statistics (mana curve, color counts).
- A built-in demo document (program-design-guide section 6) was not part of the 0.1.0 specification.
- Optional command line (program-design-guide section 3) was not built.
- The ribbon customize window uses a shared Name box for new and renamed tabs and groups.

## Known limits

- Search returns at most 40 results.
- Undo history is per page load and reverses by sending the reverse change; a concurrent edit to the same card by someone else is overwritten by an undo.
- Imports up to 5 MB and 5,000 rows; backups up to 25 MB.
- Card images load from Scryfall's servers.
- The server serves the built files registered at startup; restart it after rebuilding the interface (Docker does this on every deploy).

## Where work stopped

0.1.0 is built and all checks pass (`npm run test:all`: typecheck, 47 server tests, 7 static checks, 12 browser tests). Nothing is committed or pushed yet; waiting for Devon.
