import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
    constructor(private readonly auditService: AuditService) { }

    @Get()
    async findAll(
        @Query('tenantId') tenantId: string,
        @Query('limit') limit?: string,
    ) {
        return this.auditService.findAll(tenantId, limit ? parseInt(limit) : 20);
    }

    @Get('stats')
    async stats(@Query('tenantId') tenantId: string) {
        return this.auditService.getStats(tenantId);
    }
}
