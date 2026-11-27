# Mana Vault handoff

## 0.43.0 (2026-11-27): Manual multiplayer outcomes

- A seated player can report their own loss separately from concession. Eliminated players cannot act or search their library, turns skip them, and the table closes with one remaining player. Closed tables show player-reported outcomes to participants and spectators.
- Focused server tests and browser scenarios passed, including 1v1 and four-player games ended through player-reported poison losses. Manual rules are still player-resolved; this does not establish full phase acceptance.
- `PW_CHANNEL=chrome npm run test:all` passed: 426 server tests (3 skipped), 67 web tests, 3 play-core tests, 3 protocol tests, 3 Wiki tests and 126 browser tests (1 live-engine test skipped locally). Version and guide static checks passed.
- Delivery is pending. The 0.41.0 private-engine workflow passed saved-deck and hidden-state tests, native land play ending by concession, and spoof rejection. The 0.42.0 private-engine workflow is running. Full native gameplay, production deployment and engine reconnect acceptance remain incomplete.

## 0.42.0 (2026-11-27): Manual battlefield copies

- Copy your own battlefield cards as tokens in offline solo and manual multiplayer. Copies retain face-down status but start untapped without counters or attachments. Copying an opponent's card is not supported.
- Focused offline, server and browser regressions passed, including authorization and face-down privacy. `PW_CHANNEL=chrome npm run test:all` passed: 426 server tests (3 skipped), 67 web tests, 3 play-core tests, 3 protocol tests, 3 Wiki tests and 126 browser tests (1 live-engine test skipped locally). Version and guide static checks passed.
- Delivery is pending. Full native gameplay and phase acceptance remain incomplete.

## 0.41.0 (2026-11-27): Engine choices and distributions

- Display both engine-provided piles and submit the selected pile. Support searchable string and keyed list choices, optional cancellation and engine-provided special choices with an item selected. The pinned bridge rejects null string responses; normal optional-choice cancellation uses an empty string, while special choices without an item remain unavailable.
- Support engine amount distributions with per-entry and total validation, optional engine-provided cancellation, a 500-entry limit and a 1000-character response limit.
- The 0.40.0 private-engine workflow passed saved-deck and hidden-state tests, native land play ending by concession, and the trusted-identity spoof rejection. Exact-head validation for 0.41.0 remains pending.
- Focused prompt and server tests and `PW_CHANNEL=chrome npm run test:all` passed: 426 server tests (3 skipped), 66 web tests, 3 play-core tests, 3 protocol tests, 3 Wiki tests and 126 browser tests (1 live-engine test skipped locally). Version and guide static checks passed.
- Delivery is pending. Full native gameplay and phase acceptance remain incomplete.

## 0.40.0 (2026-11-27): Manual battlefield attachments

- Manual solo and multiplayer cards can attach to battlefield cards, including opponents' cards. The server rejects cycles and unauthorized source cards, clears attachments when either card leaves and preserves face-down privacy.
- Focused server, offline and multiplayer attachment tests and `PW_CHANNEL=chrome npm run test:all` passed: 426 server tests (3 skipped), 66 web tests, 3 play-core tests, 3 protocol tests, 3 Wiki tests and 126 browser tests (1 live-engine test skipped locally). Delivery remains pending; full native gameplay and phase acceptance remain incomplete.

## 0.39.2 (2026-11-27): Engine numeric prompts

- Use the engine-supplied minimum and maximum for numeric prompts within the server limit, reject invalid input and allow cancellation.
- Focused engine prompt browser regression and `PW_CHANNEL=chrome npm run test:all` passed: 426 server tests (3 skipped), 65 web tests, 3 play-core tests, 3 protocol tests, 3 Wiki tests and 126 browser tests (1 live-engine test skipped locally). Delivery remains pending; full native gameplay and phase acceptance remain incomplete.
- The 0.39.1 Play engine CI failed while building the engine because Maven Central returned HTTP 429; engine tests did not run for that commit.

## 0.39.1 (2026-11-27): Engine prompt clarity

- Clarify the limitation message shown with engine selection prompts that already offer a pass response.
- Validation: the focused engine browser regression passed. `PW_CHANNEL=chrome npm run test:all` passed: typechecks, 426 server tests (3 skipped), 65 web tests, 3 play-core tests, 3 Playmat protocol tests, 3 Wiki tests and 126 browser tests (1 live-engine test skipped locally). Delivery is pending. Full native gameplay and phase acceptance remain incomplete.

## 0.39.0 (2026-11-27): Multiplayer face-down cards

- Allow seated players to play cards face down directly from hand, turn their battlefield cards face down and reveal them. Public projections omit the identities and artwork of face-down cards.
- Validation: focused server and multiplayer browser regressions passed. `PW_CHANNEL=chrome npm run test:all` passed: typechecks, 426 server tests (3 skipped), 65 web tests, 3 play-core tests, 3 Playmat protocol tests, 3 Wiki tests and 126 browser tests (1 live-engine test skipped locally). Delivery is pending.
- Version 0.39.0 was pushed as `46ff307` to draft PR #52. Android passed and produced `mana-vault-0.39.0-debug`; the exact-head Play engine workflow is running.
- Manual table rules remain player-resolved; native engine gameplay and phase acceptance remain incomplete.

## 0.38.0 (2026-11-27): Private multiplayer library search

- Add private library search and selected-card movement to hand for seated manual-table players. The player-only endpoint returns a sorted list rather than draw order, and actions remain revision checked.
- The live engine UI test now passes priority when waiting at an instants-only prompt before a legal land-play opportunity; this change still needs verification against the real engine.
- Validation: focused server and multiplayer browser regressions passed. `PW_CHANNEL=chrome npm run test:all` passed before the live-test-only update: typechecks, 426 server tests (3 skipped), 65 web tests, 3 play-core tests, 3 Playmat protocol tests, 3 Wiki tests and 126 browser tests (1 live-engine test skipped locally). Version 0.38.0 was pushed as `a901e32` to draft PR #52. Android passed and produced `mana-vault-0.38.0-debug`; the isolated Play engine workflow passed saved-deck, hidden-state, native UI land play and concession, and spoof-rejection checks. This is not a non-concession game.
- Manual table rules remain player-resolved; native engine gameplay and phase acceptance remain incomplete.

## 0.37.0 (2026-11-27): Offline solo library search

- Add a searchable offline solo library, moving selected cards to hand and shuffling the remaining library without mutating the saved deck.
- Validation: focused manual-play unit tests and the offline original-custom-card browser regression passed. `PW_CHANNEL=chrome npm run test:all` passed: typechecks, 426 server tests (3 skipped), 65 web tests, 3 play-core tests, 3 Playmat protocol tests, 3 Wiki tests and 126 browser tests (1 live-engine test skipped locally). Version and guide static checks passed.
- Version 0.36.1 was pushed as `a5190f0` to draft PR #52; Android passed and produced `mana-vault-0.36.1-debug`. Its live UI check failed while waiting to play a Mountain at an instants-only priority prompt. Version 0.37.0 was pushed as `0274d97`; Android passed and produced `mana-vault-0.37.0-debug`, while its live UI check failed at the same prompt.
- Full native gameplay, real combat and targeting, production deployment/reconnect acceptance and phases 3 through 4 remain open.

## 0.36.1 (2026-11-27): Native engine startup test

- The live browser test now handles the engine's marked starting-player prompt and reports bounded UI diagnostics if the playable Mountain remains unavailable. The UI exposes the engine's prompt marker as an HTML data attribute for this check.
- Version 0.35.0's live workflow failed again to find Play Mountain; saved-deck and hidden-state tests passed, and Android produced `mana-vault-0.35.0-debug`. The cause is not yet established. Version 0.36.0 was pushed as `fddeda3`; Android passed and produced `mana-vault-0.36.0-debug`, but its live UI check failed at the same step.
- Validation: the focused browser regression passed. `PW_CHANNEL=chrome npm run test:all` passed: typechecks, 426 server tests (3 skipped), 64 web tests, 3 play-core tests, 3 Playmat protocol tests, 3 Wiki tests and 126 browser tests (1 live-engine test skipped locally). Version and guide static checks passed.
- Delivery of 0.36.1 is pending. Full native gameplay, real combat and targeting, production deployment/reconnect acceptance and phases 3 through 4 remain open.

## 0.36.0 (2026-11-27): Native combat choices

- Render engine-approved attacker and blocker choices, send their IDs to the current prompt, and confirm declarations with the engine. Add single-step priority passing and target labels with option and card-picker fallbacks.
- Validation: the focused combat/target browser regression passed. `PW_CHANNEL=chrome npm run test:all` passed: typechecks, 426 server tests (3 skipped), 64 web tests, 3 play-core tests, 3 Playmat protocol tests, 3 Wiki tests and 126 browser tests (1 live-engine test skipped locally). Version and guide static checks passed.
- Delivery: the 0.35.0 checkpoint was committed and pushed as `9c7acb2` to draft PR #52; its Android workflow passed and produced `mana-vault-0.35.0-debug`, and its exact-head Play engine workflow is running. Version 0.36.0 awaits commit, push and its own exact-head workflows.
- Mocked prompts do not establish complete real-game combat or targeting. Phase 1 production deployment/reconnect acceptance and phases 2 through 4 remain open.

## 0.35.0 (2026-11-27): Engine ability choices and solo face-down cards

- Render `GAME_CHOOSE_ABILITY` choices from the pinned Playmat UUID-to-label map and submit the chosen UUID to the active prompt.
- Use the engine's supplied labels for boolean prompts, including the Mulligan and Keep buttons.
- Fix manual solo battlefield face-down and reveal controls, including for original custom cards offline.
- Validation: the two focused browser regressions passed. `PW_CHANNEL=chrome npm run test:all` passed: typechecks, 426 server tests (3 skipped), 64 web tests, 3 play-core tests, 3 Playmat protocol tests, 3 Wiki tests and 126 browser tests (1 live-engine test skipped locally). Version/lockfile static checks and `git diff --check` passed.
- Delivery: the 0.34.0 checkpoint was committed and pushed as `e408b4a` to draft PR #52; its exact-head Android workflow passed and its Play engine workflow is running. Version 0.35.0 awaits commit, push and its own exact-head workflows.
- Phase 1 production deployment/reconnect acceptance and Phase 2 real-game completion, broader prompts, targeting and combat remain open. Phases 3 and 4 also remain incomplete.

## 0.34.0 (2026-11-27): Native Engine AI mana payment

