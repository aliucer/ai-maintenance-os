import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AuditService {
    constructor(private prisma: PrismaService) { }

    async findAll(tenantId: string, limit: number = 20) {
        return this.prisma.auditLog.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                id: true,
                action: true,
                actorId: true,
                ticketId: true,
                changes: true,
                createdAt: true,
            },
        });
    }

    async getStats(tenantId: string) {
        const [totalActions, aiActions, userActions] = await Promise.all([
            this.prisma.auditLog.count({ where: { tenantId } }),
            this.prisma.auditLog.count({
                where: {
                    tenantId,
                    actorId: { startsWith: 'ai-worker' },
                },
            }),
            this.prisma.auditLog.count({
                where: {
                    tenantId,
                    actorId: { not: { startsWith: 'ai-worker' } },
                },
            }),
        ]);

        return { totalActions, aiActions, userActions };
    }
}
