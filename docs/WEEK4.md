# Week 4: Memory + Demo Polish

**Goal:** Resolutions become memory; similar tickets get better recommendations.
**Exit Criteria:** Demo script runs start-to-finish showing memory recall.

---

## Day 1: Memory Infrastructure
**Focus:** Storing history.

- [x] Add `pgvector` extension to Postgres (Week 1 docker setup should have this, verify it).
- [x] Add `MemoryDocument` to Prisma Schema:
    - Fields: `id`, `tenant_id`, `embedding` (Unsupported("vector(768)")), `content`, `metadata` (json)
    - Relations: `ticket_id` (optional source)
- [x] Install embedding library in `apps/ai-worker`:
    - `langchain-google-genai` (already there)
- [x] Create `scripts/setup-memory.ts`:
    - Creates the vector extension if missing
    - Creates index (HNSW) for performance

## Day 2: Memory Ingestion
**Focus:** Learning from the past.

- [x] Implement `embed_resolution` logic:
    - Trigger: `ticket.resolved` event
    - Worker:
      - 1. Extracts `resolution_notes` and `messages`
      - 2. Calls Gemini Embedding API (text-embedding-004)
      - 3. Writes row to `MemoryDocument` via new MCP tool `store_memory`
- [x] Implement `store_memory` MCP tool:
    - Input: `tenant_id`, `content`, `embedding`, `metadata`, `source_event_id`
    - Inserts into DB (Guarded by `UNIQUE(tenant_id, source_event_id)`)
    - Returns success/skipped
- [x] Verify: Resolve a ticket -> Check `MemoryDocument` table has a row. Replay event -> No duplicate.

## Day 3: Memory Recall (RAG)
**Focus:** Using the past.

- [x] Implement `search_memory` MCP tool:
    - Input: `tenant_id`, `query`, `building_id` (optional), `top_k`
    - Logic: Use `ORDER BY embedding <=> $vector`
    - Returns: List of `{ content, similarity, metadata }`
- [x] Update Worker Triage Logic:
    - Before calling LLM for Triage:
      - Call `search_memory(ticket.message)`
    - Inject results into Triage Prompt: "Here are similar past incidents..."

## Day 4: The Golden Demo Script
**Focus:** Scripting the "Happy Path".

- [x] Finalize `scripts/demo-full.sh`:
    - **Scene 1: The First Fail**
      - Create Ticket A ("Boiler making weird noise")
      - AI Triages (Low context) -> "HVAC", Priority 3
      - Vendor Fixes -> "Replaced pilot light in Unit 101"
    - **Scene 2: The Recall**
      - Create Ticket B ("Boiler noise again")
      - AI Triages -> Searches Memory -> Finds Ticket A
      - Proposal Rationale: "Similar to Ticket A fixed by replacing pilot light. Priority 3."
- [x] Polish Logs:
    - Ensure logs are readable and tell the story.

## Day 5: Final Polish & Documentation
**Focus:** Handover quality.

- [x] README.md:
    - "How to Run the Demo" (Single command if possible)
    - Architecture Diagram (ASCII)
- [x] Verify Idempotency again (does replay create duplicate memory? It shouldn't if guarded by event_id).
- [x] Code Cleanup: Remove unused files / console logs.
- [x] Record the Demo Video (optional, for personal satisfaction).

---

## Verification Commands (Cheatsheet)

```bash
# 1. Search Memory (Direct Test)
ts-node scripts/mcp-call.ts search_memory '{ "tenant_id": "t_demo", "query": "leak" }'

# 2. Run Full Demo
./scripts/demo-full.sh
```
