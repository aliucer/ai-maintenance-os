import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TicketsModule } from './tickets/tickets.module';
import { ActionsModule } from './actions/actions.module';
import { VendorTasksModule } from './vendor-tasks/vendor-tasks.module';
import { MemoriesModule } from './memories/memories.module';
import { AuditModule } from './audit/audit.module';
import { PrismaService } from './prisma.service';
import { KafkaService } from './kafka.service';
import { OutboxPublisherService } from './outbox-publisher.service';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        TicketsModule,
        ActionsModule,
        VendorTasksModule,
        MemoriesModule,
        AuditModule,
    ],
    providers: [PrismaService, KafkaService, OutboxPublisherService],
})
export class AppModule { }
