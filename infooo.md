# ADR-001 — Foundations (Phase 1)

**Status:** Accepted
**Date:** <today>
**Phase:** 1 (Requirements + HLD)
**Supersedes:** none
**Superseded by:** none

---

## Context

CollabCode is a real-time collaborative coding platform where users join rooms,
edit code together, chat, and execute code. The MVP must be defensible in
interviews — every architectural choice must solve a concrete problem, not
exist for decoration.

This ADR captures the foundational decisions made during Phase 1 that all
subsequent LLD (Phase 2) and implementation (Phase 3+) will inherit.

---

## Scale target (design for peak, not average)

| Metric | Value | Why this number |
|---|---|---|
| Peak concurrent WebSocket connections | 500 | Comfortably fits a handful of containers, but forces multi-instance WS scaling (Redis Pub/Sub) to be genuinely necessary — not decoration |
| Active rooms | 50 | Room state in memory is bounded; snapshot write rate stays trivial |
| Executions / min (peak) | 30 (burst 100) | Justifies a real async queue (Kafka) because spikes exceed synchronous capacity |
| Avg session length | 20 min | Drives room expiry window |
| Max rooms per user | 3 | Rate-limit hook and abuse-prevention baseline |
| Avg code size per room | ~2 KB | Snapshot storage is cheap; no reason to store diffs |

**Rejected:** designing for 10k+ concurrent users. At that scale, WS scaling,
Redis sizing, connection drain on deploy, and Kafka partitioning become
different problems — a different project. Chosen scale is deliberate.

---

## Decisions

### D1 — WebSocket model: one connection per client, rooms are subscriptions

**Decision:** A client maintains **one** WebSocket connection. Rooms are
Socket.IO subscriptions on that connection (`socket.join(roomId)` on entry,
`socket.leave(roomId)` on exit).

**Rationale:** "One socket per room" breaks the moment a user opens multiple
rooms or tabs, and paints Phase 6 (Redis Pub/Sub scaling) into a corner. Rooms
are logical channels inside a connection — not the connection itself.

**Rejected:** one WebSocket per room.

---

### D2 — Room lifecycle: revivable expiry, not hard delete

**Decision:**
- Room `status`: `active | expired`.
- Expiry trigger: **30 minutes with zero active participants**.
- On expiry: presence state cleared, in-memory state evicted, `Room.status = expired`.
- **Revivable within 7 days:** rejoin by link rehydrates from latest `CodeSnapshot`, `status → active`.
- After 7 days: hard-delete room + snapshots.
- Detection: Redis TTL on `room:<id>:presence` (Phase 6+). Pre-Redis: lazy check of `Room.lastActivityAt` on access.

**Rationale:** "Expired" means "no active session" — not "destroyed." Rejoin by
link should still show *something* within a retention window, else UX is
hostile and demos break.

**Rejected:** hard-delete on inactivity (loses rejoin story); persist forever (no cleanup cost accounting).

---

### D3 — Code truth: hot in-memory (versioned) + periodic DB snapshots

**Decision:**
- **Hot source of truth:** in-memory room state (`Map<roomId, RoomState>`), versioned integer.
- **Durable source of truth:** `CodeSnapshot` writes — **full code**, not diffs — at:
  - Every **~30s**, OR
  - Every **~20 versions**, whichever first,
  - **On manual "Save"**,
  - **On last participant leave**.
- Per-keystroke DB writes are **forbidden**.

**Rationale:** Per-keystroke persistence ≈ 500 writes/sec at our scale. Snapshot
batching reduces to **~2 writes/sec** — a ~250× reduction with bounded
worst-case data-loss window of 30s. Full snapshots (not diffs) avoid
reconstruction/OT complexity; storage cost is trivial (~4 MB per 20-min window).

**Rejected:** per-keystroke persistence (melts DB, useless durability gain); diff-only snapshots (replay-based reconstruction = OT/CRDT territory).

**Override of earlier proposal:** "Save = only write" rejected. Save is a checkpoint, not the sole write path.

---

### D4 — Permissions: flat edit for MVP

**Decision:** Any participant in a room can edit. No host-approval workflow.

