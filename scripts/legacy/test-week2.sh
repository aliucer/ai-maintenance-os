#!/bin/bash
set -e

echo "🚀 Week 2 End-to-End Verification"
echo "=================================="
echo ""

API_URL="http://localhost:3000"
MCP_URL="http://localhost:3001"
TENANT_ID="a0000000-0000-0000-0000-000000000001"

# Check services
echo "--- Step 1: Check Services ---"
echo -n "API Server: "
curl -s "$API_URL/tickets" -H "x-tenant-id: $TENANT_ID" > /dev/null 2>&1 && echo "✅ Running" || echo "❌ Not running"

echo -n "MCP Server: "
curl -s "$MCP_URL/health" | grep -q "ok" && echo "✅ Running" || echo "❌ Not running"

echo -n "Redpanda: "
docker exec demo-redpanda-1 rpk topic list > /dev/null 2>&1 && echo "✅ Running" || echo "❌ Not running"
echo ""

# Create ticket
echo "--- Step 2: Create Emergency Ticket ---"
TICKET=$(curl -s -X POST "$API_URL/tickets" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "'$TENANT_ID'",
    "title": "URGENT: Gas smell in kitchen",
    "description": "Strong gas odor detected, very concerned",
    "message": "I can smell gas coming from my kitchen stove. It started about 30 minutes ago and is getting stronger. Very worried!"
  }')

TICKET_ID=$(echo $TICKET | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Created ticket: $TICKET_ID"
echo "Status: $(echo $TICKET | grep -o '"status":"[^"]*"' | cut -d'"' -f4)"
echo ""

# Wait for outbox + Kafka publish
echo "--- Step 3: Wait for Kafka Publish ---"
echo "Waiting 8 seconds for outbox publisher..."
sleep 8

# Check if message is in Kafka
echo "Checking Kafka topic..."
MSG_COUNT=$(docker exec demo-redpanda-1 rpk topic consume ticket.created --num 1 --format json 2>/dev/null | wc -l)
if [ "$MSG_COUNT" -gt 0 ]; then
  echo "✅ Message found in ticket.created topic"
else
  echo "⚠️  Message may still be processing"
fi
echo ""

# Check proposals before
echo "--- Step 4: Current Proposals ---"
PROPOSALS_BEFORE=$(curl -s "$API_URL/tickets/$TICKET_ID/actions" -H "x-tenant-id: $TENANT_ID")
PROPOSAL_COUNT_BEFORE=$(echo $PROPOSALS_BEFORE | grep -o '"id"' | wc -l | xargs)
echo "Proposals before worker: $PROPOSAL_COUNT_BEFORE"
echo ""

# Note about running worker
echo "--- Step 5: AI Worker Instructions ---"
echo "To complete E2E test, run the AI Worker in a separate terminal:"
echo ""
echo "  cd apps/ai-worker"
echo "  source .venv/bin/activate"
echo "  python -m ai_worker.main"
echo ""
echo "The worker will:"
echo "  1. Consume 'ticket.created' from Kafka"
echo "  2. Claim event (idempotency)"
echo "  3. Get ticket context via MCP"
echo "  4. Triage with Gemini 2.0 Flash"
echo "  5. Create proposal via MCP"
echo "  6. Auto-execute if confidence >= 0.90"
echo ""

# Query final state
echo "--- Step 6: Final Verification ---"
echo "After running worker, check:"
echo ""
echo "  # Get ticket state"
echo "  curl -s $API_URL/tickets/$TICKET_ID -H 'x-tenant-id: $TENANT_ID' | jq"
echo ""
echo "  # Get proposals"
echo "  curl -s $API_URL/tickets/$TICKET_ID/actions -H 'x-tenant-id: $TENANT_ID' | jq"
echo ""
echo "Expected: Ticket status = TRIAGED, Proposal status = EXECUTED (if confidence >= 0.90)"
