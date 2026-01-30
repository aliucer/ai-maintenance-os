import { Controller, Get, Query } from '@nestjs/common';
import { MemoriesService } from './memories.service';

@Controller('memories')
export class MemoriesController {
    constructor(private readonly memoriesService: MemoriesService) { }

    @Get()
    async findAll(
        @Query('tenantId') tenantId: string,
        @Query('limit') limit?: string,
    ) {
        return this.memoriesService.findAll(tenantId, limit ? parseInt(limit) : 10);
    }

    @Get('count')
    async count(@Query('tenantId') tenantId: string) {
        const count = await this.memoriesService.count(tenantId);
        return { count };
    }
}