- Read playable object IDs from the pinned Playmat `canPlayObjects.objects` map, prefer the active prompt's map over older game state, and expose approved battlefield objects as Tap for mana actions during `GAME_PLAY_MANA`.
- Extend the mocked browser regression through a prompt-bound `sendPlayerUUID` response for mana payment.
- Validation: the focused Engine AI browser regression passed. `PW_CHANNEL=chrome npm run test:all` passed: typechecks, 426 server tests (3 skipped), 64 web tests, 3 play-core tests, 3 Playmat protocol tests, 3 Wiki tests and 126 browser tests (1 live-engine test skipped locally). Version/lockfile static checks and `git diff --check` passed.
- Phase 1 production deployment/reconnect acceptance and Phase 2 real-game completion, broader prompts, targeting and combat remain open. Phases 3 and 4 also remain incomplete.
- Delivery: 0.34.0 was pushed to PR #52 as `e408b4a`. Android passed and produced `mana-vault-0.34.0-debug`. Its Play engine workflow passed saved-deck and hidden-state tests but failed to find Play Mountain in the native UI. The test could click Yes on a mulligan prompt, which the pinned engine treats as mulligan rather than keep; 0.35.0 uses the engine's actual labels and selects Keep. Whether this resolves the failure requires exact-head live verification. PR #52 remains a draft and unmerged.

## 0.33.0 (2026-11-27): Native Engine AI battlefield choices

- Add a Choose action for battlefield cards that the engine lists in `canPlayObjects` during `GAME_SELECT`, using the same prompt-bound UUID response as hand-card play.
- Add browser coverage for engine-approved versus unavailable battlefield cards and verify the submitted card UUID.
- Validation: the focused Engine AI browser regression passed. `PW_CHANNEL=chrome npm run test:all` passed: typechecks, 426 server tests (3 skipped), 64 web tests, 3 play-core tests, 3 Playmat protocol tests, 3 Wiki tests and 126 browser tests (1 live-engine test skipped locally). `git diff --check` and synchronized version/lockfile static tests passed.
- Phase 1 production deployment/reconnect acceptance and Phase 2 non-concession gameplay, broader prompts, targeting and combat remain open. Phases 3 and 4 also remain incomplete.
- Delivery: commit `aab1f8d` is pushed to PR #52; Android passed, but the Play engine workflow failed because the UI did not find the hand-card action. The 0.34.0 change corrects the `canPlayObjects.objects` lookup. PR #52 remains a draft and unmerged.

## 0.32.2 (2026-11-27): Native Engine AI priority control

- Add the supported `PASS_PRIORITY_UNTIL_NEXT_MAIN_PHASE` player action to the `GAME_SELECT` prompt and test its HTTP acceptance in the private-engine browser flow.
- Validation: `PW_CHANNEL=chrome npm run test:all` passed: typechecks, 426 server tests (3 skipped), 64 web tests, 3 play-core tests, 3 Playmat protocol tests, 3 Wiki tests and 125 browser tests. The live-engine test was skipped locally because no Playmat URL is configured; exact-head CI remains required. The production build reports the existing large-chunk warning. Version/lockfile checks and `git diff --check` passed.
- Phase 1 deployment/reconnect acceptance and Phase 2 native-game completion remain open. This control does not validate normal game completion or all gameplay prompts.
- Delivery: commit `bf4594b` is pushed to PR #52. Its Android workflow passed and produced `mana-vault-0.32.2-debug`; its private-engine workflow is running. PR #52 remains a draft and unmerged.

## 0.32.1 (2026-11-27): Multiplayer game-end acceptance

- Extend the two-player and four-player manual Commander browser tests through concession. Verify the table closes and every seated player's view, plus the 1v1 spectator view, receives the ended state.
- This adds test coverage only. Manual tables still do not enforce game rules, and this does not complete Phase 4 acceptance.
- Validation: focused `PW_CHANNEL=chrome npm run test:e2e:run -- tests/e2e/play.spec.ts` passed (3 tests). `PW_CHANNEL=chrome npm run test:all` passed: typechecks, 426 server tests (3 skipped), 64 web tests, 3 play-core tests, 3 Playmat protocol tests, 3 Wiki tests and 125 browser tests. The live-engine test was skipped locally because no Playmat URL is configured. Version/lockfile checks and `git diff --check` passed.
- Delivery: the 0.32.1 changes are ready to commit and push. The 0.32.0 Android workflow passed, but its exact-head private-engine workflow is still running; 0.32.1 requires its own CI run. PR #52 remains a draft and unmerged.

## 0.32.0 (2026-11-27): Native Engine AI card play

- The Engine AI workspace now renders a Play action for hand cards present in the current `canPlayObjects` list during `GAME_SELECT`, and responds with the selected card UUID. The private-engine browser flow now plays a Mountain before conceding.
- Synchronized workspace manifests, lockfile, release notes, Capabilities, Play guide, README, roadmap and handoff for 0.32.0.
- Validation: `PW_CHANNEL=chrome npm run test:all` passed: typechecks, 426 server tests (3 skipped), 64 web tests, 3 play-core tests, 3 Playmat protocol tests, 3 Wiki tests and 125 browser tests. The live-engine browser test was skipped locally because no Playmat URL is configured; it must pass in CI on the pushed head. The production build reports the existing large-chunk warning. `git diff --check` and version/lockfile checks passed.
- Phase 1 production deployment and engine reconnect/outage acceptance remain open. Phase 2 still lacks a non-concession completed game and broader prompt, spell, target and combat coverage. Phase 3 and Phase 4 acceptance remain incomplete.
- Delivery: PR #52 is a draft. Commit/push, current-head CI and review status remain pending. Do not merge until required checks and approvals pass; post-merge server/container and Android artifacts are also pending.

## 0.31.1 (2026-11-27): Multiplayer play acceptance

- Expanded the two-player browser flow to reload both seated players, exercise shared table state, verify hidden hands and complete a full turn cycle. The four-player flow checks each seat's turn and viewer-specific hand visibility. The custom-card solo flow now runs while the browser is offline.
- Synchronized all workspace versions and lockfile records at 0.31.1; updated the release notes, roadmap and handoff.
- Validation: final full validation is pending after this test-only change. The 0.31.0 snapshot passed `PW_CHANNEL=chrome npm run test:all`: typechecks, 426 server tests (3 skipped), 64 web tests, 3 play-core tests, 3 Playmat protocol tests, 3 Wiki tests and 125 browser tests (1 live-engine browser test skipped locally). Static tests and `git diff --check` passed.
- Phase 1 production deployment and engine reconnect/outage acceptance remain open. Phase 2 native gameplay is incomplete. Phase 3 and Phase 4 acceptance still exceeds the current browser coverage.
- Delivery: PR #52 remains a draft. Current-head CI, review, merge and matching post-merge artifacts remain pending.

## 0.31.0 (2026-11-27): Native Play engine controls

- Added a native concession control to current Engine AI prompts and a browser acceptance test that starts a saved-deck game, answers the opening-hand prompt, concedes and waits for the engine-reported terminal result. The test is configured to run inside the private Playmat integration network.
- Bumped synchronized workspace versions to 0.31.0 and updated the README, Capabilities, Play guide, release notes and roadmap. Kept the Phase 2 limitation explicit: the new browser flow ends by concession and does not verify a normal win, broad prompt support, spell casting, targeting or combat.
- Validation: `PW_CHANNEL=chrome npm run test:all` passed: typechecks, 426 server tests (3 skipped), 64 web tests, 3 play-core tests, 3 Playmat protocol tests, 3 Wiki tests and 125 browser tests (1 live-engine browser test skipped because the local environment has no configured engine). The production build reports the existing large-chunk warning. `git diff --check` and version/lockfile checks passed.
- The Play engine integration and Android checks passed on PR base commit `8a84091713ab617128b1f51989f5b47a4030ca1b`. The engine workflow validated the private Compose profile, unpublished engine ports, live saved-deck and hidden-state tests, and rejection of a spoofed trusted identity. Local Docker, Podman and WSL remain unavailable.
- Phase 1 engine reconnect/outage and production deployment acceptance remain open. Phase 2 native engine gameplay is incomplete. Phase 3 and Phase 4 acceptance remains broader than the manual custom-card and four-player turn-cycle browser tests.
- Delivery: PR #52 remains a draft. The new private-engine browser workflow and full validation, review, merge and matching post-merge container/Android artifacts are pending.

## 0.30.0 (2026-11-27): Native Play workspace and manual tables

- Added a top-level Play workspace with Engine AI, manual solo and multiplayer table modes. Engine AI depends on the separately configured Playmat service; manual play does not enforce Magic rules.
- Added server-stored two- and four-player tables with invitation codes, saved-deck snapshots, revision-checked actions, reconnect polling, read-only spectators and player-specific projections that omit opponents' hands and libraries.
- Added manual actions for drawing, shuffling, zone movement, tapping, counters, tokens, life, poison, commander damage, turn changes, concession and leaving a table. Invitation-code spectators have read-only public views. Phone-mode tabs stay compact.
- Validation: `PW_CHANNEL=chrome npm run test:all` passed at the original 0.30.0 snapshot: typechecks, 426 server tests (3 skipped), 63 web tests, 3 play-core tests, 3 Playmat protocol tests, 3 Wiki tests and 123 browser tests. The production build reports the existing large-chunk warning.
- PR CI validated the private Compose profile, the absence of published engine ports, live saved-deck and hidden-state behavior, and the trusted-header spoofing boundary on commit `8a84091713ab617128b1f51989f5b47a4030ca1b`. Docker, Podman and WSL were unavailable for local validation. Production deployment and engine reconnect/outage behavior remain unverified, and Play Table phases 2 through 4 are not accepted as complete.
- Delivery: this work is not merged. Required PR checks and approvals, container and Android CI results, and the matching debug APK remain pending.

## 0.29.0 (2026-11-26): Server-side Playmat game integration

- Added authenticated per-user Playmat sessions and server routes for discovery, exact-printing saved-deck validation, private AI table startup, filtered player events and prompt-bound responses. A delayed synthetic event test covers delivery while the route is waiting.
- Account deletion and removal of a user's last valid device/session now close the engine session immediately. Logout, disablement, password reset and sign-out-everywhere also revoke it.
- The optional live acceptance test passed against the session-local Playmat 1.4.63-V2 test engine using an exact M21 Island printing: the engine reported a terminal result and the original saved deck remained unchanged.
- Phase 1 is not complete. Docker, Podman and WSL are unavailable in this environment, so the pinned Compose service and private trusted-header boundary are unvalidated. Hidden-state isolation across human players and live reconnect also remain unverified. Phases 2 through 4 are gated and were not started; the existing offline deck Playtest is unchanged.
- Validation: focused Playmat session tests passed (9 tests), including the live saved-deck AI game after the latest account/device revocation changes. Server type-check passed. `PW_CHANNEL=chrome npm run test:all` passed: 423 server tests, 60 web tests, 6 shared package tests, 3 Wiki tests and 122 browser tests; the environment-gated live test is run separately. Version and lockfile checks and `git diff --check` passed. The private Compose deployment and trusted-header boundary remain unvalidated.
- Delivery: 0.29.0 merged in PR #51 at `8cc6ad6d21b43c6413356c9869d6e1510a7885c0`. The exact-SHA container and Android workflows passed, and the matching `mana-vault-0.29.0-debug` artifact and main-branch debug pre-release were verified. This does not satisfy the remaining Phase 1 deployment/security acceptance.

