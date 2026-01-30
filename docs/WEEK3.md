# Week 3: Approval Flow + Vendor Tasks (The Human Loop)

**Goal:** Manager can approve proposals, vendor can complete work.
**Exit Criteria:** Full lifecycle: NEW → TRIAGED → ASSIGNED → RESOLVED with audit trail and proper outbox events.

---

## Day 1: Proposal Approval API
**Focus:** Actioning the proposals from Week 2.

- [x] Implement `POST /actions/:id/approve`:
    - Logic (All lookups scoped by `tenant_id`):
      - 1. Fetch proposal, verify status=`PROPOSED`
      - 2. Atomic Transaction:
        - Update proposal status → `EXECUTED` (and set `executed_at`, `decided_at`)
        - Create `vendor_tasks` (if action=`ASSIGN_VENDOR_TASK`)
        - Update Ticket status (if logic dictates, e.g. `ASSIGNED`)
        - Create `OutboxEvent` (`ticket.assigned`) using `ticket.correlation_id` (store this on Ticket in Week 1/2)
        - Create `AuditLog`
    - Returns updated status
- [x] Implement `POST /actions/:id/reject`:
    - Updates proposal status → `REJECTED` (set `decided_at`)
    - Creates `AuditLog`

## Day 2: Vendor Task Completion
**Focus:** Closing the loop.

- [x] Implement `POST /vendor_tasks/:id/complete`:
    - Logic (Atomic Transaction, scoped by `tenant_id`):
      - 1. Update `vendor_tasks` status → `COMPLETED`
      - 2. Update Ticket status → `RESOLVED`
      - 3. Create `OutboxEvent` (`ticket.resolved`) using `ticket.correlation_id`
      - 4. Create `AuditLog`
- [x] Ensure `outbox_events` created in these handlers are picked up by the Week 1 publisher (should essentially "just work" if using same table/publisher).

## Day 3: State Machine Enforcement
**Focus:** Rules and consistency.

- [x] Review/Refine Ticket State Machine:
    - Ensure `ASSIGN_VENDOR_TASK` approval moves ticket `TRIAGED` → `ASSIGNED`
    - Ensure `APPLY_TRIAGE` auto-execute (from Week 2) moves ticket `NEW` → `TRIAGED` and publishes `ticket.triaged`
- [x] Consistency Check:
    - Verify `Tickets` table has `correlation_id` (added in Week 1/2) and is reused for downstream events.
    - Verify `ticket.assigned` event payload contains `vendor_name` from the proposal payload.

## Day 4: Outbox Event Payloads
**Focus:** Downstream consumption readiness.

- [x] Verify `ticket.triaged` payload:
    - Should contain category, priority, confidence
    - Source: Week 2 auto-exec tool (ensure it writes this outbox event)
- [x] Verify `ticket.assigned` payload:
    - Should contain `vendor_name`, `assigned_by_user_id`
- [x] Verify `ticket.resolved` payload:
    - Should contain `resolution_notes`
- [x] Envelope Verification:
    - Ensure events include: `event_id` (new UUID), `tenant_id`, `correlation_id` (from ticket), `aggregate_id`

## Day 5: Full Loop Verification
**Focus:** The "Happy Path" Demo Run.

- [x] Update `scripts/test-full-loop.sh`:
    - 1. Create Ticket ("Leaky pipe")
    - 2. Worker runs -> Creates `APPLY_TRIAGE` (auto if high conf) + `ASSIGN_VENDOR_TASK` (proposed)
    - 3. Script Query: Fetch proposals for ticket, filter for `ASSIGN_VENDOR_TASK` and status=`PROPOSED`, pick ID.
    - 4. API Call: Approve `ASSIGN_VENDOR_TASK`
    - 5. Verify: Ticket is `ASSIGNED`, Vendor Task created
    - 6. API Call: Complete Vendor Task ("Fixed pipe")
    - 7. Verify: Ticket is `RESOLVED`, `ticket.resolved` event published
- [x] Manual Check:
    - Read audit logs for the ticket
    - Ensure `correlation_id` is same throughout
- [x] **NO GO** if: Any state transition fails or outbox event is missing.

---

## Verification Commands (Cheatsheet)

```bash
# 1. Approve Proposal
curl -X POST http://localhost:3000/actions/{proposal_id}/approve \
  -H "Content-Type: application/json" \
  -d '{ "tenant_id": "t_demo", "decided_by_user_id": "u_manager" }'

# 2. Complete Task
curl -X POST http://localhost:3000/vendor_tasks/{task_id}/complete \
  -H "Content-Type: application/json" \
  -d '{ "tenant_id": "t_demo", "resolution_notes": "Replaced seal" }'

# 3. Check State
curl http://localhost:3000/tickets/{ticket_id}?tenant_id=t_demo
```
