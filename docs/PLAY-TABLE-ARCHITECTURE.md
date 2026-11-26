# Play table architecture assessment

Status: foundation contracts and protocol parsing are implemented. An isolated
test-only engine and an upstream AI game were exercised, but no game is
connected to Mana Vault. This assessment begins phase 1 of
[the specification](MANA-VAULT-PLAY-TABLE-SPEC.md).

## Baseline

- Mana Vault 0.25.0 has a Fastify server, SQLite, a React web app and a
  Capacitor Android client. Before the foundation slice, the root npm
  workspace included only `apps/*`, and the Dockerfile copied only the server
  and web workspaces. The slice adds shared `packages/*` workspaces.
- The deck Playtest tab in `apps/web/src/views/DeckView.tsx` is an in-memory
  solo tool. It uses main-deck cards for the shuffled library, displays
  commanders separately, and does not change the saved deck. Preserve it.
- Deck access is checked through `access` in `apps/server/src/library.ts`.
  Deck rows retain Oracle identity, printing, zone, quantity and finish, with
  card names, sets and collector numbers available through `decks.ts`. Deck
  sharing grants member access; ownership of physical cards is not required.
- Local checkout: release branch at `8d843c5`, with `origin/main` at merge
  commit `097fad2`; the application versions are 0.25.0. No open pull requests
  were listed during this assessment. The untracked specification is user
  material and must not be overwritten.

## Candidate engine and compatibility

