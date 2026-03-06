# Interfaith Dialogue Platform — PRD v0.1

Date: 2026-03-06
Status: Draft for Gate 1 sign-off
Owner: Bill
Build lead: OpenClaw

## 0) Locked Decisions (from owner)
- Launch audience: **B — English-speaking global**
- Identity policy: **A — Pseudonymous + verified email**
- Moderation strictness: **B — Balanced**
- Launch mode: **C — Public beta**

## 1) Product Vision
A trust-first interfaith platform where Muslims, Christians, and Jews can have structured, respectful conversations with built-in citation tools for scripture references and multilingual context.

## 2) MVP Goals
1. Enable safe 1:1 interfaith dialogue in realtime.
2. Reduce flame-war dynamics through guided prompts and moderation rails.
3. Improve factual grounding through citation-first scripture references.
4. Ship to public beta with measurable safety and conversation quality metrics.

## 3) User Personas
- **Curious learner**: wants to ask questions and understand another tradition.
- **Faith practitioner**: wants respectful, text-grounded dialogue.
- **Bridge-builder**: wants repeated, trust-building cross-community exchanges.

## 4) Core Experience
### 4.1 Conversation Modes
- **Voice mode** (default): audio-only matching.
- **Video mode** (optional): mutual opt-in upgrade from ongoing voice session.

### 4.2 Match Flow
1. User enters queue and selects conversation intent.
2. System matches by language + intent + safety score band.
3. Session opens in voice mode with guided opening prompts.
4. Optional mutual video escalation after minimum interaction window.

### 4.3 Trust/Safety Controls
- One-click report/block/disconnect.
- Active moderation queue (human review + policy automation).
- Progressive penalties: warning → cooldown → suspension.
- Reputation signals influence match priority.

### 4.4 Citation & Fact-Check
- Scripture lookup (book/chapter/verse + keyword search).
- Multilingual translation display with source provenance.
- One-click citation cards inserted into conversation.
- Context expansion (adjacent verses + translation metadata).

## 5) Out-of-Scope (MVP)
- Group rooms and livestream debates.
- Anonymous no-account access.
- Full mobile apps (web-first MVP).
- Monetization/payments.

## 6) Functional Requirements
### FR-1 Accounts & Identity
- Email verification required.
- Pseudonymous public profile.
- Profile fields: display name, traditions willing to discuss, languages.

### FR-2 Realtime Session
- Start voice session within target queue time.
- Mid-session mutual consent toggle for video.
- Structured conversation prompts available throughout.

### FR-3 Moderation
- Report categories (harassment, hate, spam, misinformation, sexual content, other).
- Real-time session kill-switch for severe violations.
- Moderator panel with transcript/citation/event timeline.

### FR-4 Citation Engine
- Store canonical references + translation metadata.
- Search API across supported corpora.
- Citation card object with immutable source fields.

### FR-5 Reputation
- Post-session rating and safety feedback.
- Weighted trust score (anti-gaming constraints).

## 7) Non-Functional Requirements
- Web-first responsive UI.
- Baseline accessibility (keyboard nav, captions-ready architecture).
- Observability: structured logs + moderation/audit events.
- Data minimization by default.

## 8) Safety & Policy Baseline
- No dehumanization/hate/violent incitement.
- No coercive proselytization behavior.
- Strong anti-doxxing policy.
- Policy transparency page in product.

## 9) Metrics (Public Beta)
- Match success rate (queue→session start).
- Session completion rate.
- Report rate per 100 sessions.
- Confirmed abuse rate after review.
- Citation usage rate per session.
- Repeat-user retention (D7/D30).

## 10) Proposed Tech Stack
- Frontend: Next.js (TypeScript)
- Backend: Node.js + TypeScript
- Realtime: WebRTC + signaling service
- Data: PostgreSQL
- Optional infra: Redis for queue/rate limiting

## 11) Delivery Plan (next)
1. **Architecture spec** (data model + API contracts)
2. **Repo bootstrap** (monorepo, CI, env templates)
3. **Clickable prototype** (core user flows)
4. **MVP sprint 1** (accounts + queue + voice)

## 12) Open Questions (to close in v0.2)
1. Which scripture corpora/translations are licensed and approved for MVP?
2. Is realtime human moderation coverage timezone-based or async-only?
3. Minimum age / jurisdiction constraints for public beta?
4. Should first release include clergy/scholar verification badges?

---
If approved, next artifact: `INTERFAITH_PLATFORM_ARCHITECTURE_v0.1.md` + repo scaffold.
