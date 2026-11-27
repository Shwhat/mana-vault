# Play table roadmap and proposed file plan

Status: the 0.30.0 work adds an initial native Play workspace, offline solo
play, and server-stored private manual tables for two or four players. Focused
tests cover table membership, hidden hands and libraries, revision-checked
actions, turn changes, reconnect after a page reload and leaving a table.
Phase 1 remains incomplete because the private Compose deployment,
trusted-header isolation, hidden-state isolation and live engine reconnect
have not been verified. The new UI is not acceptance of phases 2 through 4.

## Implemented foundation work

The shared play contracts and transport-independent protocol parsing remain in
place. The parser recognizes the pinned engine's gameplay and player-prompt
events, and table creation carries per-seat player types. Server-side integration includes an allowlisted RPC WebSocket client, a
persistent opaque engine identity mapping, conversion of immutable deck
snapshots to exact-printing engine deck lists, authenticated routes, prompt
freshness checks and account session cleanup. A Compose `play` profile builds
the pinned engine source on a private internal network with no published
engine ports. A live test completed an AI game using a saved Mana Vault deck.
The Compose profile and trusted peer isolation remain unvalidated because
Docker, Podman and WSL are unavailable here. The 0.30.0 branch adds a first
user-facing Play workspace, but its phase acceptance gates remain pending.

| Files | Implemented scope and remaining gate |
| --- | --- |
| `apps/server/src/play/engine-identity.ts`, `app.ts`, `admin.ts` | Persist an opaque engine name per Mana Vault user, manage server-side sessions and close them on account or last-device revocation. Private trusted-header isolation remains unverified. |
| `apps/server/src/play/playmat-connection.ts`, `play-sessions.ts`, `routes.ts`, `packages/playmat-protocol/src/rpc.ts` | Server-only WebSocket client, RPC allowlist, authenticated game routes, per-user event queues, prompt freshness and takeover refusal. The initial Engine AI UI is present; deployment and prompt coverage remain incomplete. |
| `apps/server/src/play/manual-routes.ts`, `apps/web/src/views/PlayView.tsx` | Server-authoritative manual table membership and state for two or four players, per-player hidden-zone projection, invitation-code read-only spectators, offline solo mode and a first native workspace. Full manual interactions and match history are not implemented. |
| `apps/server/src/play/deck-converter.ts`, `routes.ts` | Convert authorized immutable snapshots, verify exact printings, validate against the live engine and start the human-plus-AI match. The local acceptance test completed a real game; production deployment and hidden-state boundaries are unverified. |
| `apps/server/src/play/*.test.ts`, `packages/playmat-protocol/src/*.test.ts` | Synthetic lifecycle and route tests plus an optional real-engine acceptance test. Loopback test evidence does not prove private deployment security. |
| Package manifests and lockfile | Add server WebSocket dependencies and build the shared protocol package before server tests and type-checks. |
| `docker-compose.yml`, `.env.example` | An optional profile builds the pinned Playmat source with trusted-header SSO, fixed app-only trust, an internal network, persistent engine data and resource limits. Docker validation and actual network isolation remain pending. |
| About pages, release notes, README and `docs/HANDOFF.md` | Describe the initial modes and their limits accurately. Do not claim phase acceptance or verified production engine security. |

Before delivery, test the engine-disabled app, workspace build, unit/static
tests, Docker runtime and the full `npm run test:all` gate. Verify Android
delivery after an authorized merge. The local live game passed, but phase 1 is
not accepted until the private engine and hidden-state boundaries are verified.

## Remaining phase 1

1. Build and verify the source-pinned engine service and private network. The
   Compose profile is configured but untested; the session-local test build
   reported healthy and completed the Mana Vault deck AI game, but does not
   prove deployment isolation. Record platform, resources, persistence and
   engine-disabled operation.
2. Verify trusted-header spoofing, name collision, disable/delete/logout and
   last-device revocation, per-player isolation and takeover behavior against
   the real configured deployment. Synthetic revocation and takeover tests
   pass; deployment and multi-human hidden-state isolation remain unverified.
3. Live lookup, exact-printing verification, deck validation, AI table start,
   terminal game result and immutable saved-deck verification passed against
   the session-local engine. Retain the unsupported-card and format tests.
4. Verify reconnect and engine outage behavior on the configured deployment.
   The integration code has finite timeouts and the live game test passes, but
   reconnect and outage recovery have not been accepted against the private
   engine profile.
5. Review every Phase 1 acceptance criterion in the specification and record
   the commands, results, unresolved limitations and security evidence before
   starting the native gameplay phase.

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