**Rationale:** Host-approval breaks the core requirement (real-time
collaboration) and adds a merge-conflict + approval state-machine — Phase-10
complexity in Phase-3 clothing. Roles and versioned snapshots are deferred to
post-MVP as optional extensions.

**Rejected:** host-approves-each-save (contradicts real-time); roles + editor/viewer (nice extension, not MVP).

---

### D5 — Execution queue: single topic, language in payload

**Decision:** Single `execution.requested` topic. `language` is a payload field.
Partition by language **only if** starvation is observed.

**Rationale:** 30 exec/min peak does not warrant per-language partitioning.
Premature partitioning adds operational complexity without evidence.

**Rejected:** one queue per language (no starvation evidence); pre-partitioning by language (Phase-7 over-engineering).

---

### D6 — Participant state machine: online | offline | left

**Decision:**
- `online` — WS connected
- `offline` — WS disconnected, 30s grace window active
- `left` — explicit leave OR grace expired; presence-invisible but row retained with `leftAt`

**Rationale:** "Online/offline" collapses *deliberate exit* and *accidental
disconnect* into one state, hiding intent. Different cleanup policies, different UX.

**Rejected:** online/offline only; delete-on-leave (loses audit trail).

---

### D7 — CodeSnapshot stores full code, WS events carry diffs

**Decision:**
- `CodeSnapshot.code` = full code at that version.
- WS `code:update.changes` = diff (minimizes wire payload).

**Rationale:** Different layers, different needs. Diffs on the wire reduce
bandwidth; full snapshots in DB eliminate replay and corruption risk. These
are not in conflict — they serve different transports.

**Rejected:** diff-only in DB (replay = OT territory, explicitly deferred).

---

### D8 — Chat: persisted, live via WS, history via REST

**Decision:**
- Live messages: WebSocket `chat:message` → persist to DB → broadcast to room sockets.
- History: REST `GET /rooms/:roomId/messages?before=<ts>&limit=50` (paginated).
- Redis Pub/Sub (Phase 6) is **transport only**, not storage. Storage = DB.

**Rationale:** Redis is not a chat store — it's a cross-instance event bus.
Conflating transport and storage is a common failure. WS join stays light;
history + pagination belong on REST.

**Rejected:** chat history via WS join payload (bloats handshake, no pagination); Redis as chat store (wrong layer).

---

### D9 — ExecutionJob stores immutable code at submission time

**Decision:** `ExecutionJob.code` = code exactly as submitted, immutable.
Worker executes that code. No re-fetch from room on execution.

**Rationale:** Time-of-execution vs time-of-submission race. If the room state
changed between Run and worker pickup, "run" would execute code the user never
submitted. Submission-time snapshot = immutable fact.

**Rejected:** `{ roomId, version }` + worker refetch (racy, confusing UX).

---

### D10 — Room has no `code` field

**Decision:** `Room` document is **metadata only** — `roomCode`, `name`, `hostId`,
`language`, `currentVersion`, `status`, `lastActivityAt`. No `code` field.
`Room.language` = current selection; `CodeSnapshot.language` = immutable at snapshot time.

**Rationale:** Two sources of truth (Room.code + CodeSnapshot) will diverge.
Active code lives in memory (later Redis); DB persists checkpoints only.
Snapshot language allows correct historical rehydration when user switches languages.

**Rejected:** `Room.code` for "latest" + snapshot for "history" (two truths, diverging).

---

### D11 — SQL: Option A — MVP Mongo-only, migrate Auth to Postgres in Phase 5

**Decision:**
- Phase 3–4 (MVP): MongoDB for everything.
- Phase 5 (microservices split): migrate Auth Service to PostgreSQL.
- Room / Chat / Execution stay on MongoDB.

**Rationale:** SQL for Auth is defensible (ACID, unique email constraint,
transactional refresh-token rotation). But adding Postgres to the MVP doubles
infra and ORM surface for zero benefit at 500 users. Mongo `unique: true`
covers email uniqueness; multi-document transactions cover token rotation. The
Phase-5 migration becomes a deliberate, interview-worthy story: "I moved Auth
to Postgres when I split it, because [X]."

