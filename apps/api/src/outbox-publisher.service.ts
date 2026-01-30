import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from './prisma.service';
import { KafkaService } from './kafka.service';
import { OutboxStatus } from '@prisma/client';

@Injectable()
export class OutboxPublisherService {
    private readonly logger = new Logger(OutboxPublisherService.name);
    private isProcessing = false;

    constructor(
        private prisma: PrismaService,
        private kafka: KafkaService,
    ) { }

    @Interval(5000) // Poll every 5 seconds
    async publishPendingEvents() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            // Fetch pending events with FOR UPDATE SKIP LOCKED pattern
            const events = await this.prisma.$queryRaw<any[]>`
        SELECT id, tenant_id, correlation_id, event_type, aggregate_id, payload, attempts
        FROM outbox_events
        WHERE status = 'PENDING'
        ORDER BY created_at
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      `;

            for (const event of events) {
                try {
                    // Publish to Kafka topic based on event type
                    await this.kafka.publish(event.event_type, {
                        key: event.aggregate_id,
                        value: {
                            eventId: event.id,
                            tenantId: event.tenant_id,
                            correlationId: event.correlation_id,
                            eventType: event.event_type,
                            aggregateId: event.aggregate_id,
                            payload: event.payload,
                            publishedAt: new Date().toISOString(),
                        },
                    });

                    // Mark as PUBLISHED
                    await this.prisma.outboxEvent.update({
                        where: { id: event.id },
                        data: {
                            status: OutboxStatus.PUBLISHED,
                            publishedAt: new Date(),
                        },
                    });

                    this.logger.log(`Published event ${event.id} to ${event.event_type}`);
                } catch (error) {
                    // Increment attempt count and record error
                    await this.prisma.outboxEvent.update({
                        where: { id: event.id },
                        data: {
                            attempts: { increment: 1 },
                            lastError: error.message,
                            status: event.attempts >= 2 ? OutboxStatus.FAILED : OutboxStatus.PENDING,
                        },
                    });

                    this.logger.error(`Failed to publish event ${event.id}`, error.message);
                }
            }
        } catch (error) {
            this.logger.error('Outbox polling error', error);
        } finally {
            this.isProcessing = false;
        }
    }
}
