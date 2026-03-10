# Long-term Memory

## Interfaith Platform (active project)
- Frontend domain: `https://interfaith.billthomson.elementfx.com/`
- API domain target: `https://api.interfaith.billthomson.elementfx.com/api`
- Temporary DNS-propagation strategy: keep a short-term sslip fallback path, then remove after propagation stabilizes.

## Current product maturity
- Frontend shell + basic flows are live.
- Auth/login flow is working at a basic level.
- Citation search is still mock-backed; UI currently uses safe fallback labels when metadata fields are missing.

## Agreed roadmap direction
- Next major step is "Phase 2":
  1) real citation data/search layer
  2) real queue/session lifecycle
  3) auth hardening
  4) moderation persistence/review path
  5) observability + production cleanup

## Operational continuity
- If session resets, restore continuity from `memory/YYYY-MM-DD.md` + this file instead of relying on chat history visibility.
