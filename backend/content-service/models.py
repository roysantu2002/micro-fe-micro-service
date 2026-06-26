"""Pydantic models for events, requests, and responses."""

from typing import List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Kafka event consumed from the Topic Service
# ---------------------------------------------------------------------------


class TopicCreatedEvent(BaseModel):
    """Payload received on the 'topic-created' Kafka topic."""

    topicId: str = Field(..., description="UUID of the topic")
    title: str = Field(..., description="Title of the YouTube video topic")
    description: str = Field(..., description="Description of the topic")
    tags: List[str] = Field(default_factory=list, description="Tags associated with the topic")


# ---------------------------------------------------------------------------
# REST request / response
# ---------------------------------------------------------------------------


class ContentGenerateRequest(BaseModel):
    """Request body for the synchronous content generation endpoint."""

    topicId: str
    title: str
    description: str
    tags: List[str] = Field(default_factory=list)


class ContentGenerateResponse(BaseModel):
    """Response body containing the generated YouTube content."""

    topicId: str
    hook: str = Field(..., description="Compelling opening hook (2-3 sentences)")
    scriptOutline: str = Field(..., description="Structured script outline with sections")
    keyPoints: str = Field(..., description="5-7 key points to cover")
    callToAction: str = Field(..., description="Closing call-to-action")


# ---------------------------------------------------------------------------
# Kafka event produced
# ---------------------------------------------------------------------------


class ContentGeneratedEvent(BaseModel):
    """Payload published to the 'content-generated' Kafka topic."""

    topicId: str
    hook: str
    scriptOutline: str
    keyPoints: str
    callToAction: str


# ---------------------------------------------------------------------------
# Internal model for the raw OpenAI output
# ---------------------------------------------------------------------------


class GeneratedContent(BaseModel):
    """Parsed content returned by OpenAI."""

    hook: str
    script_outline: str
    key_points: str
    call_to_action: str
