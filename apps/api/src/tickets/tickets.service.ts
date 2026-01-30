import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateTicketDto } from './create-ticket.dto';
import { AssignTicketDto } from './assign-ticket.dto';
import { v4 as uuidv4 } from 'uuid';
import { TicketStatus, SenderType, TaskStatus } from '@prisma/client';

@Injectable()
export class TicketsService {
    constructor(private prisma: PrismaService) { }

    async findAll(tenantId: string) {
        return this.prisma.ticket.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
    }

    async create(dto: CreateTicketDto) {
        const ticketId = dto.id || uuidv4();
        const correlationId = dto.correlationId || uuidv4();
        const messageId = uuidv4();
        const outboxId = uuidv4();
        const auditId = uuidv4();

        // ATOMIC TRANSACTION: Ticket + Message + OutboxEvent + AuditLog
        const result = await this.prisma.$transaction(async (tx) => {
            // 1. Create Ticket
            const ticket = await tx.ticket.create({
                data: {
                    id: ticketId,
                    tenantId: dto.tenantId,
                    correlationId,
                    unitId: dto.unitId,
                    status: TicketStatus.NEW,
                    priority: dto.priority ?? 0,
                    title: dto.title,
                    description: dto.description,
                },
            });

            // 2. Create initial Message
            await tx.message.create({
                data: {
                    id: messageId,
                    tenantId: dto.tenantId,
                    ticketId: ticket.id,
                    senderType: SenderType.USER,
                    content: dto.message,
                },
            });

            // 3. Create OutboxEvent for publishing
            await tx.outboxEvent.create({
                data: {
                    id: outboxId,
                    tenantId: dto.tenantId,
                    correlationId,
                    eventType: 'ticket.created',
                    aggregateId: ticket.id,
                    payload: {
                        ticketId: ticket.id,
                        tenantId: dto.tenantId,
                        correlationId,
                        title: dto.title,
                        description: dto.description,
                        message: dto.message,
                        priority: dto.priority ?? 0,
                        status: TicketStatus.NEW,
                    },
                },
            });

            // 4. Create AuditLog
            await tx.auditLog.create({
                data: {
                    id: auditId,
                    tenantId: dto.tenantId,
                    ticketId: ticket.id,
                    actorId: 'system',
                    action: 'ticket.created',
                    changes: {
                        status: { from: null, to: TicketStatus.NEW },
                    },
                },
            });

            return ticket;
        });

        return {
            id: result.id,
            correlationId: result.correlationId,
            status: result.status,
            createdAt: result.createdAt,
        };
    }

    async findOne(tenantId: string, ticketId: string) {
        const ticket = await this.prisma.ticket.findFirst({
            where: {
                id: ticketId,
                tenantId, // Tenant isolation enforced
            },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' },
                },
                unit: true,
            },
        });

        if (!ticket) {
            throw new NotFoundException(`Ticket ${ticketId} not found`);
        }

        return ticket;
    }

    async getActions(tenantId: string, ticketId: string) {
        // First verify the ticket exists and belongs to tenant
        const ticket = await this.prisma.ticket.findFirst({
            where: {
                id: ticketId,
                tenantId,
            },
        });

        if (!ticket) {
            throw new NotFoundException(`Ticket ${ticketId} not found`);
        }

        // Fetch all proposals for this ticket
        const proposals = await this.prisma.aIActionProposal.findMany({
            where: {
                ticketId,
                tenantId,
            },
            orderBy: { createdAt: 'desc' },
        });

        return {
            ticketId,
            proposals,
        };
    }

    async assign(ticketId: string, dto: AssignTicketDto) {
        // 1. Verify ticket exists and belongs to tenant
        const ticket = await this.prisma.ticket.findFirst({
            where: {
                id: ticketId,
                tenantId: dto.tenantId,
            },
        });

        if (!ticket) {
            throw new NotFoundException(`Ticket ${ticketId} not found`);
        }

        // 2. Validate ticket is in a state that can be assigned (TRIAGED or NEW)
        if (ticket.status !== TicketStatus.TRIAGED && ticket.status !== TicketStatus.NEW) {
            throw new BadRequestException(
                `Ticket status is ${ticket.status}, expected TRIAGED or NEW`
            );
        }

        // 3. Atomic Transaction
        const result = await this.prisma.$transaction(async (tx) => {
            const vendorTaskId = uuidv4();

            // Update ticket → ASSIGNED
            await tx.ticket.update({
                where: { id: ticketId },
                data: { status: TicketStatus.ASSIGNED },
            });

            // Create VendorTask
            const vendorTask = await tx.vendorTask.create({
                data: {
                    id: vendorTaskId,
                    tenantId: dto.tenantId,
                    ticketId: ticketId,
                    vendorName: dto.vendorName,
                    status: TaskStatus.OPEN,
                    description: dto.notes || 'Manually assigned vendor task',
                },
            });

            // Create ticket.assigned outbox event
            await tx.outboxEvent.create({
                data: {
                    id: uuidv4(),
                    tenantId: dto.tenantId,
                    correlationId: ticket.correlationId,
                    eventType: 'ticket.assigned',
                    aggregateId: ticketId,
                    payload: {
                        ticketId: ticketId,
                        tenantId: dto.tenantId,
                        correlationId: ticket.correlationId,
                        vendorName: dto.vendorName,
                        vendorTaskId: vendorTask.id,
                        assignedByUserId: dto.assignedByUserId || 'manager',
                        notes: dto.notes || null,
                    },
                },
            });

            // Create audit log
            await tx.auditLog.create({
                data: {
                    id: uuidv4(),
                    tenantId: dto.tenantId,
                    ticketId: ticketId,
                    actorId: dto.assignedByUserId || 'manager',
                    action: 'ticket.assigned',
                    changes: {
                        previousStatus: ticket.status,
                        newStatus: TicketStatus.ASSIGNED,
                        vendorName: dto.vendorName,
                        vendorTaskId: vendorTask.id,
                    },
                },
            });

            return { vendorTask };
        });

        return {
            ticketId,
            status: TicketStatus.ASSIGNED,
            vendorTaskId: result.vendorTask.id,
            vendorName: dto.vendorName,
        };
    }
}
