import { Controller, Post, Get, Param, Body, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { VendorTasksService } from './vendor-tasks.service';
import { CompleteTaskDto } from './vendor-task.dto';

@Controller('vendor_tasks')
export class VendorTasksController {
    constructor(private readonly vendorTasksService: VendorTasksService) { }

    @Post(':id/complete')
    @HttpCode(HttpStatus.OK)
    async complete(
        @Param('id') id: string,
        @Body() dto: CompleteTaskDto,
    ) {
        return this.vendorTasksService.complete(id, dto);
    }
}
