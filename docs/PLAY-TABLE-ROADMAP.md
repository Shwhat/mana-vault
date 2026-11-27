# Play table roadmap and proposed file plan

Status: the 0.30.0 work adds an initial native Play workspace, offline solo
play, and server-stored private manual tables for two or four players. Focused
tests cover table membership, hidden hands and libraries, revision-checked
actions, two-player and four-player turn cycles, reloads by seated players,
leaving a table, and playing an original custom card through the offline manual
game UI with the browser's network disabled.
The Play engine integration CI passed on commit `8a84091713ab617128b1f51989f5b47a4030ca1b`: it built the private Compose profile, verified no published engine ports, ran live saved-deck and hidden-state tests, and rejected a spoofed trusted identity. The 0.32.2 private-engine run advanced to its native UI check. For 0.33.0, Android CI passed and produced `mana-vault-0.33.0-debug`; the Play engine test failed because the UI assumed IDs were at the top level of `canPlayObjects`. The pinned Playmat contract nests them under `.objects`, which 0.34.0 now reads. The 0.34.0 exact-head workflows are pending after push. Native UI browser coverage verifies engine-approved battlefield choices and prompt-bound mana payment. The 0.32.1 manual table scenarios also end both two-player and four-player sessions through concession. Local Docker, Podman and WSL remain unavailable. Production deployment and live engine reconnect/outage behavior remain unverified, so Phase 1 is not fully accepted. These tests do not complete phases 2 through 4.

## Implemented foundation work

The shared play contracts and transport-independent protocol parsing remain in
place. The parser recognizes the pinned engine's gameplay and player-prompt
events, and table creation carries per-seat player types. Server-side integration includes an allowlisted RPC WebSocket client, a
persistent opaque engine identity mapping, conversion of immutable deck
snapshots to exact-printing engine deck lists, authenticated routes, prompt
freshness checks and account session cleanup. A Compose `play` profile builds
the pinned engine source on a private internal network with no published
engine ports. A live test completed an AI game using a saved Mana Vault deck.
The Compose profile, unpublished ports, live hidden-state behavior and trusted
peer spoof rejection passed PR CI on commit
`8a84091713ab617128b1f51989f5b47a4030ca1b`. Production deployment and
engine-session reconnect or outage recovery remain unverified. The 0.30.0
branch adds a first user-facing Play workspace, but its phase acceptance gates
remain pending.

| Files | Implemented scope and remaining gate |
| --- | --- |
| `apps/server/src/play/engine-identity.ts`, `app.ts`, `admin.ts` | Persist an opaque engine name per Mana Vault user, manage server-side sessions and close them on account or last-device revocation. The spoofed trusted-header boundary passed PR CI; production deployment remains unverified. |
| `apps/server/src/play/playmat-connection.ts`, `play-sessions.ts`, `routes.ts`, `packages/playmat-protocol/src/rpc.ts`, `apps/web/src/views/PlayView.tsx` | Server-only WebSocket client, RPC allowlist, authenticated game routes, per-user event queues, prompt freshness and takeover refusal. The Engine AI UI can choose hand or battlefield objects exposed by `canPlayObjects` during `GAME_SELECT`; deployment and broader prompt coverage remain incomplete. |
| `apps/server/src/play/manual-routes.ts`, `apps/web/src/views/PlayView.tsx` | Server-authoritative manual table membership and state for two or four players, per-player hidden-zone projection, invitation-code read-only spectators, offline solo mode and a first native workspace. Full manual interactions and match history are not implemented. |
| `apps/server/src/play/deck-converter.ts`, `routes.ts` | Convert authorized immutable snapshots, verify exact printings, validate against the live engine and start the human-plus-AI match. A real game and hidden-state isolation passed CI; production deployment remains unverified. |
| `apps/server/src/play/*.test.ts`, `packages/playmat-protocol/src/*.test.ts` | Synthetic lifecycle and route tests plus an optional real-engine acceptance test. Loopback test evidence does not prove private deployment security. |
| Package manifests and lockfile | Add server WebSocket dependencies and build the shared protocol package before server tests and type-checks. |
| `docker-compose.yml`, `.env.example` | An optional profile builds the pinned Playmat source with trusted-header SSO, fixed app-only trust, an internal network, persistent engine data and resource limits. PR CI validated unpublished ports and rejected an untrusted peer; production deployment remains pending. |
| About pages, release notes, README and `docs/HANDOFF.md` | Describe the initial modes and their limits accurately. Do not claim phase acceptance or verified production engine security. |

Before delivery, test the engine-disabled app, workspace build, unit/static
tests, Docker runtime and the full `npm run test:all` gate. Verify Android
delivery after an authorized merge. The local live game passed, but phase 1 is
not accepted until the private engine and hidden-state boundaries are verified.

## Remaining phase 1

1. The source-pinned engine service and private Compose network passed the PR
   integration workflow, including health, startup and no published engine
   ports. Production-host deployment, persistence, platform support and
   engine-disabled operation still need verification.
2. The workflow rejected a trusted-header identity spoofed by an untrusted
   peer. Keep account revocation, name collision, per-player isolation and
   takeover coverage; verify any remaining cases against the configured
   deployment.
3. Live lookup, exact-printing verification, deck validation, AI table start,
   terminal game result, hidden-state isolation and immutable saved-deck
   verification passed in PR CI. Retain the unsupported-card and format tests.
4. Verify reconnect and engine outage behavior on the configured deployment.
   The integration code has finite timeouts and CI passed the live game test,
   but reconnect and outage recovery have not been accepted against the
   private engine profile.
5. Review every Phase 1 acceptance criterion in the specification and record
   the commands, results, unresolved limitations and security evidence before
   accepting the native gameplay phase.

The 0.30.0 implementation began phases 2 through 4 before the remaining Phase 1
acceptance criteria passed. Treat it as a functional prototype, not an accepted
release of those phases. Do not declare phases 2 through 4 complete or expose
the engine in a production deployment until the Phase 1 security and deployment
evidence is recorded. Do not assume unverified signatures, permissions or
deployment behavior.

## Later phases

| Phase | Objective | Gate |
| --- | --- | --- |
| 2 | Native Play workspace, lobby and rules-engine game controls | Complete a real game in the native UI |
| 3 | Manual tabletop and offline solo, including original custom cards | Complete a manual custom-card game and verify offline solo |
| 4 | Private multiplayer and Commander | Complete 1v1 and four-player games; verify hidden-state isolation and reconnect |
| 5 | Match history and analytics | Persist authorized results and immutable snapshots across restart |
| 6 | Limited formats and tournaments | Verify each supported format independently |
| 7 | Custom rules research | Licensing decision and isolated proof of concept |

Manual play and engine-enforced play remain distinct. Forge and executable
custom-card mechanics are future research, not a launch dependency.
