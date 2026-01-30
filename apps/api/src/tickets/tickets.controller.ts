import { Controller, Post, Get, Body, Param, Headers, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './create-ticket.dto';
import { AssignTicketDto } from './assign-ticket.dto';

@Controller('tickets')
export class TicketsController {
    constructor(private readonly ticketsService: TicketsService) { }

    @Get()
    async findAll(@Query('tenantId') tenantId: string) {
        return this.ticketsService.findAll(tenantId);
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    async create(@Body() dto: CreateTicketDto) {
        return this.ticketsService.create(dto);
    }

    @Get(':id')
    async findOne(
        @Param('id') id: string,
        @Headers('x-tenant-id') tenantId: string,
    ) {
        return this.ticketsService.findOne(tenantId, id);
    }

    @Get(':id/actions')
    async getActions(
        @Param('id') id: string,
        @Headers('x-tenant-id') tenantId: string,
    ) {
        return this.ticketsService.getActions(tenantId, id);
    }

    @Post(':id/assign')
    @HttpCode(HttpStatus.OK)
    async assign(
        @Param('id') id: string,
        @Body() dto: AssignTicketDto,
    ) {
        return this.ticketsService.assign(id, dto);
    }
}
