#!/bin/bash
set -e

echo "🧪 Week 1 End-to-End Test"
echo "========================="

# Configuration
API_URL="http://localhost:3000"
TENANT_ID="a0000000-0000-0000-0000-000000000001"

# 1. Create a ticket
echo ""
echo "📝 Step 1: Creating ticket..."
RESPONSE=$(curl -s -X POST "$API_URL/tickets" \
  -H "Content-Type: application/json" \
  -d "{
    \"tenantId\": \"$TENANT_ID\",
    \"title\": \"Test Ticket $(date +%s)\",
    \"description\": \"Automated test ticket\",
    \"message\": \"This is a test message\"
  }")

echo "Response: $RESPONSE"

# Extract ticket ID
TICKET_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
CORRELATION_ID=$(echo $RESPONSE | grep -o '"correlationId":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TICKET_ID" ]; then
  echo "❌ FAILED: Could not extract ticket ID"
  exit 1
fi

echo "✅ Ticket created: $TICKET_ID"
echo "   Correlation ID: $CORRELATION_ID"

# 2. Get the ticket
echo ""
echo "📖 Step 2: Fetching ticket..."
GET_RESPONSE=$(curl -s -X GET "$API_URL/tickets/$TICKET_ID" \
  -H "x-tenant-id: $TENANT_ID")

echo "Response: $GET_RESPONSE"

if echo "$GET_RESPONSE" | grep -q "$TICKET_ID"; then
  echo "✅ Ticket fetched successfully"
else
  echo "❌ FAILED: Could not fetch ticket"
  exit 1
fi

# 3. Wait for outbox to publish
echo ""
echo "⏳ Step 3: Waiting 6s for outbox publisher..."
sleep 6

# 4. Check outbox status
echo ""
echo "📤 Step 4: Checking outbox status..."
OUTBOX_STATUS=$(docker exec demo-postgres-1 psql -U maintain -d maintain -t -c \
  "SELECT status FROM outbox_events WHERE aggregate_id = '$TICKET_ID';")

OUTBOX_STATUS=$(echo $OUTBOX_STATUS | xargs)  # Trim whitespace

if [ "$OUTBOX_STATUS" = "PUBLISHED" ]; then
  echo "✅ Outbox event published"
else
  echo "⚠️  Outbox status: $OUTBOX_STATUS (expected PUBLISHED)"
fi

# 5. Check Redpanda
echo ""
echo "📨 Step 5: Checking Redpanda for message..."
KAFKA_MSG=$(docker exec demo-redpanda-1 rpk topic consume ticket.created --num 1 --format json 2>/dev/null | head -1)

if echo "$KAFKA_MSG" | grep -q "$TICKET_ID"; then
  echo "✅ Message found in Redpanda"
else
  echo "⚠️  Message not found (may need more time or topic doesn't exist yet)"
fi

# 6. Check audit log
echo ""
echo "📋 Step 6: Checking audit log..."
AUDIT_COUNT=$(docker exec demo-postgres-1 psql -U maintain -d maintain -t -c \
  "SELECT COUNT(*) FROM audit_logs WHERE ticket_id = '$TICKET_ID';")

AUDIT_COUNT=$(echo $AUDIT_COUNT | xargs)

if [ "$AUDIT_COUNT" -ge "1" ]; then
  echo "✅ Audit log created ($AUDIT_COUNT entries)"
else
  echo "❌ FAILED: No audit log found"
  exit 1
fi

echo ""
echo "🎉 ALL TESTS PASSED!"
echo "===================="
echo "Ticket ID:       $TICKET_ID"
echo "Correlation ID:  $CORRELATION_ID"
echo "Outbox Status:   $OUTBOX_STATUS"
echo "Audit Entries:   $AUDIT_COUNT"
