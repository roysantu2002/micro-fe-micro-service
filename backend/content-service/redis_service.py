"""Redis caching layer for generated content."""

import json
import logging
from typing import Optional

import redis.asyncio as redis

from config import settings

logger = logging.getLogger(__name__)

# Module-level connection pool (lazily created).
_pool: Optional[redis.Redis] = None


def _get_client() -> redis.Redis:
    """Return a lazily-initialised async Redis client."""
    global _pool
    if _pool is None:
        _pool = redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            decode_responses=True,
        )
        logger.info(
            "Redis client initialised (host=%s, port=%s)",
            settings.redis_host,
            settings.redis_port,
        )
    return _pool


def _cache_key(topic_id: str) -> str:
    """Build the cache key for a given topic ID."""
    return f"content:{topic_id}"


async def get_cached_content(topic_id: str) -> Optional[dict]:
    """Retrieve cached content for a topic.

    Args:
        topic_id: The UUID of the topic.

    Returns:
        A dict with the cached content fields, or ``None`` on cache miss.
    """
    client = _get_client()
    key = _cache_key(topic_id)

    try:
        raw = await client.get(key)
    except Exception as exc:
        logger.warning("Redis GET failed for key=%s: %s", key, exc)
        return None

    if raw is None:
        logger.debug("Cache miss for key=%s", key)
        return None

    try:
        data = json.loads(raw)
        logger.info("Cache hit for key=%s", key)
        return data
    except json.JSONDecodeError as exc:
        logger.warning("Corrupt cache entry for key=%s: %s", key, exc)
        return None


async def cache_content(topic_id: str, content_dict: dict) -> None:
    """Store generated content in Redis with a TTL.

    Args:
        topic_id: The UUID of the topic.
        content_dict: The content dictionary to cache.
    """
    client = _get_client()
    key = _cache_key(topic_id)

    try:
        serialized = json.dumps(content_dict)
        await client.set(key, serialized, ex=settings.redis_ttl)
        logger.info("Cached content for key=%s (TTL=%ss)", key, settings.redis_ttl)
    except Exception as exc:
        logger.warning("Redis SET failed for key=%s: %s", key, exc)


async def close() -> None:
    """Close the Redis connection pool gracefully."""
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None
        logger.info("Redis connection closed")
