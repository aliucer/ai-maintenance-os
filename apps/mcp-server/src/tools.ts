/**
 * Shared Tool Logic for MCP Server
 * Single source of truth for all tool operations.
 * Both MCP Tools and REST endpoints use these functions.
 */

import { PrismaClient, TicketStatus } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================
// Types
// ============================================

export interface ProposalInput {
    action_type: string;
    confidence: number;
    reasoning: string;
    payload: {
        status?: string;
        priority?: number;
        category?: string;
    };
}

export interface ProposalResult {
    id: string;
    status: string;
    autoExecuted: boolean;
}

// ============================================
// Tool Functions
// ============================================

export async function getTicketContext(tenantId: string, ticketId: string) {
    const ticket = await prisma.ticket.findFirst({
        where: { id: ticketId, tenantId },
        include: {
            messages: { orderBy: { createdAt: 'asc' } },
            unit: true,
        },
    });
    return ticket;
}

export async function claimEvent(
    tenantId: string,
    eventId: string,
    consumerName: string
): Promise<{ claimed: boolean }> {
    try {
        await prisma.processedEvent.create({
            data: { tenantId, eventId, consumerName },
        });
        return { claimed: true };
    } catch (error: any) {
        if (error.code === 'P2002') {
            return { claimed: false };
        }
        throw error;
    }
}

export async function createActionProposals(
    tenantId: string,
    ticketId: string,
    correlationId: string,
    proposals: ProposalInput[]
): Promise<{ proposals: ProposalResult[] }> {
    const results: ProposalResult[] = [];

    for (const proposal of proposals) {
        const shouldAutoExecute =
            proposal.action_type === 'APPLY_TRIAGE' && proposal.confidence >= 0.90;

        const result = await prisma.$transaction(async (tx) => {
            const created = await tx.aIActionProposal.create({
                data: {
                    tenantId,
                    ticketId,
                    actionType: proposal.action_type,
                    confidence: proposal.confidence,
                    reasoning: proposal.reasoning,
                    payload: proposal.payload as any,
                    status: shouldAutoExecute ? 'EXECUTED' : 'PROPOSED',
                    executedAt: shouldAutoExecute ? new Date() : null,
                },
            });

            if (shouldAutoExecute) {
                const newStatus = (proposal.payload.status || 'TRIAGED') as TicketStatus;
                const newPriority = proposal.payload.priority;

                await tx.ticket.update({
                    where: { id: ticketId },
                    data: {
                        status: newStatus,
                        ...(newPriority !== undefined && { priority: newPriority }),
                    },
                });

                await tx.outboxEvent.create({
                    data: {
                        tenantId,
                        correlationId,
                        eventType: 'ticket.triaged',
                        aggregateId: ticketId,
                        payload: {
                            ticketId,
                            tenantId,
                            correlationId,
                            proposalId: created.id,
                            actionType: proposal.action_type,
                            category: proposal.payload?.category ?? null,
                            newStatus,
                            newPriority: newPriority ?? null,
                            confidence: proposal.confidence,
                            autoExecuted: true,
                        },
                    },
                });

                await tx.auditLog.create({
                    data: {
                        tenantId,
                        ticketId,
                        actorId: 'ai-worker',
                        action: 'ticket.triaged',
                        changes: {
                            status: { to: newStatus },
                            priority: { to: newPriority ?? null },
                            proposalId: created.id,
                            autoExecuted: true,
                        },
                    },
                });
            }

            return created;
        });

        results.push({
            id: result.id,
            status: result.status,
            autoExecuted: shouldAutoExecute,
        });
    }

    return { proposals: results };
}

export async function storeMemory(
    tenantId: string,
    sourceEventId: string,
    content: string,
    embedding: number[],
    ticketId?: string,
    metadata?: Record<string, any>
): Promise<{ success: boolean; skipped: boolean; id?: string; reason?: string; error?: string }> {
    try {
        const existing = await prisma.memoryDocument.findUnique({
            where: {
                tenantId_sourceEventId: { tenantId, sourceEventId },
            },
        });

        if (existing) {
            return { success: true, skipped: true, reason: 'Already stored', id: existing.id };
        }

        const id = crypto.randomUUID();
        const embeddingStr = `[${embedding.join(',')}]`;

        await prisma.$executeRaw`
            INSERT INTO memory_documents (id, tenant_id, source_event_id, ticket_id, content, embedding, metadata, created_at)
            VALUES (
                ${id}::uuid,
                ${tenantId}::uuid,
                ${sourceEventId}::uuid,
                ${ticketId ? ticketId : null}::uuid,
                ${content},
                ${embeddingStr}::vector,
                ${JSON.stringify(metadata || {})}::jsonb,
                NOW()
            )
        `;

        return { success: true, skipped: false, id };
    } catch (error: any) {
        console.error('storeMemory failed:', error);
        return { success: false, skipped: false, error: error.message };
    }
}

export async function searchMemory(
    tenantId: string,
    queryEmbedding: number[],
    topK: number = 5
): Promise<{ results: Array<{ id: string; content: string; metadata: any; similarity: number }>; error?: string }> {
    try {
        const embeddingStr = `[${queryEmbedding.join(',')}]`;

        const results = await prisma.$queryRaw<Array<{
            id: string;
            content: string;
            metadata: any;
            similarity: number;
        }>>`
            SELECT 
                id,
                content,
                metadata,
                1 - (embedding <=> ${embeddingStr}::vector) as similarity
            FROM memory_documents
            WHERE tenant_id = ${tenantId}::uuid
              AND embedding IS NOT NULL
            ORDER BY embedding <=> ${embeddingStr}::vector
            LIMIT ${topK}
        `;

        return {
            results: results.map(r => ({
                id: r.id,
                content: r.content,
                metadata: r.metadata,
                similarity: r.similarity,
            }))
        };
    } catch (error: any) {
        return { results: [] };
    }
}

export { prisma };