## 0.28.0 (2026-11-26): Play engine integration foundations

- Added an allowlisted server-side Playmat WebSocket client with finite message and request limits, server-only identity header, in-memory restore tokens, reconnect after ordinary disconnects and no automatic reconnect after takeover.
- Added a persistent opaque engine identity mapping initialized with the database, and exact-printing conversion for immutable deck snapshots. Synthetic tests cover transport, identity mapping, unsupported printings, fallback detection, maybeboard exclusion and commander/sideboard restrictions.
- These are not a playable integration: no private engine deployment, authenticated game routes, session manager, live deck validation or real saved-deck AI game exists. Phase 1 remains gated; later phases have not started.
- Validation: `PW_CHANNEL=chrome npm run test:all` passed at 0.28.0: 415 server tests, 60 web tests, 6 shared package tests, 3 Wiki tests and 122 browser tests. `git diff --check` passed.
- PR #50 merged to `main` at `5044766a127016c47b9359f363097623eac85844`. The exact-SHA Android workflow passed and produced `mana-vault-0.28.0-debug`; the matching debug pre-release was updated. The exact-SHA container workflow failed in browser tests before publishing: 121/122 passed, with `release0220.spec.ts` timing out while waiting for the note-conflict dialog. No container was published; investigate on the next CI run.

## 0.27.0 (2026-11-26): Play table deck snapshots

- Added an internal, access-checked immutable deck snapshot with owner and shared-member tests. It retains all zones, selected printings and missing printing entries for later compatibility checks; it does not create games or persist match history.
- A synthetic trusted-header test verified two connection identities, receipt of a restore token, rejection of a mismatched identity and rejection of a spoofed header from an untrusted peer. The test-only loopback engine was stopped. Loopback on a shared machine does not isolate trusted peers.
- Phase 1 remains incomplete: a private engine deployment, secure Mana Vault sessions, deck conversion and validation, a real saved-deck game, hidden-information isolation and reconnect are not yet verified. Later phases remain gated by the specification.
- Validation: `PW_CHANNEL=chrome npm run test:all` passed, including 122 browser tests.
- Delivery verification and the external handoff copy are pending.

## 0.26.0 (2026-11-25): Play table foundations

- Added player-view and engine-capability contracts and a transport-independent Playmat discovery request and message parser, with tests. The architecture assessment and roadmap record the candidate source revision and security risks.
- This is foundation work only: no game transport, identity bridge, engine or playable table was added. The play table specification is included for the remaining phases.
- Validation: `PW_CHANNEL=chrome npm run test:all` passed (6 new package tests, 401 server, 60 web, 3 wiki and 122 browser tests). Built workspace exports were imported successfully. A session-local JDK and Maven built the candidate engine; a test-only loopback modification was healthy, passed discovery using the workspace parser, and passed the upstream sample-deck AI game test. The temporary engine was stopped. Docker, secure identity, a Mana Vault deck and phase 1 gameplay remain unverified; see the architecture assessment.
- At this handoff, PR, server and Android delivery verification and the external handoff copy are pending.

## 0.25.0 (2026-11-25): Trades and dashboard

- Added source and destination selection for account trades, browsing other accounts' trade binders, compact deck picture statuses, a fuller Home screen and readable light-theme menus.
- Validation: `PW_CHANNEL=chrome npm run test:all` passed, including 122 browser tests. PR #47 merged at `097fad2d1d125a4f7206fa3e80c5badcf0282578`; container and Android workflows and the matching debug APK were verified.

## 0.24.8 (2026-11-25): GitHub guide

- The public GitHub wiki was initialized with the 0.24.7 About guide. The publishing workflow updates managed pages on pushes to main and preserves unrelated wiki pages.
- Validation: `PW_CHANNEL=chrome npm run test:all` passed, including 119 browser tests. `git diff --check` passed.
- At handoff, version 0.24.8 and automatic synchronization are pending delivery. Verify the workflow, container, Android build and debug APK for the merged commit.

Last updated: 2026-11-27, version 0.34.0 native Engine AI mana payment in progress; validation and delivery are pending.

## Current next steps (0.34.0)

- Run the focused and full validation gates, review the complete diff, then commit and push to PR #52. Verify native hand-card play, battlefield choices, mana payment and priority pass in the private-engine browser check and all other checks for the exact pushed commit. Keep the PR a draft until the remaining Play Table acceptance gates are met.
- Keep the PR unmerged until required checks and approvals pass. After merge, verify the exact-SHA container and Android workflows and the matching debug APK.
- Complete Phase 1 production deployment and engine reconnect/outage acceptance before describing Play Table phases 2 through 4 as complete.

## Project

