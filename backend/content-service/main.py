"""Content Service -- FastAPI application entry point.

This microservice generates YouTube video content using OpenAI, caches
results in Redis, and communicates with the Topic Service via Kafka.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from kafka_service import publish_content_generated, start_consumer, stop_consumer
from models import ContentGeneratedEvent, ContentGenerateRequest, ContentGenerateResponse
from openai_service import generate_content
from redis_service import cache_content, close as close_redis, get_cached_content

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Application lifespan (startup / shutdown)
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown events."""
    logger.info("Content Service starting up")
    await start_consumer()
    yield
    logger.info("Content Service shutting down")
    await stop_consumer()
    await close_redis()


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Content Service",
    description="Microservice that generates YouTube video content using OpenAI",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@app.post("/api/content/generate", response_model=ContentGenerateResponse)
async def generate_content_endpoint(request: ContentGenerateRequest):
    """Synchronous content generation endpoint (fallback).

    Checks the Redis cache first. On a miss, calls OpenAI to generate content,
    caches the result, and publishes a ``content-generated`` event to Kafka.
    """

    topic_id = request.topicId

    # 1. Check cache.
    cached = await get_cached_content(topic_id)
    if cached is not None:
        logger.info("Returning cached content for topicId=%s", topic_id)
        return ContentGenerateResponse(topicId=topic_id, **cached)

    # 2. Generate via OpenAI.
    try:
        generated = await generate_content(
            title=request.title,
            description=request.description,
            tags=request.tags,
        )
    except RuntimeError as exc:
        logger.error("Content generation failed for topicId=%s: %s", topic_id, exc)
        raise HTTPException(status_code=502, detail=str(exc))

    content_dict = {
        "hook": generated.hook,
        "scriptOutline": generated.script_outline,
        "keyPoints": generated.key_points,
        "callToAction": generated.call_to_action,
    }

    # 3. Cache the result.
    await cache_content(topic_id, content_dict)

    # 4. Publish content-generated event to Kafka.
    try:
        event = ContentGeneratedEvent(topicId=topic_id, **content_dict)
        await publish_content_generated(event)
    except Exception as exc:
        logger.warning(
            "Failed to publish content-generated event for topicId=%s: %s",
            topic_id,
            exc,
        )

    return ContentGenerateResponse(topicId=topic_id, **content_dict)
