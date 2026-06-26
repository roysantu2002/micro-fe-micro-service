"""OpenAI integration for YouTube content generation."""

import json
import logging
from typing import List, Optional

from openai import AsyncOpenAI, OpenAIError

from config import settings
from models import GeneratedContent
from prompt_template import SYSTEM_MESSAGE, build_prompt

logger = logging.getLogger(__name__)

# Initialise the async OpenAI client once at module level.
_client: Optional[AsyncOpenAI] = None


def _get_client() -> AsyncOpenAI:
    """Return a lazily-initialised AsyncOpenAI client."""
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


async def generate_content(title: str, description: str, tags: List[str]) -> GeneratedContent:
    """Call OpenAI to generate YouTube video content.

    Args:
        title: Video topic title.
        description: Topic description.
        tags: List of tags.

    Returns:
        A ``GeneratedContent`` instance with the four generated fields.

    Raises:
        RuntimeError: If the OpenAI call fails or the response cannot be parsed.
    """

    client = _get_client()
    user_prompt = build_prompt(title, description, tags)

    logger.info("Requesting content generation from OpenAI for title='%s'", title)

    try:
        response = await client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": SYSTEM_MESSAGE},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=2048,
        )
    except OpenAIError as exc:
        logger.error("OpenAI API error: %s", exc)
        raise RuntimeError(f"OpenAI API call failed: {exc}") from exc

    raw_text = response.choices[0].message.content
    if not raw_text:
        logger.error("OpenAI returned an empty response")
        raise RuntimeError("OpenAI returned an empty response")

    logger.debug("OpenAI raw response: %s", raw_text)

    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse OpenAI JSON response: %s", exc)
        raise RuntimeError(f"Failed to parse OpenAI response as JSON: {exc}") from exc

    try:
        content = GeneratedContent(
            hook=data.get("hook", ""),
            script_outline=data.get("script_outline", ""),
            key_points=data.get("key_points", ""),
            call_to_action=data.get("call_to_action", ""),
        )
    except Exception as exc:
        logger.error("Failed to map OpenAI response to GeneratedContent: %s", exc)
        raise RuntimeError(f"Invalid content structure from OpenAI: {exc}") from exc

    logger.info("Content generated successfully for title='%s'", title)
    return content
