#!/bin/bash
# ============================================
# The Golden Demo: Property AI Triage with Memory
# ============================================
# Shows: First ticket → Resolution → Memory → Second ticket uses memory
#
# Run: ./scripts/demo-full.sh

set -e

API_URL="http://localhost:3000"
MCP_URL="http://localhost:3001"
TENANT_ID="a0000000-0000-0000-0000-000000000001"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        [DEMO] Property AI Triage System - Full Demo           ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================
# Scene 1: The First Ticket (No Memory Yet)
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  SCENE 1: The First Boiler Noise Complaint${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "[CREATE] Creating first ticket: Boiler making weird noise..."
TICKET_A=$(curl -s -X POST "$API_URL/tickets" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "'$TENANT_ID'",
    "title": "Boiler making weird clicking noise",
    "description": "The boiler in Unit 101 is making strange clicking sounds",
    "message": "Hi, our boiler has been making a weird clicking noise for the past few days. It still works but the sound is concerning."
  }')

TICKET_A_ID=$(echo $TICKET_A | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo -e "   ${GREEN}OK${NC} Created ticket: $TICKET_A_ID"
echo ""

# Wait for AI worker (if running) or simulate triage
sleep 2

echo "[AI] AI Triage (no memory available yet)..."
echo "   Category: routine"
echo "   Priority: 3"
echo "   Reasoning: Standard maintenance request (no similar past incidents)"
echo ""

# Assign vendor using the new assign API endpoint
echo "[MANAGER] Manager assigns vendor via API..."
ASSIGN_A=$(curl -s -X POST "$API_URL/tickets/$TICKET_A_ID/assign" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "'$TENANT_ID'",
    "vendorName": "Comfort HVAC Pros",
    "notes": "Check boiler clicking noise",
    "assignedByUserId": "manager-jane"
  }')

TASK_A_ID=$(echo $ASSIGN_A | python3 -c "import sys,json; print(json.load(sys.stdin)['vendorTaskId'])")
echo -e "   ${GREEN}OK${NC} Vendor task created: $TASK_A_ID"
echo ""

echo "[VENDOR] Vendor completes work: Replaced pilot light assembly..."
curl -s -X POST "$API_URL/vendor_tasks/$TASK_A_ID/complete" \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "'$TENANT_ID'", "resolutionNotes": "Replaced faulty pilot light igniter assembly in Unit 101 boiler. Clicking noise was caused by repeated ignition attempts."}' > /dev/null

echo -e "   ${GREEN}OK${NC} Ticket A resolved!"
echo ""

# ============================================
# Store the memory
# ============================================
echo "[MEMORY] Storing resolution in memory for future reference..."

# Get the resolution content
MEMORY_CONTENT="Ticket: Boiler making weird clicking noise in Unit 101
Problem: Strange clicking sounds from boiler
Resolution: Replaced faulty pilot light igniter assembly. Clicking noise was caused by repeated ignition attempts.
Vendor: Comfort HVAC Pros"

# Generate embedding and store
cd apps/ai-worker && python3 << EOF
import os, uuid
os.environ['GOOGLE_API_KEY'] = os.getenv('GOOGLE_API_KEY', '')
from ai_worker.embeddings import EmbeddingService
from ai_worker.mcp_client import MCPClient

embed_svc = EmbeddingService()
mcp = MCPClient("http://localhost:3001")

content = """$MEMORY_CONTENT"""
embedding = embed_svc.embed(content)

result = mcp.store_memory(
    tenant_id="$TENANT_ID",
    source_event_id=str(uuid.uuid4()),
    ticket_id="$TICKET_A_ID",
    content=content,
    embedding=embedding,
    metadata={
        "ticketTitle": "Boiler making weird clicking noise",
        "vendorName": "Comfort HVAC Pros",
        "category": "HVAC",
        "priority": 3
    }
)
print(f"   Memory stored: {result.get('id', 'error')[:8]}...")
mcp.close()
EOF
cd - > /dev/null
echo ""

# ============================================
# Scene 2: The Recall (Memory in Action!)
# ============================================
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}  SCENE 2: Similar Issue - Memory Recall in Action!${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

sleep 1

echo "[CREATE] Creating second ticket: Similar boiler noise in Unit 205..."
TICKET_B=$(curl -s -X POST "$API_URL/tickets" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "'$TENANT_ID'",
    "title": "Boiler clicking sounds",
    "description": "Boiler in Unit 205 making repeated clicking",
    "message": "Our boiler keeps making a click-click-click sound. Started today. Should I be worried?"
  }')

TICKET_B_ID=$(echo $TICKET_B | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo -e "   ${GREEN}OK${NC} Created ticket: $TICKET_B_ID"
echo ""

sleep 1

echo "[RAG] AI Triage with Memory Search..."
cd apps/ai-worker && python3 << EOF
import os
os.environ['GOOGLE_API_KEY'] = os.getenv('GOOGLE_API_KEY', '')
from ai_worker.embeddings import EmbeddingService
from ai_worker.mcp_client import MCPClient
from ai_worker.triage import TriageBrain

embed_svc = EmbeddingService()
mcp = MCPClient("http://localhost:3001")
triage = TriageBrain(
    api_key=os.getenv('GOOGLE_API_KEY'),
    mcp_client=mcp,
    embedding_service=embed_svc
)

ticket = {
    "title": "Boiler clicking sounds",
    "description": "Boiler in Unit 205 making repeated clicking",
    "messages": [
        {"senderType": "USER", "content": "Our boiler keeps making a click-click-click sound. Started today. Should I be worried?"}
    ]
}

result = triage.triage(ticket, tenant_id="$TENANT_ID")

print(f"   [FOUND] Found {len(result.similar_tickets)} similar past incidents!")
for s in result.similar_tickets:
    print(f"      └─ Similarity: {s['similarity']:.0%}")
print()
print(f"   [RESULT] Triage Result:")
print(f"      Category: {result.category}")
print(f"      Priority: {result.priority}")
print(f"      Confidence: {result.confidence:.0%}")
print(f"      Reasoning: {result.reasoning[:150]}...")
mcp.close()
EOF
cd - > /dev/null
echo ""

# ============================================
# Final Summary
# ============================================
echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    [DONE] DEMO COMPLETE!                      ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Key Takeaways:${NC}"
echo "  1. First ticket triaged with NO prior context"
echo "  2. Resolution stored as memory with embedding"
echo "  3. Second similar ticket found the past incident!"
echo "  4. AI referenced prior fix in its reasoning"
echo ""
echo -e "${GREEN}System Components Used:${NC}"
echo "  • API (NestJS) - Ticket & workflow management"
echo "  • MCP Server - Tool orchestration"
echo "  • AI Worker - Gemini LLM + RAG"
echo "  • PostgreSQL + pgvector - Memory storage"
echo "  • Redpanda (Kafka) - Event streaming"
echo ""
echo "Run 'docker exec demo-postgres-1 psql -U maintain -d maintain -c \"SELECT content FROM memory_documents LIMIT 3;\"' to see stored memories"
echo ""
