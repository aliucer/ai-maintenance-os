import { Module } from '@nestjs/common';
import { VendorTasksController } from './vendor-tasks.controller';
import { VendorTasksService } from './vendor-tasks.service';
import { PrismaService } from '../prisma.service';

@Module({
    controllers: [VendorTasksController],
    providers: [VendorTasksService, PrismaService],
})
export class VendorTasksModule { }
