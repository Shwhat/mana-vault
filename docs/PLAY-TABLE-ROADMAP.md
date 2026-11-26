# Play table roadmap and proposed file plan

Status: the first foundation slice is implemented locally. An upstream AI
game passed against a test-only engine, but no playable table or game
connection is available in Mana Vault yet. The
[architecture assessment](PLAY-TABLE-ARCHITECTURE.md) records the candidate
engine revision, security boundary and limitations.

## First implementation slice

Shared contracts and transport-independent protocol parsing are in place, not a
new game UI or an MTG rules engine. This slice is not completion of phase 1.

| Files | Proposed change |
| --- | --- |
| `packages/play-core/package.json`, `tsconfig.json`, `src/index.ts`, `src/types.ts`, `src/engine.ts` | Runtime-independent, player-specific views and zone projection, typed actions and prompts, explicit capabilities and adapter contract. No full engine state or invented rules. |
| `packages/playmat-protocol/package.json`, `tsconfig.json`, `src/index.ts`, `src/rpc.ts`, `src/events.ts` | Discovery request and response/event parsing with explicit errors and an allowlist. No transport, login, gameplay requests or state-patch support. |
| `packages/play-core/src/*.test.ts`, `packages/playmat-protocol/src/*.test.ts` | Focused tests for capability handling, zone visibility, protocol errors, asynchronous events and unknown messages. |
| `package.json`, `package-lock.json`, package manifests, TypeScript build configuration | Add `packages/*`, order builds before dependent apps, and ensure tests and type-check include both packages. Regenerate the lockfile. |
| `Dockerfile` and relevant CI configuration | Copy and build shared workspaces in build and production stages. Runtime image validation remains pending. No engine service is added. |
| `apps/web/src/about/02-capabilities.md`, release notes, README and `docs/HANDOFF.md` | Update only for actual resulting behavior and release status; do not advertise playable tables. Synchronize app versions for the delivered update. |

Before delivery, test the engine-disabled app, workspace build, unit/static
tests, Docker runtime and the full `npm run test:all` gate. Verify Android
delivery after an authorized merge. No automated game is claimed by this slice.

## Remaining phase 1

1. Select and verify a source-built or digest-pinned engine image and private
   service. The loopback-only test build verified health and discovery, but
   was modified for local binding and does not provide production isolation.
   Record platform, resources, persistence and engine-disabled operation.
2. Implement and test the server-side identity bridge described in the
   architecture assessment, including spoofing, name collision, revocation,
   session isolation and takeover. No shared privileged player session.
3. Use the internal access-checked immutable deck snapshot for engine
   lookup/validation and match persistence. Snapshot tests cover owners,
   shared-deck access, printing details and missing entries. Still verify
   maybeboard exclusion, exact printing versus name fallback, unsupported
   cards and commander/sideboard formats against the engine.
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
