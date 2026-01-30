"""Kafka consumer for ticket events."""
import json
import logging
from confluent_kafka import Consumer, KafkaError, KafkaException
from typing import Callable, Optional

logger = logging.getLogger(__name__)

class TicketEventConsumer:
    """Consumer for ticket-related Kafka events."""
    
    def __init__(
        self,
        bootstrap_servers: str = "localhost:9092",
        group_id: str = "ai-worker",
        topics: list[str] = None
    ):
        self.topics = topics or ["ticket.created"]
        self.config = {
            "bootstrap.servers": bootstrap_servers,
            "group.id": group_id,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": True,
        }
        self.consumer: Optional[Consumer] = None
        self.running = False
    
    def connect(self):
        """Connect to Kafka."""
        logger.info(f"Connecting to Kafka: {self.config['bootstrap.servers']}")
        self.consumer = Consumer(self.config)
        self.consumer.subscribe(self.topics)
        logger.info(f"Subscribed to topics: {self.topics}")
    
    def consume(self, handler: Callable[[dict], None], poll_timeout: float = 1.0):
        """
        Start consuming messages.
        
        Args:
            handler: Callback function to process each message
            poll_timeout: Timeout for polling in seconds
        """
        if not self.consumer:
            self.connect()
        
        self.running = True
        logger.info("Starting message consumption loop...")
        
        try:
            while self.running:
                msg = self.consumer.poll(timeout=poll_timeout)
                
                if msg is None:
                    continue
                
                if msg.error():
                    if msg.error().code() == KafkaError._PARTITION_EOF:
                        logger.debug(f"Reached end of partition {msg.partition()}")
                        continue
                    else:
                        raise KafkaException(msg.error())
                
                try:
                    # Parse message
                    key = msg.key().decode("utf-8") if msg.key() else None
                    value = json.loads(msg.value().decode("utf-8"))
                    
                    event = {
                        "topic": msg.topic(),
                        "partition": msg.partition(),
                        "offset": msg.offset(),
                        "key": key,
                        "value": value,
                    }
                    
                    logger.info(f"Received event: topic={msg.topic()}, key={key}")
                    
                    # Call handler
                    handler(event)
                    
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse message: {e}")
                except Exception as e:
                    logger.error(f"Error processing message: {e}")
                    
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        finally:
            self.stop()
    
    def stop(self):
        """Stop the consumer."""
        self.running = False
        if self.consumer:
            logger.info("Closing consumer...")
            self.consumer.close()
            self.consumer = None
