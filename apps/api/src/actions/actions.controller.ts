import { Controller, Post, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ActionsService } from './actions.service';
import { ApproveActionDto, RejectActionDto } from './action.dto';

@Controller('actions')
export class ActionsController {
    constructor(private readonly actionsService: ActionsService) { }

    @Post(':id/approve')
    @HttpCode(HttpStatus.OK)
    async approve(
        @Param('id') id: string,
        @Body() dto: ApproveActionDto,
    ) {
        return this.actionsService.approve(id, dto);
    }

    @Post(':id/reject')
    @HttpCode(HttpStatus.OK)
    async reject(
        @Param('id') id: string,
        @Body() dto: RejectActionDto,
    ) {
        return this.actionsService.reject(id, dto);
    }
}
