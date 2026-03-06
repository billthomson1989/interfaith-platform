# Interfaith Platform Repo Scaffold

This repository contains the initial scaffold for the interfaith dialogue platform.

## Structure
- apps/web: frontend
- apps/api: backend
- packages/*: shared packages
- docs/*: product, architecture, policy docs
- infrastructure/: local dev stack (Postgres/Redis/TURN)

## Quick start
1. Copy `infrastructure/env.example` to `.env`
2. Run `docker compose -f infrastructure/docker-compose.yml up -d`
3. Build app services (next step)