The assessment pins its source references to Playmat commit
[`7bd086f7a390846cad7b397b762d8b5c84da332e`](https://github.com/arcanite24/playmat/tree/7bd086f7a390846cad7b397b762d8b5c84da332e).
This is a **candidate source pin**, not a tested release or image digest.
Do not deploy a moving `master` tag as the integration pin. Select and verify
an image digest built from this commit, or build the pinned source, before
claiming a working engine. Record the image, platform, configuration and
observed engine version in the live test results.

| Area | Evidence from the pinned source | Mana Vault status |
| --- | --- | --- |
| Transport | [WebSocket API](https://github.com/arcanite24/playmat/blob/7bd086f7a390846cad7b397b762d8b5c84da332e/docs/WebSocketAPI.md): JSON-RPC 2.0 positional parameters, separate pushed events, connection-bound sessions | Discovery responses parsed against a test-only engine; no Mana Vault game transport |
| Health and discovery | API documents `ping`, `getServerState`, `getGameTypes`, `getPlayerTypes` and `getDeckTypes`; [Compose](https://github.com/arcanite24/playmat/blob/7bd086f7a390846cad7b397b762d8b5c84da332e/ops/web/docker-compose.yml) uses loopback `/healthz` on 17173 | Test-only engine reported healthy; discovery returned game types, player types and deck formats |
| Decks | `lookupCards` accepts up to 500 entries, returns null for unknowns and may fall back to name; `deckValidate` requires a session | Printing preservation and zone mapping unverified; detect fallback explicitly |
| AI and matches | API documents table creation, joining a human or AI seat, starting a match and responding to prompts; upstream has a [live headless AI test](https://github.com/arcanite24/playmat/blob/7bd086f7a390846cad7b397b762d8b5c84da332e/Mage.Web.Client/src/core/headless/headlessGame.live.test.ts) | Upstream headless test passed against the test-only engine with its sample deck; no Mana Vault game completed |
| Reconnect | Restore token changes at each login; the API documents takeover close code 4001 and `signedInElsewhere` | Window, restore and logout behavior unverified; do not auto-reconnect after takeover |
| Game state | Full views by default; optional diffs need sequence/base tracking and resync | Start with snapshots; hidden-state isolation unverified |
| Deployment | [Server Dockerfile](https://github.com/arcanite24/playmat/blob/7bd086f7a390846cad7b397b762d8b5c84da332e/ops/web/Dockerfile.server) uses Java 17 by default and an `xmage` user; upstream Compose does not publish engine ports | Image, resources, amd64/arm64 behavior and recovery not verified locally |

The pinned [generated API](https://github.com/arcanite24/playmat/blob/7bd086f7a390846cad7b397b762d8b5c84da332e/Mage.Web.Client/src/protocol/generated/api.ts)
and [RPC client](https://github.com/arcanite24/playmat/blob/7bd086f7a390846cad7b397b762d8b5c84da332e/Mage.Web.Client/src/core/rpc/RpcClient.ts)
are useful references for typed methods, timeouts, pushed events and takeover
handling. Their browser transport and unrestricted API are not an appropriate
browser-to-engine security boundary for Mana Vault.

## Proposed identity and security boundary

Mana Vault authenticates the user and authorizes every table, deck, action and
spectator request. Its server owns one isolated engine connection per active
player, sends only allowlisted operations, validates payloads and freshness,
and forwards only that player's authorized view and prompts. Never expose the
engine, its admin methods, passwords or restore tokens to the browser. Do not
fall back silently to manual play if the engine fails.

The foundation's zone projection covers only uniformly public, owner-only or
hidden zones. It does not model face-down cards or selective reveals, and its
types and parser do not themselves authorize sessions or make raw engine
events safe to forward. Extend and test those boundaries before connecting
them to a game or browser.

Candidate identity bridge: enable engine authentication and trusted-header SSO,
with a private engine network and only the Mana Vault server trusted to provide
the identity header. Generate and persist a stable, opaque engine name per
Mana Vault account, using Playmat's documented 3 to 14 letters, digits and
underscore constraint; do not use or transmit the user's Mana Vault password.
Use a dedicated fresh engine account database and a reserved namespace to avoid
colliding with existing engine accounts or the engine owner. Fail closed if
isolation, mapping or provisioning cannot be verified.

Playmat's [SSO documentation](https://github.com/arcanite24/playmat/blob/7bd086f7a390846cad7b397b762d8b5c84da332e/ops/web/README.md#single-sign-on)
states that the header is read at the WebSocket handshake only from trusted
peers, fixes the name to the connection, and links existing accounts by name.
The pinned [bridge implementation](https://github.com/arcanite24/playmat/blob/7bd086f7a390846cad7b397b762d8b5c84da332e/Mage.Server/src/main/java/mage/server/websocket/WebSocketServerImpl.java)
checks the actual TCP peer before accepting that header. Its
[connection state](https://github.com/arcanite24/playmat/blob/7bd086f7a390846cad7b397b762d8b5c84da332e/Mage.Server/src/main/java/mage/server/websocket/ConnectionState.java)
also grants the `gameHost` capability to trusted peers if requested, so the
adapter must never expose arbitrary capabilities or RPCs to clients.
This is a design candidate, not a verified integration: prove the actual
server-side handshake and trust configuration, spoof rejection, collisions,
disable/delete/logout revocation, per-player isolation, takeover and reconnect
before enabling games. Do not reuse the upstream proxy's Caddy deployment as a
shortcut or trust a shared Docker gateway that can be reached by other clients.

Keep restore tokens server-side for the shortest practical lifetime, avoid
logging secrets or private views, and define cleanup and rotation on logout,
account disablement, session expiry and engine restart. An app restart or engine
restart is not the same as a temporary network reconnect. Upstream describes
game saving as unreliable; active-match recovery is not promised.

## Deck and deployment approach

Take an immutable snapshot only after checking existing deck access. Preserve
the Mana Vault printing and artwork independently of the engine's rules identity.
Exclude maybeboard; map commander and sideboard only after checking the chosen
engine format. Report every unsupported or ambiguous card and any name fallback
before starting a match. Engine operations must not write deck or collection
rows.

An eventual optional engine service should have no host-published game or
admin ports, use only a private network, persistent engine data with a
documented backup policy, a tested health check and finite resource limits.
The pinned server constructs the WebSocket listener with a port-only
`InetSocketAddress`, so it binds all interfaces rather than honoring the
configured server address. A host-based test must prevent external access; a
loopback address in `config.xml` alone does not isolate the WebSocket.
Even loopback does not establish trusted-header identity isolation from other
local processes on a shared machine.
The existing app port, Dockhand workflow and engine-disabled behavior must
remain intact. The upstream server runs as its own user; do not assume its UID
or volume permissions match Mana Vault's UID 65532. The upstream stack includes
other services and a proxy; it is not a drop-in deployment for this repository.
Updates and rollback need a verified image digest and compatible data backup.

### Local engine evidence

On Windows, the candidate source was built with session-local JDK 17 and Maven.
For the test distribution only, the WebSocket listener was changed to bind
`127.0.0.1`; authentication and trusted-header SSO were not enabled. The
server reported version `1.4.63-V2`, `/healthz` returned `ok`, and both the
health and WebSocket listeners were verified on loopback. A probe used the
workspace protocol encoder and parser for `ping`, `getServerState`,
`getGameTypes`, `getPlayerTypes` and `getDeckTypes`. The upstream
`headlessGame.live.test.ts` passed with its own sample deck and reported a
game over. The temporary server was stopped after testing.

These results do not validate the unmodified listener, an engine image,
Mana Vault deck mapping, user authentication, hidden-state isolation or
reconnection. In particular, the unauthenticated local test does not meet the
phase 1 game gate, and a shared host cannot safely treat every local process
as a trusted identity proxy.

A separate test-only engine used a fresh account database, authentication,
synthetic identities and a trusted-header configuration. Two connections
signed in under their respective header identities, a restore token was
issued, a mismatched login was rejected, and a header from an untrusted
loopback source was rejected. The server was then stopped. This verifies
upstream behavior in that configuration, not private deployment or a Mana
Vault identity bridge; another local process using the trusted peer address
could still impersonate an identity.

## Licensing

The pinned [Playmat license](https://github.com/arcanite24/playmat/blob/7bd086f7a390846cad7b397b762d8b5c84da332e/LICENSE.txt)
and [XMage license](https://github.com/magefree/mage/blob/master/LICENSE.txt)
are MIT. Preserve applicable copyright and license notices if code is reused,
and review dependency licenses. [Forge's license](https://github.com/Card-Forge/forge/blob/master/LICENSE)
is GPL-3.0; do not copy its code or scripts without a separate licensing review.
Software licenses do not grant rights to card data, art or trademarks. No
repository license change is proposed.

## Next steps and open risks

The file plan and acceptance gates are in
[PLAY-TABLE-ROADMAP.md](PLAY-TABLE-ROADMAP.md). Unknowns include trusted-header
behavior in the actual deployment, image provenance and
architecture support, AI and format coverage, printing fallback, private
prompts, and restart/reconnection behavior. None is validated by this document.
