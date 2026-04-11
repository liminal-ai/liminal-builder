# Builder Session Stack

This note documents the Builder-only session stack after the desktop-first cleanup. The goal is to keep session responsibilities explicit now, while preserving seams that can move into `liminal-context` later without changing semantics.

## Backend Boundaries

### SessionRegistry
- Stores Builder-local session metadata only.
- Owns create, adopt, archive, title persistence, project mapping, and last-active timestamps.
- Does not discover provider-native sessions.

### SessionDiscoveryService
- Reads provider-native session material from disk.
- Claude discovery is index-backed by default and keeps the `isSidechain === false` filter.
- Availability checks are separate from registry ownership, so local metadata cannot masquerade as a healthy discovered session.

### SessionListingService
- Merges registry sessions with discovery results into sidebar rows.
- Produces `SessionListItem` rows with `projectId`, `source`, `availability`, `providerSessionId`, and optional `warningReason`.
- Prevents stale local metadata from shadowing valid discovered Claude sessions.

### SessionOpenService
- Resolves open/adopt/load behavior.
- Determines whether a session is Builder-local, discovered, or stale.
- Returns canonical upsert history only.
- Uses the legacy history bridge only for non-migrated provider paths.

### ClaudeRuntimeCoordinator
- Owns provider session initialization, listener attachment, pending turn tracking, buffered upserts, and canonical stream callbacks.
- Persists canonical upserts into the canonical history store.
- Does not own listing, archive, or discovery concerns.

### SessionTitleService
- Applies Builder-local title overrides.
- Derives initial titles from the first user prompt.
- Keeps retitling logic separate from registry and runtime concerns.

### Session Composition
- `createBuilderSessionServices(...)` constructs the registry, discovery, title, runtime, create, listing, open, and message services once.
- Server startup, websocket wiring, and Builder tools all use the same composition path.
- Runtime call sites depend on explicit service ports instead of a `SessionManager` facade.

## Canonical History

- Claude open/history/send now operate on canonical upsert arrays in the Builder core path.
- `history-compat` remains only as an explicit adapter for non-migrated legacy paths.
- The canonical history store is the persistence seam for future extraction into `liminal-context`.

## WebSocket Transport

- `server/websocket.ts` is now transport setup only.
- Parsing/validation, dispatch, project routes, session routes, agent routes, and the ACP upsert bridge are split into dedicated modules.
- Route failures log `route`, `sessionId`, `projectId`, and a stable failure reason so desktop open failures are diagnosable.

## Desktop State Flow

### DesktopSessionController
- Owns preload bootstrapping, websocket lifecycle, reconnect behavior, server-message handling, and action dispatch.
- Selected sessions are explicit `{ sessionId, projectId, availability, source }` rows.
- Reconnect restore reopens the exact stored `{ sessionId, projectId }` pair.

### SessionListState
- Owns project/session lists, collapse state, pinned sessions, selection, and local persistence.
- Session opens always use the row’s `projectId`; there is no fallback project inference.

### SessionWorkspaceState
- Owns transcript render state per session.
- Distinguishes `loading_history`, `ready`, `unavailable`, and `error`.
- Keeps document-first transcript rendering while decoupling list state from transcript state.

## Future Extraction Seams

The following seams are now explicit Builder interfaces:

- session registry interface
- session discovery interface
- provider runtime interface
- canonical history store interface

These boundaries are intended to move into `liminal-context` later with minimal semantic rewrite, while Builder remains the operational backend today.
