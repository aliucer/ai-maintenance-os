import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class MemoriesService {
    constructor(private prisma: PrismaService) { }

    async findAll(tenantId: string, limit: number = 10) {
        return this.prisma.memoryDocument.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                id: true,
                content: true,
                createdAt: true,
            },
        });
    }

    async count(tenantId: string) {
        return this.prisma.memoryDocument.count({
            where: { tenantId },
        });
    }
}
