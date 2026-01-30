generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// A. Core Hierarchy
// ============================================

model Tenant {
  id        String   @id @default(uuid()) @db.Uuid
  name      String
  createdAt DateTime @default(now()) @map("created_at")

  buildings Building[]
  units     Unit[]
  tickets   Ticket[]
  messages  Message[]

  @@map("tenants")
}

model Building {
  id        String   @id @default(uuid()) @db.Uuid
  tenantId  String   @db.Uuid @map("tenant_id")
  name      String
  address   String
  createdAt DateTime @default(now()) @map("created_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  units  Unit[]

  @@index([tenantId])
  @@map("buildings")
}

model Unit {
  id         String   @id @default(uuid()) @db.Uuid
  tenantId   String   @db.Uuid @map("tenant_id")
  buildingId String   @db.Uuid @map("building_id")
  unitNumber String   @map("unit_number")
  createdAt  DateTime @default(now()) @map("created_at")

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  building Building @relation(fields: [buildingId], references: [id], onDelete: Cascade)
  tickets  Ticket[]

  @@index([tenantId])
  @@index([buildingId])
  @@map("units")
}

// ============================================
// B. The Ticket System
// ============================================

enum TicketStatus {
  NEW
  TRIAGED
  ASSIGNED
  RESOLVED
  CLOSED
}

enum SenderType {
  USER
  AI
  SYSTEM
}

model Ticket {
  id            String       @id @default(uuid()) @db.Uuid
  tenantId      String       @db.Uuid @map("tenant_id")
  correlationId String       @default(uuid()) @db.Uuid @map("correlation_id")
  unitId        String?      @db.Uuid @map("unit_id")
  status        TicketStatus @default(NEW)
  priority      Int          @default(0)
  title         String
  description   String
  createdAt     DateTime     @default(now()) @map("created_at")

  tenant    Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  unit      Unit?              @relation(fields: [unitId], references: [id])
  messages  Message[]
  proposals AIActionProposal[]
  tasks     VendorTask[]
  audits    AuditLog[]

  @@index([tenantId])
  @@index([tenantId, correlationId])
  @@map("tickets")
}

model Message {
  id         String     @id @default(uuid()) @db.Uuid
  tenantId   String     @db.Uuid @map("tenant_id")
  ticketId   String     @db.Uuid @map("ticket_id")
  senderType SenderType @map("sender_type")
  content    String
  createdAt  DateTime   @default(now()) @map("created_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([ticketId])
  @@map("messages")
}

// ============================================
// C. Reliability & Audit
// ============================================

enum OutboxStatus {
  PENDING
  PUBLISHED
  FAILED
}

model OutboxEvent {
  id            String       @id @default(uuid()) @db.Uuid
  tenantId      String       @db.Uuid @map("tenant_id")
  correlationId String?      @db.Uuid @map("correlation_id")
  status        OutboxStatus @default(PENDING)
  eventType     String       @map("event_type")
  aggregateId   String?      @db.Uuid @map("aggregate_id")
  payload       Json
  attempts      Int          @default(0)
  lastError     String?      @map("last_error")
  createdAt     DateTime     @default(now()) @map("created_at")
  publishedAt   DateTime?    @map("published_at")

  @@index([tenantId])
  @@index([tenantId, status, createdAt])
  @@map("outbox_events")
}

model AuditLog {
  id        String   @id @default(uuid()) @db.Uuid
  tenantId  String   @db.Uuid @map("tenant_id")
  ticketId  String   @db.Uuid @map("ticket_id")
  actorId   String   @map("actor_id")
  action    String
  changes   Json?
  createdAt DateTime @default(now()) @map("created_at")

  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Restrict)

  @@index([tenantId])
  @@index([ticketId])
  @@map("audit_logs")
}

model ProcessedEvent {
  tenantId     String   @db.Uuid @map("tenant_id")
  eventId      String   @db.Uuid @map("event_id")
  consumerName String   @map("consumer_name")
  claimedAt    DateTime @default(now()) @map("claimed_at")
  createdAt    DateTime @default(now()) @map("created_at")

  @@id([eventId, consumerName])
  @@index([tenantId])
  @@map("processed_events")
}

// ============================================
// D. AI Worker & Workflow
// ============================================

enum ProposalStatus {
  PROPOSED
  APPROVED
  REJECTED
  EXECUTED
}

model AIActionProposal {
  id              String         @id @default(uuid()) @db.Uuid
  tenantId        String         @db.Uuid @map("tenant_id")
  ticketId        String         @db.Uuid @map("ticket_id")
  actionType      String         @map("action_type")
  status          ProposalStatus @default(PROPOSED)
  confidence      Float
  reasoning       String
  payload         Json
  rejectionReason String?        @map("rejection_reason")
  createdAt       DateTime       @default(now()) @map("created_at")
  decidedAt       DateTime?      @map("decided_at")
  executedAt      DateTime?      @map("executed_at")

  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([ticketId])
  @@map("ai_action_proposals")
}

enum TaskStatus {
  OPEN
  COMPLETED
}

model VendorTask {
  id          String     @id @default(uuid()) @db.Uuid
  tenantId    String     @db.Uuid @map("tenant_id")
  ticketId    String     @db.Uuid @map("ticket_id")
  vendorName  String     @map("vendor_name")
  status      TaskStatus @default(OPEN)
  description String
  createdAt   DateTime   @default(now()) @map("created_at")

  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([ticketId])
  @@map("vendor_tasks")
}

// ============================================
// E. Memory (Week 4)
// ============================================

model MemoryDocument {
  id            String   @id @default(uuid()) @db.Uuid
  tenantId      String   @db.Uuid @map("tenant_id")
  sourceEventId String   @db.Uuid @map("source_event_id")
  ticketId      String?  @db.Uuid @map("ticket_id")
  content       String
  embedding     Unsupported("vector(3072)")?
  metadata      Json?
  createdAt     DateTime @default(now()) @map("created_at")

  @@unique([tenantId, sourceEventId])
  @@index([tenantId])
  @@map("memory_documents")
}