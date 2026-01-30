import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CompleteTaskDto } from './vendor-task.dto';
import { v4 as uuidv4 } from 'uuid';
import { TicketStatus, TaskStatus } from '@prisma/client';

@Injectable()
export class VendorTasksService {
    constructor(private prisma: PrismaService) { }

    async complete(taskId: string, dto: CompleteTaskDto) {
        // 1. Fetch task with tenant isolation
        const task = await this.prisma.vendorTask.findFirst({
            where: {
                id: taskId,
                tenantId: dto.tenantId,
            },
            include: {
                ticket: true,
            },
        });

        if (!task) {
            throw new NotFoundException(`Vendor task ${taskId} not found`);
        }

        if (task.status === TaskStatus.COMPLETED) {
            throw new BadRequestException(`Task is already completed`);
        }

        // 2. Atomic Transaction
        const result = await this.prisma.$transaction(async (tx) => {
            const now = new Date();

            // Update vendor task → COMPLETED
            const updatedTask = await tx.vendorTask.update({
                where: { id: taskId },
                data: {
                    status: TaskStatus.COMPLETED,
                    description: dto.resolutionNotes
                        ? `${task.description}\n\nResolution: ${dto.resolutionNotes}`
                        : task.description,
                },
            });

            // Update ticket → RESOLVED
            await tx.ticket.update({
                where: { id: task.ticketId },
                data: { status: TicketStatus.RESOLVED },
            });

            // Create ticket.resolved outbox event
            await tx.outboxEvent.create({
                data: {
                    id: uuidv4(),
                    tenantId: dto.tenantId,
                    correlationId: task.ticket.correlationId,
                    eventType: 'ticket.resolved',
                    aggregateId: task.ticketId,
                    payload: {
                        ticketId: task.ticketId,
                        tenantId: dto.tenantId,
                        correlationId: task.ticket.correlationId,
                        vendorTaskId: taskId,
                        vendorName: task.vendorName,
                        resolutionNotes: dto.resolutionNotes || null,
                        resolvedAt: now.toISOString(),
                    },
                },
            });

            // Create audit log
            await tx.auditLog.create({
                data: {
                    id: uuidv4(),
                    tenantId: dto.tenantId,
                    ticketId: task.ticketId,
                    actorId: task.vendorName,
                    action: 'task.completed',
                    changes: {
                        vendorTaskId: taskId,
                        previousStatus: task.status,
                        newStatus: TaskStatus.COMPLETED,
                        ticketStatus: TicketStatus.RESOLVED,
                        resolutionNotes: dto.resolutionNotes || null,
                    },
                },
            });

            return updatedTask;
        });

        return {
            id: result.id,
            status: result.status,
            ticketId: task.ticketId,
            ticketStatus: TicketStatus.RESOLVED,
            vendorName: result.vendorName,
        };
    }

    async findByTicket(tenantId: string, ticketId: string) {
        return this.prisma.vendorTask.findMany({
            where: {
                tenantId,
                ticketId,
            },
            orderBy: { createdAt: 'desc' },
        });
    }
}
