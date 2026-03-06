# Interfaith Dialogue Platform — Architecture v0.1

Date: 2026-03-06
Status: Draft (post-PRD)
Owner: Bill
Build lead: OpenClaw

## 1) Architecture Goals
- Reliable real-time 1:1 conversations (voice first, optional video escalation)
- Strong moderation and auditability
- Citation-first scripture experience with provenance
- Web-first deployability for public beta

## 2) High-Level System

```text
[Web App (Next.js)]
  ├─ Auth + Profile UI
  ├─ Queue + Session UI
  ├─ Citation Panel UI
  └─ Moderation actions (report/block)
           │
           ▼
[API Gateway / Backend (Node+TS)]
  ├─ Auth Service
  ├─ Matchmaking Service
  ├─ Session Service (WebRTC signaling)
  ├─ Citation Service
  ├─ Moderation Service
  └─ Reputation Service
           │
           ├── PostgreSQL (core state)
           ├── Redis (queue, rate limits, ephemeral session state)
           └── Object storage (optional artifacts)
```

## 3) Tech Stack (v1)
- Frontend: Next.js + TypeScript + Tailwind
- Backend: Node.js + TypeScript (Fastify or Nest)
- Realtime media: WebRTC (SFU-ready design; start P2P with TURN fallback)
- Realtime signaling: WebSocket
- Database: PostgreSQL
- Cache/queue: Redis
- Auth: Email verification + session tokens (JWT or signed cookies)
- Infra: Dockerized services + CI pipeline

## 4) Core Domains & Data Model

## 4.1 Identity
### user
- id (uuid)
- email (unique)
- email_verified_at
- display_name
- pseudonym
- created_at, updated_at
- status (active/suspended/deleted)

### user_profile
- user_id (fk)
- languages (jsonb)
- traditions (jsonb)
- bio (nullable)
- avatar_url (nullable)

## 4.2 Matchmaking & Sessions
### queue_entry
- id
- user_id
- mode_preference (voice_only | voice_then_video)
- intent_tags (jsonb)
- language
- trust_band
- created_at

### conversation_session
- id
- user_a_id
- user_b_id
- started_at
- ended_at
- mode_started (voice)
- mode_final (voice|video)
- status (active|ended|terminated)

### session_event
- id
- session_id
- event_type (match, mode_upgrade_request, mode_upgrade_accept, report, disconnect, moderation_action)
- actor_user_id (nullable)
- payload (jsonb)
- created_at

## 4.3 Moderation
### moderation_report
- id
- session_id
- reporter_user_id
- target_user_id (nullable)
- category
- severity
- notes
- created_at

### moderation_case
- id
- report_id
- assigned_to (nullable)
- status (open|reviewing|resolved)
- resolution (warn|cooldown|suspend|dismiss)
- resolved_at

## 4.4 Reputation
### reputation_score
- user_id
- trust_score (numeric)
- safety_score (numeric)
- quality_score (numeric)
- updated_at

### session_feedback
- id
- session_id
- user_id
- rating (1-5)
- felt_safe (bool)
- freeform_note (nullable)

## 4.5 Citation Engine
### corpus
- id
- tradition (islam|christianity|judaism)
- name
- license_info

### translation
- id
- corpus_id
- language_code
- translator
- edition
- provenance_url

### verse
- id
- corpus_id
- book
- chapter
- verse
- canonical_key (unique)

### verse_text
- id
- verse_id
- translation_id
- text

### citation_card
- id
- session_id
- user_id
- verse_id
- translation_id
- rendered_text_snapshot
- inserted_at

## 5) API Surface (v0.1 contracts)

## 5.1 Auth
- POST /auth/signup
- POST /auth/verify-email
- POST /auth/login
- POST /auth/logout
- GET /me

## 5.2 Queue / Matchmaking
- POST /queue/join
- POST /queue/leave
- GET /queue/status
- WS: queue.match_found

## 5.3 Sessions
- POST /sessions/:id/mode-upgrade/request
- POST /sessions/:id/mode-upgrade/accept
- POST /sessions/:id/disconnect
- WS: session.event

## 5.4 Moderation
- POST /reports
- POST /sessions/:id/block
- POST /sessions/:id/report-and-disconnect
- (admin) GET /moderation/cases
- (admin) POST /moderation/cases/:id/resolve

## 5.5 Citation
- GET /citation/search?q=&language=&tradition=
- GET /citation/verse/:canonicalKey?translation=
- POST /sessions/:id/citations

## 6) Realtime / Media Design
- Signaling channel handles:
  - session start payload
  - ICE candidates / SDP exchange
  - mode upgrade intent + consent
- Voice starts immediately after match
- Video requires two-sided explicit consent
- TURN required for NAT traversal fallback

## 7) Safety Architecture
- Report pipeline is first-class (low-friction trigger)
- Session events immutable (append-only log)
- Enforcement service can terminate sessions in real-time
- Rate limits for queue joins, reports abuse, and reconnect churn
- Reputation-informed matching to reduce repeat harm

## 8) Privacy & Compliance Baseline
- Data minimization for profile fields
- Pseudonym shown by default
- Clear retention policy for session metadata
- No hidden recordings policy by default
- Explicit policy pages: Community rules, moderation, privacy

## 9) Observability
- Structured logs with correlation IDs
- Metrics:
  - queue wait time p50/p95
  - session completion rate
  - report rate and confirmed abuse rate
  - mode-upgrade acceptance rate
  - citation usage per session

## 10) Deployment Topology (beta)
- `web` (Next.js)
- `api` (Node service)
- `postgres`
- `redis`
- `coturn` (TURN server)
- optional `moderation-worker`

## 11) Repo Structure (proposed)

```text
/apps
  /web
  /api
/packages
  /types
  /ui
  /config
/docs
  /product
  /architecture
  /policies
/infrastructure
  docker-compose.yml
  env.example
```

## 12) Build Plan (next execution)
1. Scaffold monorepo directories
2. Add env templates and docker-compose for local dev
3. Implement auth + profile vertical slice
4. Implement queue + voice session signaling slice
5. Add citation search MVP APIs + seeded sample corpus

---
Next artifact after approval: initial repo scaffold + `docker-compose.yml` + env templates.
