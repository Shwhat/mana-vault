# Play table roadmap and proposed file plan

Status: server-side integration foundations are implemented locally. Synthetic
tests cover the protocol client, deck conversion and opaque account mapping,
but no playable table or game connection is available in Mana Vault yet. The
[architecture assessment](PLAY-TABLE-ARCHITECTURE.md) records the candidate
engine revision, security boundary and limitations.

## Implemented foundation work

The shared play contracts and transport-independent protocol parsing remain in
place. Additional server-only foundations now include an allowlisted RPC
WebSocket client, a persistent opaque engine identity mapping, and conversion
of immutable deck snapshots to exact-printing engine deck lists. Focused
synthetic tests cover request/response handling, restore-token rotation,
takeover refusal, unsupported printing detection and disabled accounts. These
foundations are not an integrated or playable feature and do not complete
phase 1.

| Files | Implemented scope and remaining gate |
| --- | --- |
| `apps/server/src/play/engine-identity.ts`, `app.ts` | Persist an opaque engine name per active Mana Vault user and initialize its table. Actual trusted-header identity isolation, revocation of active engine sessions and a private engine deployment remain unverified. |
| `apps/server/src/play/playmat-connection.ts`, `packages/playmat-protocol/src/rpc.ts` | Server-only WebSocket client with an RPC allowlist, finite limits, in-memory restore tokens and takeover refusal. No app route, session lifecycle manager or gameplay event projection is integrated. |
| `apps/server/src/play/deck-converter.ts` | Convert authorized snapshots to exact catalog printings, exclude maybeboard, reject unsupported entries and detect name fallback. Live engine lookup and validation are not yet exercised. |
| `apps/server/src/play/*.test.ts`, `packages/playmat-protocol/src/*.test.ts` | Synthetic tests cover the implemented foundations only. They are not evidence of engine security or game acceptance. |
| Package manifests and lockfile | Add server WebSocket dependencies and build the shared protocol package before server tests and type-checks. |
| `Dockerfile` and relevant CI configuration | Shared workspaces are included in build and production stages. Runtime image validation remains pending; no engine service is added. |
| About pages, release notes, README and `docs/HANDOFF.md` | Do not advertise playable tables. Update user-facing documentation only after resulting behavior exists; keep the handoff and release state accurate. |

Before delivery, test the engine-disabled app, workspace build, unit/static
tests, Docker runtime and the full `npm run test:all` gate. Verify Android
delivery after an authorized merge. No automated game is claimed by this slice.

## Remaining phase 1

1. Select and verify a source-built or digest-pinned engine image and private
   service. The loopback-only test build verified health and discovery, but
   was modified for local binding and does not provide production isolation.
   Record platform, resources, persistence and engine-disabled operation.
2. Integrate and test a server-side session manager and authenticated routes.
   Verify trusted-header spoofing, name collision, disable/delete/logout
   revocation, per-player isolation and takeover behavior. No shared privileged
   player session.
3. Use the internal access-checked immutable deck snapshot for live engine
   lookup and validation. Synthetic tests cover maybeboard exclusion, exact
   printing checks, unsupported entries and unsafe commander/sideboard
   mappings; verify these against the pinned engine before starting a match.
4. Build a minimal server-side harness to create a table, add a human and AI,
   start a match, receive player-specific views and prompts, and send valid
   responses. A real engine-reported terminal result is required; a mock or
   health check is not sufficient. Verify reconnect, outage behavior and that
   no gameplay changes decks or collections.
5. Review the phase 1 acceptance criteria in the specification and record the
   actual commands, results, unresolved limitations and security evidence
   before moving to native gameplay.

The exact files for these later steps depend on live protocol and identity
findings. Propose their changes before implementation rather than assuming
unverified signatures, permissions or deployment behavior.

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
