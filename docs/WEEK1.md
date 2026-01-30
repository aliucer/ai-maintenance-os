# Week 1: Foundation (Infra + API Core)

**Goal:** Running services with tickets flowing to Redpanda.
**Exit Criteria:** Ticket creation produces `ticket.created` event in Redpanda.

---

## Day 1: Project Skeleton & Infrastructure
**Focus:** Repo setup and Docker environment.

- [x] Initialize monorepo structure (`apps/api`, `apps/mcp-server`, `apps/ai-worker`)
- [x] Create `docker-compose.yml` with:
  - Postgres 16 (pgvector image)
  - Redpanda (latest)
  - Redpanda Console (optional, for visibility)
- [x] Create stub NestJS app (`apps/api`)
- [x] Create stub Node app (`apps/mcp-server`)
- [x] Verify `docker compose up` works and services are healthy

## Day 2: Database Layer
**Focus:** Schema definition and initial data.

- [x] Initialize Prisma in `apps/api`
- [x] Define Schema V1 in `schema.prisma` (Follow `SCHEMA_REFERENCE.md` strictly):
  - `Tenant`, `Building`, `Unit` (UUID tenant_id)
  - `Ticket` (state enum, correlation_id, tenant_id index)
  - `Message` (tenant/sender info)
  - `OutboxEvent` (status, payloads, retry fields)
  - `AuditLog` (actor, diffs)
- [x] Run migrations to creates tables
- [x] Create seed script to insert:
  - Test Tenant (`t_demo`)
  - Test Building (`b_hq`)
  - Test Unit (`u_101`)

## Day 3: API Core (Tickets)
**Focus:** Basic CRUD for tickets.

- [x] Implement `POST /tickets`:
  - Generates `correlation_id` if missing (returns in response)
  - Validates input
  - Creates `Ticket` + `Message` + `OutboxEvent` + `AuditLog` ("ticket.created") in **one transaction**
- [x] Implement `GET /tickets/:id`:
  - Returns ticket details
  - Filters by `tenant_id` (enforce isolation)
- [x] Add simple error handling (404s, validation)
- [x] Verify endpoints with `curl`

## Day 4: Outbox Publisher
**Focus:** Reliability and Event Bus.

- [x] Connect `apps/api` to Redpanda (install Kafka client)
- [x] Create `CronJob` / `Interval` service:
  - Polls `outbox_events` where `status = 'PENDING'`
  - Publishes to `ticket.created` topic
  - Updates status to `PUBLISHED` (or updates retry count)
- [x] Handle basic connection errors (don't crash app on broker down)

## Day 5: Verification & Polish
**Focus:** End-to-end testing of the Week 1 flow.

- [x] Create `scripts/test-week1.sh`:
  - Posts a ticket via API
  - Checks response for 201 Created
  - Uses `rpk` (inside docker) to verify message reached Redpanda
- [x] Document concise "How to Run" in README
- [x] Self-review: is `correlation_id` propagating?
- [x] **NO GO** if: Ticket created but event lost.

---

## Verification Commands (Cheatsheet)

```bash
# 1. Start everything
docker compose up -d

# 2. Seed DB
npm run seed

# 3. Create Ticket
curl -X POST http://localhost:3000/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "t_demo",
    "building_id": "b_hq",
    "message": "Elevator stuck on 3rd floor"
  }'

# 4. Check Redpanda
docker compose exec redpanda rpk topic consume ticket.created --num 1
```
