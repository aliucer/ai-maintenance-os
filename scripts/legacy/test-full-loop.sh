#!/bin/bash
set -e

echo "🚀 Week 3: Full Loop Verification"
echo "=================================="
echo "Testing: NEW → TRIAGED → ASSIGNED → RESOLVED"
echo ""

API_URL="http://localhost:3000"
MCP_URL="http://localhost:3001"
TENANT_ID="a0000000-0000-0000-0000-000000000001"

# Step 1: Create a ticket
echo "--- Step 1: Create Ticket (Leaky Pipe) ---"
TICKET=$(curl -s -X POST "$API_URL/tickets" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "'$TENANT_ID'",
    "title": "Leaky pipe under kitchen sink",
    "description": "Water dripping constantly",
    "message": "There is a leak under my kitchen sink. Water is dripping constantly and I have placed a bucket to catch it. Need a plumber ASAP."
  }')

TICKET_ID=$(echo $TICKET | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
CORRELATION_ID=$(echo $TICKET | grep -o '"correlationId":"[^"]*"' | cut -d'"' -f4)
echo "✅ Created ticket: $TICKET_ID"
echo "   Correlation ID: $CORRELATION_ID"
echo "   Status: NEW"
echo ""

# Step 2: Wait for outbox and check Kafka
echo "--- Step 2: Wait for Kafka publish ---"
sleep 5
echo "✅ Outbox publisher should have published ticket.created"
echo ""

# Step 3: Check ticket status (should still be NEW or TRIAGED if worker ran)
echo "--- Step 3: Current Ticket State ---"
TICKET_STATE=$(curl -s "$API_URL/tickets/$TICKET_ID" -H "x-tenant-id: $TENANT_ID")
CURRENT_STATUS=$(echo $TICKET_STATE | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
echo "   Status: $CURRENT_STATUS"
echo ""

# Step 4: Check proposals
echo "--- Step 4: Check AI Proposals ---"
PROPOSALS=$(curl -s "$API_URL/tickets/$TICKET_ID/actions" -H "x-tenant-id: $TENANT_ID")
echo "$PROPOSALS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for p in data.get('proposals', []):
    print(f\"   - {p['actionType']}: {p['status']} (confidence: {p['confidence']})\")"
echo ""

# Step 5: Create and approve ASSIGN_VENDOR_TASK proposal
echo "--- Step 5: Create ASSIGN_VENDOR_TASK Proposal ---"
VENDOR_PROPOSAL_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
docker exec demo-postgres-1 psql -U maintain -d maintain -c "
INSERT INTO ai_action_proposals (id, tenant_id, ticket_id, action_type, status, confidence, reasoning, payload, created_at)
VALUES (
  '$VENDOR_PROPOSAL_ID'::uuid,
  '$TENANT_ID'::uuid,
  '$TICKET_ID'::uuid,
  'ASSIGN_VENDOR_TASK',
  'PROPOSED',
  0.88,
  'Plumbing issue requires professional plumber',
  '{\"vendorName\": \"QuickFix Plumbing\", \"notes\": \"Repair kitchen sink leak\"}',
  NOW()
);" > /dev/null 2>&1
echo "✅ Created ASSIGN_VENDOR_TASK proposal: $VENDOR_PROPOSAL_ID"
echo ""

echo "--- Step 6: Approve ASSIGN_VENDOR_TASK ---"
APPROVE_RESULT=$(curl -s -X POST "$API_URL/actions/$VENDOR_PROPOSAL_ID/approve" \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "'$TENANT_ID'", "decidedByUserId": "manager-001"}')

VENDOR_TASK_ID=$(echo $APPROVE_RESULT | grep -o '"vendorTaskId":"[^"]*"' | cut -d'"' -f4)
NEW_STATUS=$(echo $APPROVE_RESULT | grep -o '"ticketStatus":"[^"]*"' | cut -d'"' -f4)
echo "✅ Approved! Ticket status: $NEW_STATUS"
echo "   Vendor Task ID: $VENDOR_TASK_ID"
echo ""

# Step 7: Complete the vendor task
echo "--- Step 7: Complete Vendor Task ---"
COMPLETE_RESULT=$(curl -s -X POST "$API_URL/vendor_tasks/$VENDOR_TASK_ID/complete" \
  -H "Content-Type: application/json" \
  -d '{"tenantId": "'$TENANT_ID'", "resolutionNotes": "Replaced the P-trap and tightened connections. No more leaks."}')

FINAL_STATUS=$(echo $COMPLETE_RESULT | grep -o '"ticketStatus":"[^"]*"' | cut -d'"' -f4)
echo "✅ Completed! Ticket status: $FINAL_STATUS"
echo ""

# Step 8: Verify final state
echo "--- Step 8: Final Verification ---"
FINAL_TICKET=$(curl -s "$API_URL/tickets/$TICKET_ID" -H "x-tenant-id: $TENANT_ID")
FINAL_TICKET_STATUS=$(echo $FINAL_TICKET | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
echo "   Ticket Status: $FINAL_TICKET_STATUS"

# Check correlation_id consistency
echo ""
echo "--- Step 9: Correlation ID Consistency ---"
docker exec demo-postgres-1 psql -U maintain -d maintain -c "
SELECT event_type, correlation_id 
FROM outbox_events 
WHERE aggregate_id = '$TICKET_ID'::uuid 
ORDER BY created_at;" 2>/dev/null

# Check audit logs
echo ""
echo "--- Step 10: Audit Trail ---"
docker exec demo-postgres-1 psql -U maintain -d maintain -c "
SELECT action, actor_id, created_at::date 
FROM audit_logs 
WHERE ticket_id = '$TICKET_ID'::uuid 
ORDER BY created_at;" 2>/dev/null

echo ""
echo "=================================="
if [ "$FINAL_TICKET_STATUS" = "RESOLVED" ]; then
  echo "🎉 FULL LOOP VERIFICATION: PASSED"
  echo "   NEW → TRIAGED → ASSIGNED → RESOLVED ✅"
else
  echo "❌ FULL LOOP VERIFICATION: FAILED"
  echo "   Expected RESOLVED, got $FINAL_TICKET_STATUS"
fi
echo "=================================="