**Rejected:** Postgres from day 1 (MVP complexity for zero benefit); all-Mongo forever (loses the SQL learning story).

---

### D12 — Three separate MongoDB databases, not three collections

**Decision:** `auth_db`, `room_db`, `execution_db` — three logical MongoDB
databases (same instance in dev). Each module connects only to its own DB.

**Rationale:** Cross-module queries become **physically impossible**, not just
discouraged by convention. Zero dev cost (one instance, three DBs). Phase-5
microservice split = connection-string change, not a data migration.

**Rejected:** single database with multiple collections (requires discipline; discipline fails).

---

### D13 — Module boundaries via service interfaces

**Decision:** Cross-module access ONLY via service-layer interfaces. No module
touches another module's collections. REST controllers and WS handlers both
call the same service layer. Business validation + typed domain errors live in
the service; transport adapters translate them (HTTP status / socket event).

**Rationale:** Duplicated validation across REST and WS produces divergent bugs.
Transport must not know domain; domain must not know transport. This also makes
Phase-5 microservice split a boundary-swap, not a business-logic refactor.

**Rejected:** per-controller validation (duplication); global error handler as the sole abstraction (transport-level, doesn't solve duplication).

---

### D14 — Execution: FakeExecutor behind CodeExecutor interface

**Decision:** Define `CodeExecutor` interface with `execute(code, language, input)`.
- Phase 3: `FakeExecutor` — returns mock output, executes nothing.
- Phase 5+: `DockerExecutor` — real sandbox with CPU/memory/timeout/network limits.
- Swap via dependency injection at composition root. `ExecutionService` unchanged.

**Rationale:** Real code execution is never done in-process (`child_process.exec(userCode)`
is forbidden). Docker sandboxing is a Phase-5 concern. The MVP must prove the
end-to-end async pipeline (submit → queue → worker → result push) without
blocking on Docker. Strategy pattern + DI makes the swap a one-line change.

**Explicit honesty constraint:** Do not claim production-grade sandbox security
in Phase 3. `FakeExecutor` executes nothing — say so.

**Rejected:** real execution in MVP (insecure, blocks pipeline validation); no interface (couples ExecutionService to Docker from day one).

---

### D15 — In-memory room state, with Redis Pub/Sub added in Phase 6

**Decision:** Phase 3–5: `Map<roomId, RoomState>` in the single Node process.
Phase 6: Redis Pub/Sub for cross-instance WS event propagation; Redis for cache
and presence; Redis for distributed rate limiting.

**Rationale:** In-memory state is per-process. The moment there are two WS
servers, state diverges and cross-instance edits don't propagate. This is a
Phase-6 problem — but the architecture must be ready for it (hot state must be
serializable, events must be broadcastable). Adding Redis to Phase 3 would be
premature.

**Rejected:** Redis from day 1 (unneeded at single-instance MVP); in-memory forever (breaks at 2 instances, Phase 8).

---

### D16 — API surface: REST + WebSocket + (later) Kafka

**Decision:**
- **REST** — request/response, idempotent reads and one-shot writes (auth, room create/join, snapshot fetch, execution submit, execution status, chat history).
- **WebSocket** — continuous bidirectional (room presence, code edits, chat live, execution result push).
- **Kafka** (Phase 7+) — async, fire-and-forget (execution jobs to workers).

**Rationale:** Mixing channels is a common beginner mistake. Each channel has a
distinct role: REST = "give me this now", WS = "tell me when it changes",
Kafka = "do this in the background, tell me later".

---

## Failure paths (summary)

| Component | Failure | User impact | Mitigation |
|---|---|---|---|
| MongoDB primary | Election window (~10–30s) | Write failures during window | Replica set auto-elects; API circuit-breaker returns 503 + Retry-After during election; backups are RPO, not runtime recovery |
| WS server | Crash | All connections on that instance drop | Health checks + LB route new traffic; client exponential backoff with jitter (prevents reconnect storm); on reconnect, REST full resync |
| Redis — cache | Down | Slower (DB fallback) | Graceful: direct DB read |
| Redis — presence | Down | Cross-instance presence broken | Degraded; document as accepted during outage |
| Redis — Pub/Sub | Down | Cross-instance real-time collab broken (same-instance still works) | No DB fallback (DB can't push); surface via health; optionally block cross-instance joins |
| Kafka | Down | Executions unavailable | API returns 503 + Retry-After (no local buffer in MVP); producer `acks=all`, RF=3; alerting on producer error rate + consumer lag |
| Worker | Crash mid-job | Job stuck or lost | Kafka consumer group redelivery; bounded retry (3x with backoff) → DLQ; idempotent workers (skip if `job.status === completed`) |
| Version mismatch on edit | Two concurrent editors | One edit rejected | WS handler rejects stale `version`; client receives `code:conflict`, refetches full state via REST, reloads editor; last-write-wins, no OT/CRDT |
| WS disconnect before result push | Result delivered after disconnect | User sees no output | `ExecutionJob` in DB is durable; client polls `GET /executions/:jobId` on reconnect. Hybrid push (fast) + pull (guaranteed) |
| Room expiry vs rejoin race | User rejoin concurrent with cleanup | Room deleted under user | Atomic `findOneAndUpdate` with status-condition; cleanup job checks `lastActivityAt` and status before delete |

---

## Consequences

**Positive:**
- All decisions trace to a concrete problem at the chosen scale.
- Microservice split (Phase 5) is a boundary swap, not a refactor, because boundaries are already enforced (D12, D13).
- Execution pipeline proves end-to-end before Docker exists (D14).
- Multi-instance WS scaling has a clear plan (D15) without premature complexity.
- Failure paths are documented before code — reliability is designed in, not bolted on.

**Negative / costs accepted:**
- Up to 30s of code loss on hard crash (bounded by snapshot cadence — D3).
- No OT/CRDT — rare unsaved-keystroke loss under high edit contention (D-version-conflict).
- Postgres migration in Phase 5 is real work (accepted deliberately — interview story).
- Kafka down = executions unavailable in MVP (accepted; local buffering is Phase-10+).
- FakeExecutor is not real execution — must be stated honestly in any demo/interview.

**Explicitly out of scope (deferred):**
- Kubernetes, OT/CRDT, multi-file projects, video, AI assistant, GitHub integration, complex permissions, 10+ microservices.

---

## Interview soundbite (30 seconds)

> "CollabCode is a real-time collaborative coding platform designed for peak
> 500 concurrent WebSocket connections, 50 active rooms, and 30 executions/min.
> Stack evolves phase-wise: React + Node + Socket.IO + MongoDB in the MVP,
> then Postgres (Auth only), Redis (Pub/Sub + presence), Kafka (execution
> queue), and Docker + Nginx. Three decisions drive the architecture: (1) code
> truth is versioned in-memory state with 30s DB snapshots — per-keystroke
> persistence would melt the DB; (2) execution is a `FakeExecutor` behind a
> `CodeExecutor` interface in Phase 3, swapped to DockerExecutor in Phase 5 —
> so the async pipeline is proven before the sandbox exists; (3) module
> boundaries are enforced at the database level (three MongoDB databases) so
> the Phase-5 microservice split is a connection-string change, not a migration."

---

## Related

- `docs/architecture/hld-v1.md` — HLD v1 (modular monolith)
- `docs/architecture/hld-v2.md` — HLD v2 (microservices + Redis + Kafka) — Phase 5+
- Phase 2 LLD will inherit every decision above.


# ADR-002: Auth Slice — LLD + Implementation

## Status: Complete ✅
## Date: [today]

---

## 1. What was built

Full authentication slice, end-to-end, in a modular monolith:

- Register, Login, Refresh (with rotation), Logout
- Get profile (`GET /me`), Update profile (`PATCH /me`)
- JWT access token (15 min) + refresh token (7 days, HTTP-only cookie)
- Argon2 password hashing
- Timing-safe login (user enumeration prevention)
- MongoDB Atlas, 3 logical databases (auth_db, room_db, execution_db)

---

## 2. Key architectural decisions

### D1 — Refresh token storage
- **Decision:** DB mein store, SHA-256 hashed
- **Why:** Logout / revocation possible. Stateless JWT revoke nahi ho sakta.
- **Trade-off:** DB roundtrip per refresh. Acceptable.
- **Alternative rejected:** Stateless refresh JWT — no revocation.

### D2 — Refresh token rotation
- **Decision:** Strict rotation (findOneAndDelete atomic)
- **Why:** Token theft detection. Purana token use hua = leak signal.
- **Trade-off:** Multi-tab mein 2nd refresh fail ho jaata (strict rotation).
- **Deferred:** 10s grace window / token family tracking — production mein chahiye.
- **Interview line:** "MVP accepts multi-tab re-login cost. Production fix is grace window — deferred."

### D3 — Access token payload
- **Decision:** Sirf `{ userId }`
- **Why:** Minimal payload (client-readable). Role stale ho sakti hai (15min TTL accepted).

### D4 — Password hashing
- **Decision:** Argon2id (memory-hard, OWASP #1)
- **Why:** GPU cracking resistance. No 72-byte truncation (bcrypt quirk).
- **Cost:** Native build. Docker image heavy (Phase 9 mein dekhna).

### D5 — Login error message
- **Decision:** "Invalid email or password" (same for both cases)
- **Why:** User enumeration attack prevention.
- **Bonus:** Timing-safe — user not found pe bhi dummy hash compute.

### D6 — Shape vs business validation
- **Shape validation:** Zod schemas in DTOs, applied via `validate()` middleware
- **Business validation:** Service layer mein, typed domain errors
- **Why:** Shape = transport concern (fail fast before service). Business = service concern.

### D7 — Repository returns plain objects
- **Decision:** Mongoose doc nahi, plain JS object
- **Why:** Storage-agnostic boundary. Service Mongoose import nahi karti.
- **Payoff:** Phase 5 mein Mongo→Postgres swap = repo change only.

### D8 — Manual DI via composition root
- **Decision:** `app.js` mein sab `new`, constructor injection everywhere else
- **Why:** 15 classes ke liye container overkill. Explicit is better.
- **Interview line:** "I use a composition root, not a DI library."

### D9 — MongoDB Atlas, single cluster, 3 logical DBs
- **Decision:** `MONGO_URI` + `dbName` per module
- **Why:** M0 free tier = one cluster. Logical isolation preserved.
- **Trade-off:** Physical isolation nahi. Split clusters when scale demands.

---

## 3. Folder structure (final)

backend/src/
├── shared/
│   ├── config/index.js              ← env vars, fail-fast
│   ├── logger.js                    ← pino, structured
│   ├── db/mongo.js                  ← multi-DB connect helper
│   ├── errors/AppError.js           ← typed error hierarchy
│   └── middleware/
│       ├── requestId.js             ← UUID per request
│       ├── validate.js              ← zod middleware
│       ├── auth.middleware.js       ← JWT verify
│       └── error.middleware.js      ← central error handler
├── modules/
│   └── auth/
│       ├── user.model.js
│       ├── refresh-token.model.js   ← TTL index auto-cleanup
│       ├── auth.repository.js       ← interface
│       ├── mongo-auth.repository.js ← impl, toPlain boundary
│       ├── auth.errors.js           ← domain-specific errors
│       ├── auth.dto.js              ← zod schemas + toUserDto mapper
│       ├── token.service.js         ← JWT + rotation
│       ├── auth.service.js          ← business logic
│       ├── auth.controller.js       ← thin transport
│       └── auth.routes.js           ← routes with middleware
└── app.js                           ← composition root, bootstrap

---

## 4. Patterns applied

| Pattern | Where | Why |
|---|---|---|
| **Repository** | AuthRepository + MongoAuthRepository | Storage-agnostic boundary |
| **DI (manual)** | Composition root in app.js | Swap-friendly, testable |
| **Strategy** | (Phase 4) CodeExecutor will use | FakeExecutor → DockerExecutor |
| **Higher-order middleware** | validate(schema), requireAuth(tokenService) | Configurable middleware |
| **Factory** | authRouter({ controller, tokenService }) | Dependency injection into router |
| **Typed errors** | AppError hierarchy | Transport translates via instanceof |
| **Lazy model resolution** | `User()` function | Decouples model from connection lifecycle |

---

## 5. Security decisions checklist

- [x] Password hashing (argon2id, memory-hard)
- [x] Refresh token hashing (SHA-256, DB never sees raw)
- [x] Refresh token rotation (atomic findOneAndDelete)
- [x] HTTP-only cookies (XSS can't read refresh token)
- [x] `secure` cookie flag (HTTPS in prod)
- [x] `sameSite: 'lax'` (CSRF mitigation)
- [x] Cookie scoped to `/api/v1/auth` only
- [x] User enumeration prevention (same error message)
- [x] Timing attack prevention (dummy hash on not-found)
- [x] Role hardcoded as 'user' in register (client can't escalate)
- [x] `passwordHash: select:false` in schema
- [x] Response mapper (`toUserDto`) — no accidental field leaks
- [x] Client-supplied userId ignored (server derives from JWT)
- [x] Body size limit (1MB — DoS mitigation)
- [x] CORS specific origin (not `*`)

---

## 6. Operational hygiene

- **Fail-fast config** — missing env vars = crash at startup
- **Structured logs** — pino, JSON, requestId correlation
- **Request ID** — UUID per request, X-Request-Id header, in logs + response
- **Graceful shutdown** — SIGTERM → close server → close DB → exit (10s hard timeout)
- **Health endpoint** — `/health` for LB checks
- **Central error handler** — operational vs programmer paths
- **Multi-DB isolation** — auth_db, room_db, execution_db
- **Atlas `serverSelectionTimeoutMS: 10000`** — cold start buffer

---

## 7. API endpoints (v1)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/register` | No | Create user, return tokens |
| POST | `/api/v1/auth/login` | No | Authenticate, return tokens |
| POST | `/api/v1/auth/refresh` | Cookie | Rotate refresh, new access |
| POST | `/api/v1/auth/logout` | Cookie | Revoke refresh token |
| GET | `/api/v1/auth/me` | Bearer | Current user profile |
| PATCH | `/api/v1/auth/me` | Bearer | Update name |
| GET | `/health` | No | Health check |

Response shapes:
- Success: `{ user: {...}, accessToken: "..." }` (refresh in cookie)
- Error: `{ error: { code, message, details?, requestId } }`

---

## 8. Interview-ready answers (from this phase)

**"Why refresh tokens?"**  
"Access tokens are 15-min stateless JWTs — short TTL bounds XSS damage. Refresh tokens are 7-day, HTTP-only cookie, DB-hashed — used only to get new access tokens. Rotation detects theft: reusing an old refresh token signals leak."

**"Why repository pattern?"**  
"Repositories return plain objects, not Mongoose documents. Service layer never imports Mongoose. Swapping MongoDB for Postgres is a repository change, not a service rewrite."

**"Why manual DI?"**  
"A composition root in app.js wires everything. 15 classes — a DI container would be overkill. Explicit dependency graph is easier to read and defend."

**"How do you prevent user enumeration?"**  
"Same 'Invalid email or password' error for both cases. Also timing-safe: on user-not-found, we still compute a dummy argon2 hash so response time is uniform — otherwise attackers enumerate emails via timing."

**"How do you handle refresh token theft?"**  
"Strict rotation: every refresh deletes the old token and issues a new one. If an old token is ever used, it's already deleted → 401. In production, I'd add a grace window (10s) for multi-tab, but MVP accepts the trade-off."

**"What happens if the DB crashes?"**  
"All auth endpoints fail with 500 (via error handler). Health check reflects it. Atlas M0 auto-recovery via replica set — 10-30s write unavailability. Production would add a circuit breaker: fail fast with 503 + Retry-After instead of slow timeouts."

---

## 9. What's NOT done (deferred)

- Email verification — Phase 10+
- Password reset flow — Phase 10+
- OAuth (Google/GitHub) — optional
- Multi-tab grace window — production fix
- Session list UI ("active devices") — profile extension
- Rate limiting on login/register — Phase 6 (Redis)
- Account lockout after N failed logins — Phase 10
- Audit log (who logged in when, from where) — Phase 10
- Refresh token family tracking — production hardening

---

## 10. Next phases

**Phase 4 — Room module (backend)**
- Room, Participant, CodeSnapshot models
- Room service (create, join, leave, get)
- In-memory room state manager
- REST endpoints

**Phase 5 — WebSockets**
- Socket.IO setup, auth handshake
- Room join/leave events
- code:update events with versioning
- Presence, chat

**Phase 6 — Frontend auth**
- Login/Register pages
- Redux Toolkit + axios interceptors
- Protected routes
- Token refresh on 401

**Phase 7+ — Microservices split, Redis, Kafka, Docker, Observability**




Humne Room ka poora lifecycle banaya, lekin sirf REST API ke through (WebSocket abhi baaki hai). Yeh humne isliye kiya taaki database, state, aur background jobs pehle stable ho jayein. Phir WS ko upar se baithana easy hoga.

1. Data Layer (Models & DB)
Humne 3 nayi collections banayi room_db mein:

Room: Room ki basic info (roomCode, hostId, language, currentVersion, status, lastActivityAt).

Participant: Kaun kis room mein hai. Isme (roomId + userId) ka unique index lagaya (taaki ek user ka ek hi row bane, chahe 2 tabs khuli hon).

CodeSnapshot: Version history. (roomId + version) ka unique index. Har 30 seconds ya 20 versions ke baad ek snapshot save hota hai.

2. The Core Engine: Room State Manager (room-state.manager.js)
Yeh is phase ka sabse important file hai.

Database har keystroke pe hit na ho, isliye humne ek In-Memory Map banaya.

Jab user join karta hai, toh DB se latest snapshot utha kar memory mein load hota hai (Lazy Hydration).

Isme dirty flag hai. Jab bhi code change hota hai, room dirty mark ho jaata hai.

Isne multiple tabs (sockets) ko track karne ka logic bhi sambhala hai (ek user ke paas multiple sockets ho sakte hain).

3. The Background Worker: Snapshot Sweeper (snapshot.sweeper.js)
Yeh ek global timer hai jo har 10 seconds mein chalta hai.

Yeh dekhta hai konsa room dirty hai aur kya uska 30 sec ya 20 versions poore hue hain.

Agar haan, toh memory se code utha kar DB mein CodeSnapshot save karta hai aur Room.currentVersion update karta hai.

Isse server crash ho jaye toh maximum 30 second ka code loss hoga, poora nahi.

4. Business Logic (room.service.js)
Yahan humne saare rules apply kiye:

Create Room: 6-character ka unique code generate karta hai (collision retry ke saath). Host ko auto-join karwata hai.

Join Room:

Lazy expiry check karta hai (agar 30 min inactive hai toh room expire).

Agar room expire ho gaya tha, toh usko Revive karta hai (agar 7 din ke andar hai).

Max 3 Rooms Limit: Aggregation query chala kar check karta hai ki user 3 se zyada active rooms mein toh nahi hai.

Leave Room: User ko left mark karta hai.

5. REST APIs (room.controller.js & room.routes.js)
Humne 4 secure endpoints banaye (JWT protected):

POST /rooms (Create)

GET /rooms/:roomCode (Get details + participants)

POST /rooms/:roomCode/join (Join)

POST /rooms/:roomCode/leave (Leave)

🧠 Is Phase mein kya LLD/HLD concepts apply hue?
Optimistic Concurrency Control: currentVersion se pata chalta hai client ka data stale hai ya fresh.

In-Memory vs Persistent State: Hot state memory mein (fast), cold state DB mein (safe).

Background Job (Sweeper): Batch processing, taaki main thread block na ho.

Lazy Expiry: Bina kisi extra cron job ke, jab user access kare tab check karo ki expire hua ya nahi.

Ab humare paas ek fully functional REST API hai jahan log rooms bana sakte hain, join kar sakte hain. Lekin abhi tak live coding aur chat nahi hai.