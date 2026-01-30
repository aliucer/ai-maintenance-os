import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(KafkaService.name);
    private kafka: Kafka;
    private producer: Producer;

    async onModuleInit() {
        this.kafka = new Kafka({
            clientId: 'maintain-api',
            brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
        });

        this.producer = this.kafka.producer();

        try {
            await this.producer.connect();
            this.logger.log('Kafka producer connected');
        } catch (error) {
            this.logger.error('Failed to connect to Kafka', error);
        }
    }

    async onModuleDestroy() {
        await this.producer?.disconnect();
    }

    async publish(topic: string, message: { key: string; value: any }) {
        try {
            await this.producer.send({
                topic,
                messages: [
                    {
                        key: message.key,
                        value: JSON.stringify(message.value),
                    },
                ],
            });
            return true;
        } catch (error) {
            this.logger.error(`Failed to publish to ${topic}`, error);
            throw error;
        }
    }
}