Mana Vault is Devon's self-hosted Magic: The Gathering collection and deck manager (repository Shwhat/mana-vault). It runs as one Docker container (Node.js 22, Fastify, SQLite) and serves a React interface for desktop browsers and phones. Version 0.1.0 rebuilt the interface in the OpenSchem design style (program-design-guide skill, "look and shell" adoption), added sign-in, per-account preferences, undo, the About guide and Dockhand-ready deployment. Version 0.2.0 added multiple collections per account, set completion, bulk editing, per-account ownership of collections and decks, sending (copy, share, transfer) with an Inbox, and deck rename and delete. Version 0.3.0 added prices and values, statistics, deck ownership, wishlists, the trade list and trade calculator, copy details (finish, condition, language, trade count), filter tags, the binder layout and flavor name matching. The 0.3.0 features came from a comparison with AeroEagle/mtg-collection-viewer. Version 0.4.0 rebuilt the camera scanner as a continuous, ManaBox-style live scanner with a scanned list. Version 0.5.0 added the Android app (Capacitor around the same interface) with device sign-in, offline use and sync, phone text recognition and Inbox notifications. Version 0.6.0 linked deck cards to collection copies, added proxies and copy details, import and export windows for seven formats, a ManaBox-style scanner with settings and a printing picker, the card page with rulings, a ribbon-only menu with right-click menus, and the phone Home screen. Version 0.7.0 added the Moxfield-style deck builder (Quick add, Edit as text, four views, groups, tags, maybeboard, format checks, playtest, description, history, tokens), the shared collection and deck switcher, the Grid collection layout, and layout fixes from Devon's screenshots. Version 0.8.0 added saved trades (two-column builder, complete with undo, trading between accounts with counter-offers, wishlist matches, public trade binder), card search views (Grid, Binder, List) with paging and owned counts, filters that follow the open view, All collections, the deck header and Add tab, one picker everywhere, ribbon cleanup and scanner fixes (outline and light). Version 0.9.0 added Proxies (a print list kept on the server, sheet settings with a page preview, PDF, MakePlayingCards and MPC Autofill exports, adding printed cards as proxies), the card maker (custom cards in custom sets, saved to the card database for every account), change printing for deck cards and collection copies, adding to the collection or deck selected last, the Decks panel grouped by format with values, right-click menus on collections and decks, `*F*` and `*E*` marks in deck lists, and card database updates that skip bad records. Version 0.10.0 added a finish for every deck card and finish buttons in the printing chooser, so deck cards and collection copies can switch to their foil or etched version. Version 0.11.0 refined card tracking between decks and collections: exact-printing links from Edit as text and imports, Link owned copies, Owned and Other version owned marks with Switch, deck cards that follow their copies' printing and finish, a choice to keep a deck's version when a copy changes, How many to change, Upgrade wanted, finish badges everywhere, Remove how many and Reduce to 1, Add buttons with finishes that name the destination, and Target and Adding here marks. Version 0.12.0 added the admin role and Administration (first-run Setup, Accounts, Sign-up with invite codes, Card database, Pictures, Storage and backups, Devices, Security, Server, Activity), card pictures kept on the server, the full Scryfall data offline (Art and Oracle tags, raw records, unofficial languages), price history, grouped card search, one Add to name button with the printing chooser, picture stacks with finish lines, special foils and many new filters. Version 0.13.0 made one click on a collection or deck pick where cards go (a double click opens it), added Sort to every card search with Best match first, removed the trade buttons and T and G keys outside Trade, replaced prices and text lines on card pictures with pips, added zone buttons that show one zone and set the add zone, added Add deck to collection, and removed Ctrl+N. Version 0.13.1 made card search faster. Version 0.14.0 replaced the ribbon with a menu bar (File, Edit, View, Help) and mode tabs, fixed account delete and blank proxy pictures, added the card maker's symbol picker, frame styles and phone preview, print list sort and views, and prices on pictures. Version 0.15.0 added the pip bar under card pictures, one tap to open in the app, custom set editing with SVG and Scryfall set symbols, one Symbols window, the art library, more Scryfall data (set symbols, symbols, printing changes, name and keyword lists, card back), suggestions, card backs for proxies and card languages. Version 0.16.0 added purchase history (the Purchases tab). Version 0.17.0 reworked purchases (single cards by search, scan or scanned list, a set list, receipts, shared places, who paid shipping, trade figures, opening buttons), added grouped list views everywhere, made prices USD only, added Send to print list... on decks, In Deck marks with Move to this deck, the wishlist question, undo that restores deck links, the card maker's new styles, frames, crown, P/T box, split and saga layouts, frame picker and fonts, one shared art library, phone layout fixes, and Android sharing, background sync, full offline search, https only and server update checks. Version 0.18.0 added the card layout (View, Card layout...: pips and buttons placed around card pictures, per account, one layout or one per section), one OWNED pip in search, live updates (server-sent events), scanning on the phone into an opening started on the web, pulls that stay on their pack (Gone, Remove from pack..., Value when pulled, Pulled value, Value now), purchase tables as grids, the finish choice for cards with one printing, the new click rules for collections and decks, a kept search when coming back, workspaces in the account menu and the Administration overlap fix. Version 0.19.0 added the printing chooser's Grid, List and Binder, Finish lines as a card layout item, Undo and Redo buttons in the top bar, picking several rows in purchase history, Add existing copies... by collection, the Match cards step and reading fixes for receipts, and packs opened one at a time. Version 0.19.1 joins receipt names that wrap over rows, always skips Subtotal, and keeps product names out of Bought from. Version 0.20.0 added named products (a Product name on every purchase line, MTGJSON's sealed products of each set, names read from receipts, and named Commander decks opened with their decklist) and the Custom sets tab with a symbol for each rarity. Version 0.21.0 added MTGJSON's data (records, store prices with history, booster contents, sealed contents and barcodes, SKUs, catalogs), a main price source per account, buylist prices, the card page's Prices, Printed text and Found in, precons as decks and collections, Scan barcode, expected value, virtual packs and the pull check, new search syntax, import matching by store ids, tabs that keep their place, New collection... everywhere, Change collection... on a pack, rarity colors for PNG and WebP symbols with a white common, and the card maker without its Custom sets... button. Version 0.22.0 added notes and the Wiki: a Notes tab on every deck (replacing Description; the deck's top page is its description) and collection with trees of child pages, a rich text editor (Tiptap) saved as markdown with page links, card links, checklists, tables and pictures, the Wiki tab (search, Pinned, Recent, Decks, Collections, My pages, drag and drop), templates, page history and clash handling, notes that follow sharing, markdown import and zip export, and offline notes in the Android app. Version 0.23.0 added web pages into notes: pasting from a browser with pictures copied to the server, Import pages... with .html files and saved web pages, and New page from web address... keeping the main article. Version 0.23.1 put type groups in Moxfield's order and fixed the deck's zone buttons stretching on phones.

## Rules

- Do not build or change the program until Devon says "build it". Settle the specification first with questions. Since 0.11.0, "build it" means build, push and merge (Devon, 2026-11-20).
- Before building, review the enabled skills and state which apply (program-design-guide, program-about-guide, docker-server-setup at minimum; dataviz for charts). Load each one that applies.
- Do not commit or push until asked. Do not remind Devon about uncommitted work.
- A change to how cards look or what they can do goes to every place the same thing appears (collection List, Binder and Grid, All collections, card search, deck List, Text, Stacks and Grid, the Deck list panel, the Card panel and card page, trade lines, the scanned list, proxies), not only the view Devon mentions. Use one shared component or helper so the places cannot drift apart.
- Never use em dashes anywhere (code, comments, docs, interface text). A static test enforces this.
- Answer questions simply and directly, without extra unrequested actions.
- Keep a task list while building, update the README feature list and keep the keyboard shortcut list current (README, About guide page 21 Settings and shortcuts, `SHORTCUTS` in `actions.tsx`, key handling in `main.tsx`).
- Every update ships the server and the Android app together. Attach a debug APK to each build until the app is closer to finished. The `Android app` workflow builds it for every pull request and push to main (artifact `mana-vault-X.Y.Z-debug`; pushes to main also replace the `debug` pre-release on the releases page with it), signed with the shared debug key `apps/android/android/app/debug-shared.p12` so debug builds install over each other. The workspace cannot reach Maven Central, so take the APK from the CI run.
- Update this handoff (here and in the claude.ai manavault project, identical) with every build.
- Raise the version in every place with each delivered build: `package.json`, `apps/server/package.json`, `apps/web/package.json`, `apps/android/package.json` and `package-lock.json` (run `npm install --package-lock-only`). Patch for fixes, minor for features, major only when Devon says so. A static test checks they match.
- Every pull request that changes what the app does, or the rules it follows, also updates the About guide: the affected pages, Capabilities, and a new entry in the release notes. It also raises the version. The version is shown in the guide.
- Every change gets tests; `npm run test:all` must pass before delivery. Where Playwright cannot download its browser, run it with an installed Chrome: `PW_CHANNEL=chrome npm run test:all`.
- The app is in early development: change things when they need to change. Do not hold back or work around a change to keep older versions, older files or older data working (Devon, 2026-11-22). Mark stored formats with the app version rather than a separate number.
- Deployment follows the docker-server-setup skill: Dockhand only, no Watchtower, absolute data path, UID 65532, no cloudflared or reverse proxy in the stack.

## Historical follow-ups from 0.24.0

- Follow-ups from earlier releases: web pages into notes with real sites (paste from Chrome and the phone, saved pages from Chrome and Firefox, the article reader on deck and primer sites, sites that refuse or block the server); notes and the Wiki in daily use (the editor on a phone, drag and drop, the clash question, an Obsidian vault import, offline notes in the app); and from 0.21.0: whether MTGJSON's data works on the real server (a card database update or Update MTGJSON data now, the 90-day history download and its size, the daily prices), the main price source, precons, Scan barcode with real boxes (UPC data in MTGJSON is not certain for every product), expected values and the pull check with real packs, Change collection..., New collection..., tabs keeping their place, and PNG rarity symbols; and the earlier follow-ups (named products with a real Commander deck, the Custom sets tab, 0.19.0 features with real receipts).
- Left from earlier specs: a chart of one entry's value over time on the purchase entry page (SPEC-0.15.0).
- Not built from SPEC-0.21.0: expected value on a "set page" (there is no set page; each booster's value shows in Open virtual packs... and on purchase lines); booster contents for offline expected value and pull checks in the app (both need the server); a Buylist column in a column picker (there is no column picker; Buylist prices in lists in the View menu shows it instead); Deckbox id matching (Deckbox files carry no store id).

## Decisions (0.23.1 type group order, phone zone buttons)

- Devon's deck showed no type groups because the account's Group was No grouping (not a bug). Devon asked for Moxfield's group order: `TYPE_GROUP_ORDER` in list-groups.ts (Planeswalker, Creature, Sorcery, Instant, Artifact, Enchantment, Battle, Land, Other) orders the groups; `TYPE_ORDER` still decides which type a card with several types goes under (Creature wins).
- Phone: `.phone .seg{flex:1 1 100%}` made the deck's zone buttons (in a column) as tall as the view; `.phone .seg.deckzones{flex:none;align-self:stretch}`.

## Decisions (0.23.0 web pages into notes)

- Specification: `docs/SPEC-0.23.0.md` in the claude.ai project. Devon answered by click-through prompts (all three ways, keep copies of pictures, main article only, simplify) and said "build it".
- Server (notes-web.ts): POST /api/notes/fetch {url} returns {url (after redirects), html} (10 MB, decoded by the header's or the page's charset); POST /api/notes/files/copy {url, pageId?, id?} keeps a picture (20 MB, kind sniffed from the bytes, name from the path). `guardedFetcher` uses node http/https with a `lookup` that refuses private, loopback, link-local, CGNAT, unique-local and multicast addresses (so a public name pointing inward is refused at connect time), checks `refusedUrl` again at each of up to 5 redirects, 20 s timeout. `notesFetcher` in buildApp options replaces it in tests (server tests and the browser tests' serve.mjs serve a stand-in example.test).
- Pictures kept before their page is saved (`page_id` NULL) join the page whose body shows them on POST and PUT (`claimPictures`), and imports claim them as before.
- Browser (notes-html.ts): `simplifyDocument` (drops scripts, forms, styling attributes and svg; iframes, video, audio, embed and object become "Watch the video", "Open the map", "Listen to the audio" or "Open the embedded content" links; same-page and relative-without-base links are unwrapped; lazy and srcset pictures resolved), `simplifyPasted` (editor `transformPastedHTML`), `pageFromHtml` (Readability on a copy, falls back to the body when the article text is under 40 characters, title shortened to the first h1 when the title starts with it, repeated first heading dropped, `generateJSON` with the editor's extensions then `writeNote`), `savedFrom` (Chrome's saved-from comment, canonical link, og:url), `sourceLine`, `webPictures`. Saved-page pictures keep relative paths through Readability by a temporary `mv-local:` scheme; the server import finds them by path or file name.
- Import pages... (`importPages` in NotesPane.tsx) reads .html/.htm too (notes-io.ts gives them an `html` field and skips HTML inside `*_files` folders), converts them in the browser, copies web pictures with pageId null, then posts the usual import. New page from web address... (`newPageFromWeb`) fetches, converts, copies pictures, then makes the page.
- Pasted web pictures: NoteEditor collects `https?` img sources in `transformPastedHTML`, copies them after the paste and swaps the image nodes (`swapPicture`). localStorage `mana-vault-note-pictures` keeps per page a map of web address to copy address ("" until copied): offline failures stay there and are retried on open, on `online` and on the app's `SYNCED_EVENT`; a copy finished after the page closed is swapped in on the next open; entries go when the page no longer shows the address.

## Decisions (0.22.0 notes and the Wiki)

- Specification: `docs/SPEC-0.22.0.md` in the claude.ai project. Devon answered by click-through prompts and said "build it". Devon chose a rich text editor with a toolbar (not live preview or split), merging Description into Notes, every extra (page links, card links, checklists and tables, pictures), notes that follow sharing, three Wiki sections, drag and drop, search, Recent and pinned, templates (built in plus own), versions with a clash question, markdown zip export and import, the deck primer in deck exports, and offline read and edit in the app.
- Server (notes.ts): `note_pages` (id, owner_id, kind deck/collection/NULL, item_id, parent_id, title, body markdown, position, version, updated_by, deleted_at), `note_versions` (page_id, title, body, at, by, client), `note_pins`, `note_recent`, `note_templates`, `note_files` (BLOB). Triggers delete pages with their deck or collection and versions, pins, recent and files with their page. Deletes are soft (`deleted_at`, purged after a day at startup) so undo works through POST /api/notes/restore.
- Access: `READABLE` SQL: unattached pages by owner, attached pages through deck or collection ownership or `members` (every member can edit; there are no read-only members in Mana Vault). Moving a page to My pages makes its owner the mover.
- Top page: one per deck or collection (`parent_id` NULL with an item), made by POST /api/notes/items/:kind/:id (and when a page is created or moved with kind and itemId but no parent). Its title shown is always the item's name; it cannot be moved or deleted. Deck description sync: saving a deck's top page writes `decks.description`; PATCH /api/decks/:id with description calls `setDeckTopBody`. `descriptionPages` (startup and after restore) makes top pages from non-empty descriptions.
- Saves: PUT /api/notes/pages/:id with `baseVersion`; a stale base with a different text returns 409 with `conflict` (title, body, version, updatedBy, updatedAt) unless `force`. Versions: saves from the same `x-mana-vault-client` (or the phone's device id) by the same account within 10 minutes join one version; `pruneVersions` keeps 50 plus the last of each day for 90 days. A new version (not a joined save) of a deck page logs "Description changed" or "Notes page title changed" in the deck history. Renaming rewrites `[[Old]]` to `[[New]]` in readable pages (`renameLinks`).
- Pictures: POST /api/notes/files (base64, 20 MB, PNG/JPEG/GIF/WebP/AVIF/SVG; client shrinks to 2,000 px), GET /api/notes/files/:id is public (`NOTES_PUBLIC`, UUID codes) so the app and exports can load them; SVG is sent with a no-script CSP.
- Search GET /api/notes/search (words in title or `plainText(body)`, snippets); card links resolve with GET /api/notes/card?name= (newest printing). Export GET /api/notes/export?page= | kind=&item= | all; import POST /api/notes/import {pages: [{key, parentKey, title, body}], files} rewrites `![](path)` and `![[name]]` to file addresses. The browser builds and reads the zips (`notes-io.ts`, `exportNotes` in NotesPane.tsx).
- Client: `notes-md.ts` (Tiptap extensions: StarterKit, TaskList/TaskItem, TableKit, NotePicture with a file resolver, PageLink and CardLink inline atom nodes with markdown tokenizers; `parseNote`/`writeNote` through @tiptap/markdown's MarkdownManager; `tidy`), `notes-state.ts` (tree store with useSyncExternalStore, calls), `components/NoteEditor.tsx` (editor, toolbar, LinkFinder, `[[` handling, paste and drop, table right-click menu, card hover), `components/NotesPane.tsx` (tree with drag and drop, sections, search, PageView with 1 second autosave and clash handling, dialogs), `views/WikiView.tsx`. Kept state keys: `wiki:open`, `deck:notes:deck:<id>`, `collection:notes:collection:<id>`, `wiki:folded`, `wiki:section:<name>`, `wiki:search:<scope>`; `setKept` opens a Wiki page from outside.
- Live updates: area `notes` (paths /api/notes and PATCH /api/decks/:id) dispatches `NOTES_CHANGED`; open pages reload when nothing is waiting to save.
- Android: `android/notes-offline.ts` applies notes changes to the copy (`/api/notes` and `/api/notes/pages/:id`), answers search and card links from the copy and catalog, refreshes pages whose version changed during sync; queued PUTs of one page are joined (first base version kept); a 409 from /api/sync dispatches `NOTE_CLASH` (note-files.ts) and the open page asks. Offline pictures are kept as data addresses (`keepLocalFile`) until sent.
- Deck exports: Plain text list ends with `// Notes` and the description as `//` lines (deck imports skip `//` lines; placed last so a line such as "// Sideboard" cannot change the zone of cards).

## Decisions (0.21.0 MTGJSON data, prices, precons, boosters, tabs, collections)

- Specification: `docs/SPEC-0.21.0.md` in the claude.ai project. Devon answered by click-through prompts and said "build it".
- MTGJSON (mtgjson.ts): AllPrintings, AllPrices, AllPricesToday and TcgplayerSkus are downloaded as .gz to `<data>/mtgjson` and read one `data` entry at a time with stream-json (`dataEntries`), then deleted. `mtgjson_records` (uuid, card_id or NULL, set_code, gzip record), `mtgjson_ids` (store, ext_id, card_id, finish: tcgplayer, cardkingdom, cardsphere, cardmarket, mtgo, multiverse, mtgjson), `mtgjson_sources` (card_id, finish, product_id from sourceProducts), `boosters` (set_code, name, raw config with uuids, resolved through mtgjson_records when read), `mtgjson_skus`, `mtgjson_meta` (keywords, card_types, history_choice), `mtgjson_parts` (part, count, bytes, at, result). Sealed products get `contents`, `identifiers`, `upc` (any identifier key matching upc/gtin/ean/barcode), `release_date`. AllPrintings commits every 20 sets so the app can keep writing; ids, sources and boosters are replaced set by set.
- Card columns added: `mtgjson_uuid`, `original_text`, `original_type`, `is_reprint`, `is_starter`, `lead_commander`, `lead_oathbreaker`, `lead_brawl` (NULL when MTGJSON has no record), and six price columns per store `<prefix>_r, _rf, _re, _b, _bf, _be` (prefixes tcg, ck, cs, cm, ch). `store_price_history` (card_id, store code 1-5, day, the six prices) keeps a day only when it differs from the day before and never rewrites a day (INSERT OR IGNORE). A store's current prices are its newest saved day.
- Weekly parts run with each card database update when older than six days (`importMtgjsonWeekly`, also `force` from Administration); today's prices when not saved today; the 90-day AllPrices only from Administration (`history_choice`: ask, downloaded, skipped). `startMtgjsonRunner` (mtgjson-routes.ts) runs Administration's updates in the background on a second connection to the database file (the same connection for a database in memory) and checks hourly for today's prices (`mtgjsonSchedule`, off in tests). `busy_timeout` 10 s on every connection.
- Main price source: `prefs.mainPriceSource` (tcgplayer default, cardkingdom, cardsphere, scryfall; Cardmarket and Cardhoarder are not offered since they are not in US dollars). `price-context.ts` keeps the request's source in AsyncLocalStorage (`enterSource` in the onRequest hook after the user is known); `usdSql`, `usdFoilSql`, `usdEtchedSql` and `priceCols` build COALESCE chains (`sourceChain`: main, then tcgplayer, scryfall, cardkingdom, cardsphere), so every SQL that read `price_usd*` reads the main source. `ENTRY_COLUMNS` became `entryColumns()` and `PRICE_COLUMNS` `priceColumnList()`. `priceColumns` also returns `buy_usd`, `buy_usd_foil`, `buy_usd_etched` (highest USD buylist). The offline card list's etag includes the source.
- Purchases: `purchase_openings.ev` stored the first time an opening's expected value is worked out (the entry is shown right after Open...). `lineValue`/`packValue` (boosters.ts) use the line's sealed product's `contents.pack[0]` when linked, otherwise the first of the product's usual booster names the set has. Pull check: `pullsAllowed` (regular sheets give finish 0, foil sheets 1 and 2) plus the linked product's `contents.card`. Change collection: POST /api/purchases/openings/:id/collection {collectionId, move, rest} returns `undo` for POST /api/purchases/openings/collection/restore; moving uses `moveLinks` before taking copies, so deck links follow.
- Precons: `deckList` (sealed.ts) keeps zones (commander, main, sideboard) in the cached list; lists cached by 0.20.0 have no zones and count as main board. POST /api/precons/deck and /api/precons/collection; GET /api/precons. Barcode: GET /api/sealed/barcode/:code (UPC-A also matched as EAN-13).
- Search: `can:`, `store:` (foil with `is:foil`), `buylist`, `in:` (mtgjson_sources joined to sealed_products by product or name), `is:reprint`, `is:starter`, on the server (card-search.ts) and offline (query-match.ts, except `in:`).
- Imports: SKU, TCGplayer Product ID, Card Kingdom ID and CardSphere ID columns are matched through `mtgjson_skus` and `mtgjson_ids` before Scryfall id and names; a SKU also gives condition and language unless the row has its own.
- Tabs keep their place: `kept.ts` (`useKept`, `useKeptScroll`, `resetTab`) holds state in memory by keys starting with the view name; `store.cardPage` is per view (`cardPages`); `store.pressTab(view)` resets the tab shown (card page and kept keys) or switches. ModeTabs and the phone bottom bar use it. Purchases keeps tab, period, open entry, History filters and scroll; collection and deck lists keep their scroll.
- New collection: `NEW_COLLECTION` choice in form dialogs (Dialog.tsx shows a name field, `chosenCollection` makes it) and `CollectionPicker` for custom windows (lists a collection made in it at once, since a window's store can be stale).
- Custom sets: `custom_sets.common_white`; `symbolFor` tints SVG, PNG and WebP main symbols; `hasTransparency` (card-render.ts) leaves an opaque picture its colors; `redrawSetCards` (CardMaker.tsx) saves the account's cards of a set again after its colors change.
- Card page: GET /api/cards/:id/market (store prices, printed text, leadership, Found in), /store-history, /mtgjson-record. Price history chart: one line per store (US dollar stores together, Cardmarket and Cardhoarder alone), fixed colors per store from the dataviz palette (`.pricehist --series-1..6`, light and dark), legend, end labels, crosshair with every store, table.

## Decisions (0.20.0 named products, decklists, Custom sets tab)

- Specification: `docs/SPEC-0.20.0.md` in the claude.ai project. Devon answered by click-through prompts and said "build it". Scryfall has no sealed product data; MTGJSON does.
- Sealed data (sealed.ts): `sealed_products` (MTGJSON uuid, set code, name, `short_name` from `productNameOf`, category, subtype, mapped `product`, deck name and code) from `SetList.json` (`sealedProduct` and `decks[].sealedProductUuids`), and `sealed_decks` (code, name, file name, cached `cards` JSON) from `DeckList.json`, both saved by `importSealedData` at the end of `importCatalogExtras`. A deck file (`decks/<fileName>.json`) is downloaded on the first open of the deck through the app's `fetcher` and kept; a refreshed deck list keeps cached cards while the file name is the same.
- Product name: `purchase_lines.name` is the product name for every product (Other still requires it); `purchase_lines.sealed_id` is set by `setSealed` on every insert and update with `matchSealed` (exact short or full name, case and punctuation ignored, in the line's set, its parent and children, filtered by product). GET /api/purchases/products?set=&product= lists the choices (GET /api/purchases/sealed was already the sealed value list). Lines carry `sealedId` and `hasDeck`.
- Receipts: `productNameOf` (receipts.ts) strips the brand, the set name (and its base without " Commander") and product words, keeping the parts between colons, dashes, commas and brackets with 3 or more letters. `matchReceiptCards` matches non-Other lines to sealed products by the short name found in the line text and sets `productName` and `sealedId`.
- Opening a named deck: the open route downloads the decklist before the transaction; with a deck it adds every card (`putCopies`) times the count opened, ties each to the opening and ends it (`active` 0, `done_at` set); it does not end the user's other active opening. `decklist: false` opens the old way; a download failure returns `deckError` and opens the old way. Scryfall id first, then set and number; foil from `isFoil`, otherwise the card's first finish. DELETE /openings/:id?copies=1 (undo) takes the tied copies still held back out.
- Custom sets: `custom_set_symbols` (code, rarity, symbol, type). PATCH takes `rarities: { rare: { symbol | symbolFrom } }`, "" removes; a new code moves them; delete removes them; backups carry `rarity_symbols`. GET /symbol?rarity= serves the rarity's own or the main symbol. `symbolFor` (CustomSets.tsx) picks the card maker's symbol and tint (tint only for the main SVG symbol).
- Custom sets tab: `SetMaker` in CustomSets.tsx (prefs `proxyTab` "sets", action `proxies.sets`, icon `sets`), reusing the card maker's `makerbody` layout. `openSetsTab(store, code | "new")` and `askMaker({ newIn | open })`/`takeMakerAsk` pass requests between the tabs. The Custom sets and Edit set windows (`SetManager`, `EditSet`) are gone.

## Decisions (0.19.0 chooser views, packs, Match cards, picking)

- Specification: `docs/SPEC-0.19.0.md` in the claude.ai project. Devon answered by click-through prompts and said "build it".
- Printing chooser: `PrintingList` in PrintingDialog.tsx renders List rows or Grid and Binder cards (`.printcard`, still `.printrow` for keyboard focus and tests); prefs `chooserLayout` (default grid) and `chooserSize`. The window is 980 wide. The oversized set symbol came from `.printrow img` hitting the SetIcon; now `.printrow > img`.
- Finish lines: card layout item `lines` (version 2 of `cardLayout`; older layouts get it on the second line). `chooseKind` in CardFrame.tsx asks which kind when lines are hidden (collection Stack, deck Picture).
- Undo and Redo: `UndoButtons` in MenuBar.tsx (title bar and phone bar), running the `undo` and `redo` actions.
- Picking: `usePicks` and `PickBar` in components/Picks.tsx. Delete picked... deletes entries one by one and keeps their snapshots for undo. Remove from pack takes a list of ties; copies of one kind in one collection are lowered together.
- Add existing copies...: GET /api/purchases/collection-copies (free = quantity minus copies held by ties, `tiedTo` names). POST /openings/:id/ties returns the new tie `ids` for undo. Prefs `tieLayout` (default list) and `tieSize`. The find box matches names only (not the search syntax).
- Receipts (0.19.1): rows without a price continue the line above when its name is `unfinished` (open bracket, or ending in ":", ",", "&", "-", "of", "the") or the row ends in ":"; `cleanRow` drops a capitals word that repeats the next (picture text); SKIP ends with `(?![a-z])` so "Subtotal3" is skipped; the place comes only from rows above the first price that are not product names.
- Receipts: `findOrderDate`, `IGNORED`, `CONDITION_NOTE`, `conditionOf`, `finishOf`, the order number into `note`, `setOf` without punctuation and with Commander companions (receipts.ts). `matchReceiptCards` (purchases.ts) marks `cardLike` lines and guesses the printing (set from brackets, version words, finish). The client's `MatchCards` step sits inside the purchase window; Cancel keeps the lines as products.
- Packs: `purchase_openings.pack_number`, `group_id`, `waiting`; `purchase_lines.packs_opened`. For lines with packs, an opening's `count` is in packs (older openings were multiplied by the line's packs once); `opened` is the units started (ceil). `syncOpened`, `packsLeft`, `activeOpeningOf` (groupIndex, groupSize, hasNext) in purchases.ts; POST /openings/:id/next, POST /ties/move; DELETE /openings/:id removes the whole group. Sealed value counts the packs left in a started unit at value / packs. Per pack: `packCost`, `soldFor` (sold and traded pulls at the average price their copies brought in), `gain`.

## Decisions (0.18.0 card layout, live updates, openings across devices, pulls on packs)

- Specification: `docs/SPEC-0.18.0.md` in the claude.ai project. Devon answered by click-through prompts and said "build it".
- Card layout: `card-layout.ts` (model: items count, printings, finish, marks, price, buttons; places tl, tr, bl, br, left, right, full, bottom; `moveItem`, `setSame`, `readCardLayout`) and `components/CardFrame.tsx` (`CardFrame` used by search results, collection Stack, deck Picture and the print list picture; the Card layout window). Pref `cardLayout` (`same`, `all`, `sections`). Sections: search, collection, deck, trade, proxies. Deck Stacks puts the rows above the picture (`above`).
- The FOIL count pip was the owned foil count, not printings; search now shows one OWNED pip with the total (tooltip by finish).
- Click rules: `pickOrOpen(key, pick, open, opensOnClick)` in PickOpen.tsx. Panels open on one click in the collection and deck views; elsewhere one click picks and `event.detail >= 2` (or a double tap within 350 ms) opens. Switchers always open on one click. The Android app follows the same rules.
- Search kept: `useCardSearch` skips a fetch when the search key (filters, group, currency, sort, round) equals the last completed one; `reload()` refetches the loaded pages in place (owned counts) and runs when CardsView mounts; result lists keep their scroll position by list name.
- Live updates: `events.ts` (server) and `live.ts` (browser and app). GET /api/events is server-sent events; the onResponse hook publishes every successful change to the account and everyone sharing a collection, deck, open trade or offer with it, skipping the page named by `x-mana-vault-client` (`CLIENT_ID` in api.ts). The app signs in to the stream with `?device=<token>`. Only shared settings (`SHARED_PREFS` in live.ts) are adopted from other devices, and only when no local save is pending (`prefsPending`), so prefs cannot ping-pong.
- Openings across devices: changes to `/api/purchases/.../open` and `/api/purchases/openings/...` send the active opening in the event; `/api/sync/state` has `opening`; InboxWorker shows Opening started with Start scanning once per opening (`lastOpening` in Settings, also set by the app when it already knows the opening); the notification uses the offer extra `scan:<id>`. The scanner's Add to... fills in the opening's collection.
- Pulls stay on packs: `x-mana-vault-undo: undo|redo` marks undo and redo requests (`asUndo` in api.ts, `undoStepOf` in copy-events.ts). Lowering copies unties only on "undo"; raising copies ties unless "undo". `purchase_ties.value_then` (filled from price history once for older ties) is Value when pulled. DELETE /api/purchases/ties/:id returns `held` and `have`; POST /api/purchases/ties/restore puts a tie back as it was; POST /api/purchases/ties/packs names the packs for the remove note. Entry ties carry `valueThen`, `sold`, `traded`, `gone`; openings carry `valueWhenPulled`, `valuePulled` (Pulled value), `valueNow`, `gone`.
- One printing: `addCard` and `PrintingList single` skip the chooser; `FinishChoice`/`chooseFinish` ask only the finish, focused on the Add as foil choice.
- Workspaces live in `ACCOUNT_MENU` (expanded with `useWorkspaceActions`); `cardLayout` is in the View menu.

## Decisions (0.17.0 purchases, list views, USD only, card maker, Android)

- Specification: `docs/SPEC-0.17.0.md` in the claude.ai project. Devon answered every question by click-through prompts and said "build it".
- Single cards in a purchase are never typed: Find cards (search grid, then the printing list inline), Scan (scanner target "This purchase", `scanningForPurchase` in PurchaseDialogs.tsx) or From scanned list.... A purchase starts with no lines.
- Places are server-wide (`places` table, `purchase_entries.place_id`). Any account adds and edits; admins merge (undo with `/api/places/restore`) and delete. The first start of 0.17.0 turns existing place text into places. Backups restore places by name.
- Shipping on sales is per entry (`shipping_by`: `buyer` default, `me`). Fees always lower the money in.
- Receipts: the server reads PDFs (pdfjs-dist legacy build) and pictures (tesseract.js with the /ocr model files); the Android app reads camera photos with ML Kit first. Receipts are kept in `purchase_receipts` (BLOB, 20 MB limit) and in account backups.
- Ties move with copies (`copiesMoved` copy event from move and printing routes).
- List views share `list-groups.ts` and `GroupedList.tsx`; groups and folded headings are per account (`listGroups`, `listFolds`). Devon chose to keep the FOIL pip, not a rainbow mark.
- USD only: EUR columns are nulled once (flag `eur_dropped`), the `eur:` filter and every currency switch are gone.
- Undo of removing deck cards: removed links are kept in `removed_links` for 60 minutes (`RELINK_MINUTES`) and relinked by undo.
- Wishlists: `lowerWishlists` returns `wishAsk` when a card is on more than one wishlist; `askWishlists` (WishlistAsk.tsx) asks once per batch and posts `/api/wishlists/lower`.
- Change printing with more than one card: one dialog with two steps (`TwoSteps` in PrintingDialog.tsx), how many first starting at 1.
- Card maker frames are drawn by Mana Vault (Devon asked to extract Cardforge's frames; declined because they are not ours to copy, and Devon accepted). Fonts are Crimson Pro and Merriweather Sans (OFL, @fontsource).
- Art library is one for the server (flag `art_library_shared` joins libraries once, deduped); the uploader or an admin renames and deletes.
- Android: SEND intent for text, CSV, PDF and pictures; SyncWorker (WorkManager, CONNECTED) sends waiting changes; the server's sync ids make resends harmless. https only, except localhost and 127.0.0.1 so the tests keep working. Android 8.0 stays the minimum. Update checks call `/api/app/latest`; `/api/app/apk` fetches the release APK once into `<data>/apk`.
- Backups (0.17.1): the `version` field holds the Mana Vault version that made the backup (`APP_VERSION` in backup.ts, read from the server's package.json), not a separate number. A backup from a newer version is refused (`compareVersions`); numbered backups 1 to 7 still restore. Entry snapshots carry the place, who paid shipping and the receipt, and a restore joins places by name. Pictures in the shared art library are backed up by the account that added them.
- Offline search uses `compileQuery` (query-match.ts), mirroring the server parser; `art:` and `otag:` still need the server.

## Code map

| Path | Contents |
|---|---|
| `apps/server/src/app.ts` | Fastify app: request guard and security headers, account routes (new accounts get a Main collection), prefs, card search and card detail (prices, flavor name, owned per collection with etched and trade, wanted in wishlists), collection imports, decks (scoped by owner and members, rename, delete), backups, catalog status, SPA fallback for `/about/...` |
| `apps/server/src/library.ts` | Access checks, collections CRUD (kind), `collectionValue`, `ENTRY_COLUMNS`, copy keys in POST/PUT (`trade`)/move, bulk add `POST /cards/add` (returns before and after for undo), set completion and missing, members, shares |
| `apps/server/src/insights.ts` | `summarize` (stat tiles and buckets), `deckOwnership`, routes `/api/collections/:id/stats`, `/api/decks/:id/stats`, `/api/decks/:id/ownership`, `/api/trade` |
| `apps/server/src/copies.ts` | Copy key parsing (`readCopyKey`, `readCondition`, `readLanguage`, `readFinish`), conditions and languages, `priceSql` per currency |
| `apps/server/src/scan.ts` | Scan matching: `NameMatcher` (in-memory trigram index of names, front faces and flavor names, rebuilt when the catalog changes), `readInfoLine`, `matchScan`; routes `POST /api/scan/match` and `GET /api/cards/:cardId/printings` |
| `apps/server/src/sets.ts` | Scryfall set list storage (`saveSets`, with symbol address and details), set search (`listSets`), `setDetails`, `setsWithSymbols` |
| `apps/server/src/scryfall-extras.ts` | Set symbols, symbology, migrations (`applyMigrations`, `mergePrinting`, `mergeHooks`), catalogs and `suggest`, card back, `importScryfallExtras` |
| `apps/server/src/receipts.ts` | Receipt reading: `pdfText`, `pictureText`, `parseReceipt` (date, place, products, set codes, product names, tax, shipping), `productNameOf` |
| `apps/server/src/sealed.ts` | MTGJSON named sealed products and decklists: tables, `importSealedData`, `sealedChoices`, `matchSealed`, `deckList`, `listedCopies`, `sealedDeckCards` |
| `apps/server/src/mtgjson.ts` | MTGJSON data (0.21.0): tables and card columns, stores and price SQL (`sourcePrice`, `priceColumns`, `buylistSql`, `sourceChain`, `priceSourceOf`), downloads and `dataEntries`, `importAllPrintings`, `importPrices`, `importSkus`, `importCatalogs`, `importMtgjson`, parts status |
| `apps/server/src/mtgjson-routes.ts`, `boosters.ts`, `price-context.ts` | Administration's MTGJSON routes and `startMtgjsonRunner`, card market data, precons, barcodes, booster values and virtual packs; expected value, `openPacks`, `pullsAllowed`; the request's main price source |
| `apps/server/src/app-updates.ts` | `/api/app/latest` and `/api/app/apk` (public), the APK fetched once from the GitHub release |
| `apps/server/src/extras.ts` | Routes for set symbols, symbology, suggestions and lists, card backs, the art library and Administration's card database parts and language estimate; `importCustomArt`, `addToArtLibrary` |
| `apps/server/src/svg.ts` | `cleanSvg` and `SVG_HEADERS` |
| `apps/server/src/purchases.ts`, `copy-events.ts` | Purchase history tables, figures, chart, routes, backups; events for copies added or lowered and trades done or undone |
| `apps/web/src/views/PurchasesView.tsx`, `components/PurchaseDialogs.tsx`, `purchase-state.ts` | The Purchases view, its windows and the active opening |
| `apps/web/src/components/CustomSets.tsx`, `SymbolPicker.tsx`, `ArtLibrary.tsx`, `Suggest.tsx` | Custom sets tab (`SetMaker`), set menu, `symbolFor`, `openSetsTab`, `askMaker`; Symbols window, `SymbolGlyph`, `SymbolText`; art library window; text fields with suggestions |
| `apps/server/src/auth.ts` | Users (admin, disabled, must change), sessions (token hashes), prefs table, PBKDF2, rate limiter, cookie helpers |
| `apps/server/src/settings.ts` | Server settings with defaults, input checks, environment locks (`settingsFromEnvironment`) |
| `apps/server/src/admin.ts` | Administration routes (`/api/admin/...`): overview, settings, accounts, invites, devices, activity, server check and log, folder browser, server backups and restore; `logActivity`, `startBackupSchedule`, `applyPendingRestore` |
| `apps/server/src/pictures.ts` | Card pictures on the server: `/pictures/*`, the onSend address rewrite, background downloads, estimates, move; `localPicture` |
| `apps/server/src/logs.ts` | `captureLogs` keeps the newest 500 log lines for Administration |
| `apps/web/src/views/AdminView.tsx` | Administration and Setup pages, `chooseServerFolder`, `forcePasswordChange` |
| `apps/web/src/views/PriceHistory.tsx` | Price history chart and table on the card page |
| `apps/server/src/index.ts` | Startup, environment variables, `-healthcheck` flag |
| `apps/server/src/database.ts` | Schema and migrations: cards (finishes, promo, variation; prices and flavor_name in 0.3.0), sets, collections (kind), collection_cards (0.3.0 key with condition, language, trade; `upgradeCopies` rebuilds the 0.2.0 table), members, shares, decks.owner_id; `cardPricesStatement` |
| `apps/server/src/custom.ts` | Custom sets and custom cards: routes, card data reading (`readCardInput`, `manaValueOf`, `colorsIn`), `customCardUse`, pictures and art, `CUSTOM_PUBLIC` |
| `apps/server/src/proxies.ts` | Print list, full-size card pictures through the server (`scryfallSize`), mana symbols, tokens of a list |
| `apps/web/src/card-render.ts` | Card maker drawing: `FaceDesign`, frames and palettes, `frameOf`, text layout with symbols, `renderCard`, `loadPicture` |
| `apps/web/src/components/CardMaker.tsx` | The card maker: list, fields, art, card data, the rarity's set symbol, save, duplicate, delete, PNG export |
| `apps/web/src/proxy-print.ts`, `proxy-state.tsx` | Page layout (`layoutPages`, `facesOf`, `readSheet`), PDF, MakePlayingCards zip, MPC Autofill list; the print list state |
| `apps/web/src/views/ProxiesView.tsx` | Proxies view: Print tab (adding, lines, sheet settings, preview, exports) and the Card maker tab; `addFromDeckDialog` |
| `apps/web/src/components/PrintingDialog.tsx`, `ItemMenus.tsx` | The printing chooser (How many to change); collection and deck right-click menus and rename dialogs |
| `apps/web/src/components/CardMarks.tsx`, `AddButtons.tsx` | Shared card marks (finish and Upgrade wanted badges, CountPip and FinishPip for pictures, Owned and Other version owned, Remove how many); Add buttons and menu items with finishes that name the destination |
| `apps/web/src/components/PickOpen.tsx`, `zones.ts`, `search-sort.ts` | One click picks and a second opens (`pickOrOpen`); the zone button actions; search sorting kept in the browser (`sortFound`, `matchRank`, `plainWords`) |
| `apps/server/src/backup.ts` | Account backups marked with the app version since 0.17.1 (`APP_VERSION`, `compareVersions`); numbered layouts before that: 7 purchases, 6 art library, 5 custom sets and cards; version 4 (proxy, copy details, deck collection, deck links); before that version 3 (collections with kind, copies with finish, condition, language, trade, decks, deck cards, card records); versions 1 and 2 restore with defaults |
| `apps/server/src/collection-import.ts`, `deck-import.ts`, `card-search.ts`, `catalog-updater.ts`, `import-*.ts` | Import (condition, language, etched, tradelist counts, `nameMatch` for flavor and front face names), search (`usd`, `eur`, flavor names) and catalog logic; the bulk import stores prices and flavor names |
| `apps/server/src/decks.ts` | Deck routes: list, create (id from the caller), rename, format, description, cover card and deck collection, cards with links, tags, legality data and missing counts, link copies (`linkCopies`, switches printing), candidates; `ZONES`, `FORMATS`, `logDeck` |
| `apps/server/src/deck-builder.ts` | Deck builder routes: `GET /api/cards/resolve`, deck card tags, `replace` (edit as text, `replaceDeck`), history, tokens |
| `apps/server/src/links.ts` | Deck link helpers: `linkedCount`, `trimLinks`, `addLink`, `moveLinks`, `capDeckCardLinks`, `deckLinks`, `collectionLinks`, `touchDeckCollections` |
| `apps/web/src/formats.ts` | Export formats (`EXPORT_FORMATS`, `exportText`) |
| `apps/web/src/components/FileWindows.tsx`, `ContextMenu.tsx` | Import and Export windows; right-click and long-press row menus |
| `apps/web/src/views/HomeView.tsx`, `CardPage.tsx` | Phone Home screen; card page (versions, rulings, card actions button) |
| `apps/server/src/events.ts`, `apps/web/src/live.ts` | Live updates: `Events` (streams per account, `audience`, `publish`), `areasOf`, `/api/events`; the browser side (`useLiveUpdates`, `startOpeningScan`, `PURCHASES_CHANGED`) |
| `apps/web/src/card-layout.ts`, `components/CardFrame.tsx` | Card layout model and the frame every card picture uses, with the Card layout window and `chooseKind` |
| `apps/server/src/notes.ts` | Notes (0.22.0): tables and triggers, `READABLE`, top pages and description sync, versions, links, search, files, backups (`notesBackup`, `restoreNotes`), routes |
| `apps/server/src/notes-web.ts`, `apps/web/src/notes-html.ts` | Web pages and pictures fetched for notes (0.23.0): `guardedFetcher`, `refusedUrl`, `privateAddress`, routes; simplifying HTML, the article, source line |
| `apps/web/src/notes-md.ts`, `notes-state.ts`, `notes-io.ts`, `note-files.ts` | Notes editor parts and markdown, the tree store and calls, markdown import reading, offline pictures and `NOTE_CLASH` |
| `apps/web/src/components/NoteEditor.tsx`, `components/NotesPane.tsx`, `views/WikiView.tsx`, `android/notes-offline.ts` | The editor and toolbar; the tree, page view, dialogs, import and export; the Wiki tab; notes in the app offline |
| `apps/web/src/kept.ts`, `components/CollectionPicker.tsx`, `components/Precons.tsx` | Tab state kept for the session (0.21.0); New collection... in collection lists; Add precon as deck... and Add precon to collection... |
| `apps/web/src/components/Picks.tsx` | Picking several rows (check boxes, Ctrl and Shift click, Select all) and the pick bar |
| `apps/web/src/main.tsx` | Boot (`WebRoot`, or `AppRoot` with the app sign-in screen), keyboard shortcuts, desktop or phone shell, scanner, `useAppFeatures` (Back button, sync events, offers from notifications, update check) |
| `apps/web/src/android/` | `platform.ts` (native plugin interface, settings, server address rules, Back button), `net.ts` (requests with the device token), `offline.ts` (copy, queue, local changes, sync), `catalog.ts` (card list, offline search and scan matching), `idb.ts`, `AppScreens.tsx` (sign-in screen, sync chip, Devices, Changes not applied, update check) |
| `apps/server/src/mobile.ts` | Devices table and routes, `deviceUser`, CORS for https://localhost, `/api/sync`, `/api/sync/state`, `Revision`, `/api/catalog/compact` |
| `apps/server/src/scan-core.ts` | Scan matching rules shared with the app: `normalize`, `buildNameIndex`, `bestName`, `readInfoLine` |
| `apps/android/` | Capacitor project: `capacitor.config.json`, `android/` (Gradle, `ManaVaultPlugin.java`, `Settings.java`, `InboxWorker.java`, `MainActivity.java`, icons). Version from the root package.json. `.github/workflows/android.yml` builds it |
| `apps/web/src/store.tsx` | App state (`useStoreState`): undo stack, collections, facets and sort (`visibleCollection`), binder page, statistics, ownership, trade list, trade calculator (`TradeLine`), imports and exports (Moxfield CSV with condition, language, finish, tradelist) |
| `apps/web/src/scan-state.tsx` | Scanned list (`useScanState`, kept in localStorage), finishes (`finishCode`), `matchText`, Add to as one undo step, `scanTargets` |
| `apps/web/src/recognize.ts` | Tesseract worker from `/ocr`, the card outline geometry (`guideBox`, `guideInVideo`), crop and contrast (`prepare`), read modes (`readCard`); `window.__manaVaultScanText` replaces recognition in tests |
| `apps/web/src/library-state.tsx` | Collections CRUD, row picking, bulk remove and move, `editCopy`, `markTrade`, wishlist helpers, deck missing export, offers |
| `apps/web/src/types.ts` | Shared types; `priceOf`, `money`, `copyKey`, `copyLabel`, facet helpers (`cardTypes`, `colorKey`, `curveKey`, same rules as the server) |
| `apps/web/src/components/LibraryDialogs.tsx` | Collection settings (Wishlist checkbox) with the set picker, Copy details (`copyDialog`), Move, Send, Inbox, Accept, Sharing and Rename deck dialogs |
| `apps/web/src/views/CollectionView.tsx` | Collection header (switcher, Options, + Add, count line) and the Cards (chips, list, `Binder`, `Grid`, `Pocket`), Completion, Missing and Statistics tabs; the `Meter` |
| `apps/web/src/views/StatsView.tsx` | `StatsPanel`: stat tiles, `BarList`, mana curve columns |
| `apps/web/src/views/TradeView.tsx` | Trade view: trade picker, balance bar, two columns with lines (`LineRow`) and searches (`GiveSearch`, `GetSearch`), wishlist matches |
| `apps/web/src/trade-state.tsx` | `useTradeState`: trades, open trade, lines, complete with undo, send, accept, decline, copy, export, share link |
| `apps/web/src/components/TradeDialogs.tsx` | New, Rename, Complete, Send, Accept and Share trade binder dialogs |
| `apps/server/src/trades.ts` | Trade tables and routes, completing and reopening, proposals, matches, share link and the public `/share/:token` page |
| `apps/web/src/card-search.ts`, `filters.ts` | Paged card search hook; filter scopes, `matchesFilters`, `searchParams` |
| `apps/web/src/components/CardResults.tsx`, `Options.tsx`, `Picker.tsx` | Search result views and `useViewSearch`; the Options button, `Segments`, `LayoutRows`; the app's choice list |
| `apps/web/src/views/Views.tsx` | Card search (prices, tags, + Wishlist), `OwnershipTab`, `NoDeck`, `Quantity`, `zoneGroups` |
| `apps/web/src/views/DeckView.tsx` | The deck view: header with switcher and format badge, Cards tab (Quick add, legality bar, List, Text, Stacks, Grid, tokens, hover preview), Ownership, Statistics with Mana symbols and sources, Playtest, Description, History |
| `apps/web/src/deck-rules.ts` | Grouping and sorting deck cards, `checkDeck` legality, `manaBalance`, `deckText`, `parseQuickAdd`, `shuffle` |
| `apps/web/src/components/Switcher.tsx`, `DeckDialogs.tsx` | The collection and deck switcher; Tags, Deck format and Edit as text dialogs |
| `apps/web/src/narrow.ts` | `useNarrow`, `usePhone` |
| `apps/web/src/actions.tsx` | The `ACTIONS` map: every command with label, short label, icon, key; shortcut list; workspace list |
| `apps/web/src/menus.ts` | `MENUS` (File, Edit, View, Help menus as action names), `MODE_TABS`, `ACCOUNT_MENU`, `APP_MENU`, `DESKTOP_ONLY` |
| `apps/web/src/dock.ts` | Panel registry, layout model, presets, move and remove operations |
| `apps/web/src/prefs.ts` | Preference defaults (currency, collectionSort, collectionLayout), merge, save to server, theme |
| `apps/web/src/icons.tsx` | `RI` inline SVG icon table (trade, stats, binder, edit, wish, copy, owned, usd, eur added) |
| `apps/web/src/components/` | MenuBar (TitleBar with the menus, ModeTabs, DropDown), Dock, StatusBar (PRICES toggle), Dialog, Shell (desktop and phone, Scan tab), About, CardScanner (camera with focus and torch, scanning loop and lock-on, last card strip, scanned list, edit and Add to dialogs) |
| `apps/web/src/panels/Panels.tsx` | Filters, Collections (values, Wishlist badge), Decks, Card (prices, etched, wanted), Deck list, Import review panels |
| `apps/web/src/about/` | About guide pages `01-overview.md` to `24-release-notes.md` (09 Prices and statistics and 10 Wishlists and trading added in 0.3.0, 11 Proxies and the card maker in 0.9.0, Android app in 0.5.0, 17 Administration in 0.12.0) |
| `apps/web/src/static.test.ts` | Static checks: guide order and links, release note version, every label in the guide, versions equal, no em dashes |
| `apps/web/public/login.html` | Self-contained sign-in page |
| `apps/web/vite.config.ts` | Vite config, including the plugin that serves and bundles the OCR files under `/ocr` |
| `tests/e2e/` | Playwright suites (`release090.spec.ts` for 0.9.0 and the 0.10.0 foil switch, `app.spec.ts`, `collections.spec.ts`, `insights.spec.ts`, `scanner.spec.ts`, `android.spec.ts` with a stand-in for the native plugin and the built files served as Capacitor does; the browser runs with a fake camera), fixtures, sample-data server (`serve.mjs`, with sample prices and a flavor name) |
| `docker-compose.yml`, `.env.example`, `Dockerfile` | Dockhand-ready deployment (unchanged in 0.3.0) |

## Open bugs

None known.

## Open ideas

- Android app: deep links, instant notifications, more than one server or account; leaving the browser OCR files (about 11 MB) and the x86 libraries out of the APK (55 MB now).
- Price change alerts (price history is kept since 0.12.0).
- A built-in demo document (program-design-guide section 6) was not part of the 0.1.0 specification.
- Optional command line (program-design-guide section 3) was not built.
- Card maker: printing both faces of a custom card on a double-sided MPC order.
- Proxies: saving several named print lists; a preview of the back pages.

## Known limits

- Web pages into notes: the article reader can miss or cut articles on unusual sites (the whole page is kept when it finds none); sites that block servers or need a sign-in cannot be fetched (paste works); pasted relative picture addresses without a known page address are not copied; the stand-in example.test site was used in tests, not real sites.
- Notes: two people editing one page are asked which text to keep at save time; there is no live co-editing. Picture addresses are public random codes. Pictures from the server in the app are shown offline only when the phone's web view kept them. Template edits other than rename and delete (changing a template's text) are done by saving a page as a template with the same name and deleting the old one. A copy sent to another account does not copy its notes. Read-only sharing does not exist, so the spec's read mode for read-only members is the phone's reading mode only.

- Live updates: the card search's owned counts are reloaded in place only when coming back to Search or on a live update while Search is open; with a Cloudflare Tunnel the stream depends on it passing server-sent events (a comment is sent every 25 seconds). The Opening started notification comes from the background check (about every 15 minutes, only with Inbox notifications on); while the app is open the question shows at once.
- A copy deleted and later added again in the same collection is counted as held again by the oldest tie of that copy.

- One click on a deck to make it where cards go loads that deck as the open deck, so a deck view that is showing another deck switches to it (the view itself stays). Undo of Add deck to collection with Every card as new copies lowers the counts back; copies added on top by other edits in between are kept.
- Undo puts removed deck links back only within 60 minutes of the remove.

- The Android app has had one camera test on a phone (0.5.0); 0.6.0 was tested in Chromium with a stand-in for the native plugin. ML Kit reading, the camera permission, notifications, the share sheet and the Back button need checking on a phone.
- The app's release signing needs the four `ANDROID_*` repository secrets (README, Android app); without them the tag build fails with a clear message.
- Offline in the app: `art:` and `otag:` searches need the server, prices only for cards opened before, statistics only when opened before. Background sync and file sharing into the app have not been tried on a phone.
- The scanner reads English text. Real OCR was checked with synthetic card pictures through Chromium's fake camera (normal, dark title bar, small, large and off-center cards, name-only cards, a sequence of cards); it has not yet been tried on a phone with real cards, foils or sleeves.
- The live camera needs HTTPS or localhost. The OCR files add about 11 MB to the image (about 7 MB is loaded by a browser).
- Sending works only between accounts on the same server. Offers have no expiry.
- Main set needs Scryfall's printed size for each set; it arrives with the first card database update after 0.2.0. Prices and flavor names arrive with the first card database update after 0.3.0.
- Undo history is per page load and reverses by sending the reverse change; a concurrent edit to the same card by someone else is overwritten by an undo.
- Trades work online only (not queued offline in the app). Accepting a trade with another account cannot be undone.
- Imports up to 5 MB and 5,000 rows; backups up to 250 MB.
- Printing proxies and the card maker's mana symbols need the server to reach Scryfall (cards.scryfall.io, svgs.scryfall.io); without it cards print as white cards with names and symbols are drawn circles. Two-faced cards print their back only after the first card database update with 0.9.0.
- MPC Autofill's own XML order files point to images in its online index, so Mana Vault writes a card list instead. The MPC Autofill list format and the MakePlayingCards picture size (822 x 1122) have not been tried with a real order.
- A Scryfall set that later takes the code of a custom set would rename that set on the next update (custom codes are checked only when made or changed).
- Purchase history: the chart counts a sold card as gone from the date of its sale only when the sale names the purchase it came from; Redo of Open... and Untie is not offered (they are done again from the entry). Older backups (before version 7) keep the current purchase history, whose ties then point to replaced collections.
- Set symbols, symbols, printing changes, suggestions lists, the card back and other card languages arrive with the first card database update with 0.15.0; until then the Symbols window uses its built-in groups and suggestions are empty. The language size estimate uses rough counts until a language has been downloaded once. The Scryfall endpoints for migrations, catalogs and card backs could not be called from the workspace (no internet); they were tested with stand-in answers.
- Custom card pictures are made in the browser with the bundled card fonts. Receipt reading was tried with generated PDFs and pictures, not with real store receipts.
- The print list saves count changes 400 ms after the last change; a change made just before closing is sent while the page closes.
- Card pictures not downloaded to the server load from Scryfall through it. Scryfall's Art Tags and Oracle Tags bulk file names could not be checked from the workspace (no internet); the importer finds them by type or name, and a missing file only leaves tags empty.
- Whole-server backups include the card database (with raw records) and can be large; keep the number kept small on small drives.
- The server serves the built files registered at startup; restart it after rebuilding the interface (Docker does this on every deploy).

## Where work stopped

The current branch `feature/play-table-phase-one-followup` is based on `main` at merge commit `8cc6ad6` (PR #51). Version 0.31.0 passed local `PW_CHANNEL=chrome npm run test:all`; the current 0.31.1 browser-test update needs final validation. The live-engine browser acceptance is skipped locally because Docker and a configured engine are unavailable. The new private-engine browser workflow, remaining Phase 1 deployment/reconnect acceptance, required PR checks and approvals, merge, server/container and Android CI verification, and matching debug APK remain pending. Play Table phases 2 through 4 are not accepted as complete.
