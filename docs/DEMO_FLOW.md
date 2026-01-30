# 🧠 AI Triage & Memory Demo Flow (CLI Edition)

This guide provides a "Golden Path" to demonstrate **AI Logic**, **Learning (Memory)**, and **Recall (RAG)** using only the terminal.

## 🚀 Phase 0: Setup (Do this before call)

0.  **Factory Reset (Optional)**:
    If you want a completely fresh start (empty DB):
    ```bash
    docker-compose down -v && docker-compose up -d
    # Wait ~10 seconds for DB to be ready
    
    # Initialize Database (Schema + Seed Data)
    cd apps/api && npx prisma migrate dev --name init && npx prisma db seed
    cd ../..

    # Create Topics manually to prevent Worker crash
    docker exec demo-redpanda-1 rpk topic create ticket.created ticket.resolved ticket.assigned
    ```
docker exec demo-postgres-1 psql -U maintain -d maintain -c "ALTER TABLE memory_documents ALTER COLUMN embedding TYPE vector(3072);"


1.  **Start Services (4 Separate Terminals)**:
    *   **Tab 1 (API)**:
        ```bash
        cd apps/api && pnpm run start:dev | tee ../../api.log
        # Wait for "Nest application successfully started"
        ```
    *   **Tab 2 (MCP)**:
        ```bash
        cd apps/mcp-server && npm run start:dev
        # Wait for "Server running on http://localhost:3001"
        ```
    *   **Tab 3 (AI Worker)**:
        ```bash
        # Note: Hot-reloads on code changes AND pipes logs to worker.out for the demo view
        cd apps/ai-worker && npx nodemon --watch . --ext py --exec ".venv/bin/python -u -m ai_worker.main" | tee ../../worker.out
   
## 🎬 Scene 1: The First Incident (AI Triage)
**Narrative**: "A tenant in Unit 101 reports a broken boiler. The AI analyzes it."

### 1. Submit Ticket (Unit 101)
*Run this in a third "Control" tab:*
```bash
curl -X POST http://localhost:3000/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "id": "1d8f8c0e-1215-4978-a17b-645b539bb621",
    "title": "Boiler not working",
    "description": "The boiler is making a clicking sound and there is no hot water.",
    "message": "It started this morning. I tried resetting it but nothing.",
    "tenantId": "a0000000-0000-0000-0000-000000000001"
  }'
```

**👀 Watch the Brain (Right Screen)**:
*   `Received event: ticket.created`
*   `Gemini response: ... category: urgent ... confidence: 0.95` (or similar)
*   **Result**: AI classifies as **URGENT** (Priority 4) due to "no hot water".

---

## 🎬 Scene 2: The Resolution (Memory Learning)
**Narrative**: "The manager assigns a vendor, and the vendor fixes it. The AI *learns*."

### 2a. Assign Vendor (Manager Action)
```bash
# We use the known ID "1d8f8c0e..." that we forced in Scene 1
curl -X POST http://localhost:3000/tickets/1d8f8c0e-1215-4978-a17b-645b539bb621/assign \
  -H "Content-Type: application/json" \
  -d '{
    "vendorName": "Mike s Heating",
    "notes": "Please check the thermocouple.",
    "tenantId": "a0000000-0000-0000-0000-000000000001"
  }'
```
*Note: This returns a `vendorTaskId` in the response.*

### 2b. Mark Resolved (Simulate Vendor Fix)
```bash
# 1. Set the Vendor Task ID from Scene 2a response
VENDOR_TASK_ID="48effd2d-823e-478f-bb59-96f4ee74f762"

# 2. Complete the Task
curl -X POST http://localhost:3000/vendor_tasks/${VENDOR_TASK_ID}/complete \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "a0000000-0000-0000-0000-000000000001",
    "resolutionNotes": "Pilot light thermocouple was faulty. Replaced thermocouple and cleaned sensor."
  }'
```

**👀 Watch the Brain (Right Screen)**:
*   `Received event: ticket.resolved`
*   `Building memory from resolution...`
*   `Generated embedding`
*   `💾 Memory stored`

---

## 🎬 Scene 3: The Recall (RAG in Action)
**Narrative**: "Two weeks later, Unit 205 reports a similar issue. The AI remembers Unit 101."

### 3. Submit Similar Ticket (Unit 205)
```bash
# We use the same Tenant ID because Unit 205 belongs to the same building/tenant
curl -X POST http://localhost:3000/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "title": "No heat / clicking noise",
    "description": "Heater is clicking and not turning on.",
    "message": "It sounds like the same issue my neighbor had.",
    "tenantId": "a0000000-0000-0000-0000-000000000001"
  }'
```

**👀 Watch the Brain (Right Screen)**:
*   `Got ticket context: No heat / clicking noise`
*   `Found 1 similar past incidents` (Requires Scene 2 to complete)
*   `Gemini response:`
    *   `category: urgent`
    *   `reasoning`: "Similar to ticket [ID] where pilot light thermocouple was faulty..."
    *   `Confidence: HIGH`
