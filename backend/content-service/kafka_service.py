"""Kafka consumer and producer for the Content Service.

The consumer listens on the ``topic-created`` topic, generates content via
OpenAI (with Redis caching), and publishes a ``content-generated`` event.
"""

import asyncio
import json
import logging
from typing import Optional

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

from config import settings
from models import ContentGeneratedEvent, TopicCreatedEvent
from openai_service import generate_content
from redis_service import cache_content, get_cached_content

logger = logging.getLogger(__name__)

_consumer: Optional[AIOKafkaConsumer] = None
_producer: Optional[AIOKafkaProducer] = None
_consume_task: Optional[asyncio.Task] = None


# ---------------------------------------------------------------------------
# Producer helpers
# ---------------------------------------------------------------------------


async def _get_producer() -> AIOKafkaProducer:
    """Return a started Kafka producer (lazily initialised)."""
    global _producer
    if _producer is None:
        _producer = AIOKafkaProducer(
            bootstrap_servers=settings.kafka_bootstrap_servers,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        )
        await _producer.start()
        logger.info("Kafka producer started")
    return _producer


async def publish_content_generated(event: ContentGeneratedEvent) -> None:
    """Publish a ``content-generated`` event to Kafka.

    Args:
        event: The content-generated event payload.
    """
    producer = await _get_producer()
    payload = event.model_dump()
    await producer.send_and_wait(settings.kafka_content_generated, value=payload)
    logger.info(
        "Published content-generated event for topicId=%s",
        event.topicId,
    )


# ---------------------------------------------------------------------------
# Consumer loop
# ---------------------------------------------------------------------------


async def _handle_message(message_value: bytes) -> None:
    """Process a single message from the ``topic-created`` topic."""
    try:
        raw = json.loads(message_value)
        event = TopicCreatedEvent(**raw)
    except Exception as exc:
        logger.error("Failed to parse topic-created event: %s", exc)
        return

    topic_id = event.topicId
    logger.info("Received topic-created event for topicId=%s", topic_id)

    # 1. Check Redis cache first.
    cached = await get_cached_content(topic_id)
    if cached is not None:
        logger.info("Using cached content for topicId=%s", topic_id)
        content_event = ContentGeneratedEvent(topicId=topic_id, **cached)
        await publish_content_generated(content_event)
        return

    # 2. Cache miss -- generate via OpenAI.
    try:
        generated = await generate_content(
            title=event.title,
            description=event.description,
            tags=event.tags,
        )
    except RuntimeError as exc:
        logger.error(
            "Content generation failed for topicId=%s: %s",
            topic_id,
            exc,
        )
        return

    content_dict = {
        "hook": generated.hook,
        "scriptOutline": generated.script_outline,
        "keyPoints": generated.key_points,
        "callToAction": generated.call_to_action,
    }

    # 3. Cache the result.
    await cache_content(topic_id, content_dict)

    # 4. Publish content-generated event.
    content_event = ContentGeneratedEvent(topicId=topic_id, **content_dict)
    await publish_content_generated(content_event)


async def _consume_loop() -> None:
    """Background loop that consumes messages from the ``topic-created`` topic."""
    global _consumer

    _consumer = AIOKafkaConsumer(
        settings.kafka_topic_created,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        group_id=settings.kafka_consumer_group,
        value_deserializer=lambda v: v,  # keep as bytes; we parse in handler
        auto_offset_reset="earliest",
        enable_auto_commit=True,
    )

    try:
        await _consumer.start()
        logger.info(
            "Kafka consumer started (topic=%s, group=%s)",
            settings.kafka_topic_created,
            settings.kafka_consumer_group,
        )

        async for message in _consumer:
            await _handle_message(message.value)

    except asyncio.CancelledError:
        logger.info("Kafka consumer loop cancelled")
    except Exception as exc:
        logger.error("Kafka consumer error: %s", exc)
    finally:
        if _consumer is not None:
            await _consumer.stop()
            _consumer = None
            logger.info("Kafka consumer stopped")


# ---------------------------------------------------------------------------
# Lifecycle management (called from main.py)
# ---------------------------------------------------------------------------


async def start_consumer() -> None:
    """Start the Kafka consumer as a background asyncio task."""
    global _consume_task
    _consume_task = asyncio.create_task(_consume_loop())
    logger.info("Kafka consumer background task started")


async def stop_consumer() -> None:
    """Cancel the consumer task and shut down the producer."""
    global _consume_task, _producer

    if _consume_task is not None:
        _consume_task.cancel()
        try:
            await _consume_task
        except asyncio.CancelledError:
            pass
        _consume_task = None
        logger.info("Kafka consumer background task stopped")

    if _producer is not None:
        await _producer.stop()
        _producer = None
        logger.info("Kafka producer stopped")
