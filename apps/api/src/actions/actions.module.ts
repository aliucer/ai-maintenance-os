import { Module } from '@nestjs/common';
import { ActionsController } from './actions.controller';
import { ActionsService } from './actions.service';
import { PrismaService } from '../prisma.service';

@Module({
    controllers: [ActionsController],
    providers: [ActionsService, PrismaService],
})
export class ActionsModule { }
