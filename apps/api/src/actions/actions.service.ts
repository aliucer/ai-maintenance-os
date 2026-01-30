import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ApproveActionDto, RejectActionDto } from './action.dto';
import { v4 as uuidv4 } from 'uuid';
import { TicketStatus, ProposalStatus, TaskStatus } from '@prisma/client';

@Injectable()
export class ActionsService {
    constructor(private prisma: PrismaService) { }

    async approve(actionId: string, dto: ApproveActionDto) {
        // 1. Fetch proposal with tenant isolation
        const proposal = await this.prisma.aIActionProposal.findFirst({
            where: {
                id: actionId,
                tenantId: dto.tenantId,
            },
            include: {
                ticket: true,
            },
        });

        if (!proposal) {
            throw new NotFoundException(`Proposal ${actionId} not found`);
        }

        if (proposal.status !== ProposalStatus.PROPOSED) {
            throw new BadRequestException(`Proposal status is ${proposal.status}, expected PROPOSED`);
        }

        // 2. Atomic Transaction
        const result = await this.prisma.$transaction(async (tx) => {
            const now = new Date();

            // Update proposal → EXECUTED
            const updatedProposal = await tx.aIActionProposal.update({
                where: { id: actionId },
                data: {
                    status: ProposalStatus.EXECUTED,
                    decidedAt: now,
                    executedAt: now,
                },
            });

            // Determine new ticket status and create vendor task if needed
            let newTicketStatus = proposal.ticket.status;
            let vendorTask = null;
            const payload = proposal.payload as any;

            if (proposal.actionType === 'APPLY_TRIAGE') {
                // State guard: Only allow triage if ticket is NEW
                if (proposal.ticket.status !== TicketStatus.NEW) {
                    throw new BadRequestException(
                        `Cannot apply triage: ticket status is ${proposal.ticket.status}, expected NEW`
                    );
                }

                // Triage approval: ALWAYS update ticket status to TRIAGED
                newTicketStatus = TicketStatus.TRIAGED;

                await tx.ticket.update({
                    where: { id: proposal.ticketId },
                    data: {
                        status: newTicketStatus,
                        priority: payload?.priority ?? proposal.ticket.priority,
                    },
                });

                // Create ticket.triaged outbox event for approved triage
                await tx.outboxEvent.create({
                    data: {
                        id: uuidv4(),
                        tenantId: dto.tenantId,
                        correlationId: proposal.ticket.correlationId,
                        eventType: 'ticket.triaged',
                        aggregateId: proposal.ticketId,
                        payload: {
                            ticketId: proposal.ticketId,
                            tenantId: dto.tenantId,
                            correlationId: proposal.ticket.correlationId,
                            proposalId: actionId,
                            category: payload?.category ?? null,
                            priority: payload?.priority ?? null,
                            approvedByUserId: dto.decidedByUserId,
                            autoExecuted: false,
                        },
                    },
                });
            } else if (proposal.actionType === 'ASSIGN_VENDOR_TASK') {
                // Vendor assignment: Create vendor task and update status to ASSIGNED
                newTicketStatus = TicketStatus.ASSIGNED;

                await tx.ticket.update({
                    where: { id: proposal.ticketId },
                    data: { status: newTicketStatus },
                });

                vendorTask = await tx.vendorTask.create({
                    data: {
                        id: uuidv4(),
                        tenantId: dto.tenantId,
                        ticketId: proposal.ticketId,
                        vendorName: payload?.vendorName || 'Unassigned',
                        status: TaskStatus.OPEN,  // Use enum instead of string
                        description: payload?.notes || 'Vendor task created from proposal',
                    },
                });

                // Create ticket.assigned outbox event
                await tx.outboxEvent.create({
                    data: {
                        id: uuidv4(),
                        tenantId: dto.tenantId,
                        correlationId: proposal.ticket.correlationId,
                        eventType: 'ticket.assigned',
                        aggregateId: proposal.ticketId,
                        payload: {
                            ticketId: proposal.ticketId,
                            tenantId: dto.tenantId,
                            correlationId: proposal.ticket.correlationId,
                            proposalId: actionId,
                            vendorName: payload?.vendorName || 'Unassigned',
                            vendorTaskId: vendorTask.id,
                            assignedByUserId: dto.decidedByUserId,
                        },
                    },
                });
            }

            // Create audit log
            await tx.auditLog.create({
                data: {
                    id: uuidv4(),
                    tenantId: dto.tenantId,
                    ticketId: proposal.ticketId,
                    actorId: dto.decidedByUserId,
                    action: 'proposal.approved',
                    changes: {
                        proposalId: actionId,
                        actionType: proposal.actionType,
                        previousStatus: proposal.status,
                        newStatus: ProposalStatus.EXECUTED,
                        ticketStatus: newTicketStatus,
                        vendorTaskId: vendorTask?.id || null,
                    },
                },
            });

            return {
                proposal: updatedProposal,
                vendorTask,
                ticketStatus: newTicketStatus,
            };
        });

        return {
            id: result.proposal.id,
            status: result.proposal.status,
            ticketStatus: result.ticketStatus,
            vendorTaskId: result.vendorTask?.id || null,
            executedAt: result.proposal.executedAt,
        };
    }

    async reject(actionId: string, dto: RejectActionDto) {
        // 1. Fetch proposal with tenant isolation
        const proposal = await this.prisma.aIActionProposal.findFirst({
            where: {
                id: actionId,
                tenantId: dto.tenantId,
            },
        });

        if (!proposal) {
            throw new NotFoundException(`Proposal ${actionId} not found`);
        }

        if (proposal.status !== ProposalStatus.PROPOSED) {
            throw new BadRequestException(`Proposal status is ${proposal.status}, expected PROPOSED`);
        }

        // 2. Atomic Transaction
        const result = await this.prisma.$transaction(async (tx) => {
            const now = new Date();

            // Update proposal → REJECTED
            const updatedProposal = await tx.aIActionProposal.update({
                where: { id: actionId },
                data: {
                    status: ProposalStatus.REJECTED,
                    decidedAt: now,
                    rejectionReason: dto.rejectionReason || null,
                },
            });

            // Create audit log
            await tx.auditLog.create({
                data: {
                    id: uuidv4(),
                    tenantId: dto.tenantId,
                    ticketId: proposal.ticketId,
                    actorId: dto.decidedByUserId,
                    action: 'proposal.rejected',
                    changes: {
                        proposalId: actionId,
                        actionType: proposal.actionType,
                        previousStatus: proposal.status,
                        newStatus: ProposalStatus.REJECTED,
                        rejectionReason: dto.rejectionReason || null,
                    },
                },
            });

            return updatedProposal;
        });

        return {
            id: result.id,
            status: result.status,
            decidedAt: result.decidedAt,
            rejectionReason: result.rejectionReason,
        };
    }
}
