# Week 2: MCP Server + AI Worker (Triage Loop)

**Goal:** AI consumes events, calls MCP tools, creates proposals.
**Exit Criteria:** AI worker creates triage proposal via MCP within 30s of ticket creation.

---

## Day 1: MCP Server Foundation
**Focus:** TypeScript MCP infrastructure.
**Prerequisite:** `apps/mcp-server` stub exists from Week 1.

- [x] Install MCP SDK (`@modelcontextprotocol/sdk`) in `apps/mcp-server`
- [x] Configure `apps/mcp-server` to connect to shared Postgres DB
- [x] Setup HTTP transport at `POST /mcp` (Port 3001)
- [x] Verify connectivity:
    - Can connect to DB
    - Can receive MCP tool calls via a simple client script

## Day 2: MCP Tools Implementation
**Focus:** Exposing capabilities to AI.

- [x] Implement `get_ticket_context(tenant_id, ticket_id)`:
    - Fetches Ticket + Messages (ensure tenant isolation)
- [x] Implement `claim_event(event_id, consumer_name)`:
    - `INSERT INTO processed_events ... ON CONFLICT DO NOTHING`
    - Returns `{ claimed: true/false }`
    - This enforces idempotency without direct DB access in worker
- [x] Implement `create_action_proposals(tenant_id, ticket_id, correlation_id, proposals)`:
    - Validates input
    - Inserts into `ai_action_proposals` (logs correlation_id)
    - Schema note: Ensure `executed_at`, `decided_at`, `rejection_reason` fields exist.
- [x] Add `uniq_proposal_active` index handling (migration)
- [x] Test tools manually using a simple MCP client script (or curl)

## Day 3: AI Worker Infrastructure
**Focus:** Python environment and Event Consumption.

- [x] Set up `apps/ai-worker` (Python 3.11+)
- [x] Install dependencies: `confluent-kafka`, `langchain-google-genai`
- [x] Implement Redpanda Consumer:
    - Subscribes to `ticket.created`
- [x] Implement Idempotency:
    - Add `processed_events` to Prisma schema (composite PK). Note: Only MCP server accesses this table.
    - Call MCP tool `claim_event(event_id, 'ai-worker')`
    - If `claimed: false` → Logs "Duplicate event" and skips processing
- [x] Verify: Worker receives `ticket.created`, claims it, and skips duplicates on replay.

## Day 4: The Triage Brain
**Focus:** Gemini Integration and Logic.

- [ ] Implement Client for MCP:
    - Worker talks to `http://mcp-server:3001/mcp`
- [ ] Create Triage Prompt:
    - Input: Ticket messages
    - Output: JSON (category, priority, confidence, rationale)
- [ ] Wiring:
    - Event received → Get Context (MCP) → LLM Triage → Create Proposal (MCP)
- [ ] Implement Auto-execute Logic (`APPLY_TRIAGE`):
- [x] Implement Auto-execute Logic (`APPLY_TRIAGE`):
    - **Critically:** This logic lives in the *Worker* deciding what proposal payload to send? Or the *MCP tool*?
    - **Spec check:** "AI never executes external actions directly. It may auto-apply internal ticket updates (`APPLY_TRIAGE`)..."
    - **Approach:** AI calls `create_action_proposals`. If confidence >= 0.90, the *proposal* payload status could be marked 'EXECUTED' (and ticket updated) by the *Tool*? Or the Worker calls a separate tool?
    - **Leanest Decision:** The *Tool* `create_action_proposals` checks the payload. If `action_type=APPLY_TRIAGE` and `confidence >= 0.90`:
        - Updates ticket state immediately
        - Sets proposal status to `EXECUTED`
        - **Critical:** Writes `OutboxEvent` (`ticket.triaged`) in same transaction
- [x] Task: Update `create_action_proposals` to handle auto-execution logic for `APPLY_TRIAGE`.

## Day 5: End-to-End Verification
**Focus:** The Loop Works.

- [x] Implement `GET /tickets/:id/actions`:
    - API endpoint to list proposals (vital for verification script)
- [x] Create `scripts/test-week2.sh`:
    - 1. Create Ticket (API)
    - 2. Wait 10s
    - 3. Check `GET /tickets/:id/actions`
- [x] Verify "High Confidence" flow:
    - Simulate clear "Pipe burst" message (emergency)
    - Expect `EXECUTED` proposal + Ticket Status `TRIAGED` (or `New` -> `Triaged` if we updated state)
- [x] Verify "Low Confidence" flow:
    - Simulate vague message "It sounds weird"
    - Expect `PROPOSED` proposal (Manager needs to approve)
- [x] Verify Idempotency:
    - Replay event, ensure no duplicate proposals/logs.

---

## Verification Commands (Cheatsheet)

```bash
# 1. Start everything
docker compose up -d

# 2. Tail worker logs
docker compose logs -f ai-worker

# 3. Create Ticket
curl -X POST http://localhost:3000/tickets ...

# 4. Check Proposals
curl http://localhost:3000/tickets/{id}/actions?tenant_id=t_demo
```
