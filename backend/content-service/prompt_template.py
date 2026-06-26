"""Prompt template for YouTube content generation via OpenAI."""

from typing import List


def build_prompt(title: str, description: str, tags: List[str]) -> str:
    """Build the system and user prompt for generating YouTube video content.

    Args:
        title: The video topic title.
        description: A short description of the topic.
        tags: A list of relevant tags.

    Returns:
        The fully formatted user prompt string.
    """

    tags_str = ", ".join(tags) if tags else "none"

    return f"""You are an expert YouTube content strategist and scriptwriter.

Given the following video topic details, generate compelling YouTube video content.

**Topic Title:** {title}
**Description:** {description}
**Tags:** {tags_str}

Generate the following in JSON format:

1. **hook** (string): A compelling opening hook for the YouTube video (2-3 sentences).
   It should grab the viewer's attention immediately and make them want to keep watching.

2. **script_outline** (string): A structured script outline broken into clear sections
   (Introduction, Main Content with sub-sections, Conclusion). Use numbered sections and
   bullet points formatted as plain text.

3. **key_points** (string): 5-7 key talking points that the creator must cover in the video.
   Present them as a numbered list in a single string.

4. **call_to_action** (string): A natural, engaging closing call-to-action that encourages
   viewers to like, subscribe, comment, and share. Keep it conversational (2-3 sentences).

Return ONLY valid JSON with the keys: "hook", "script_outline", "key_points", "call_to_action".
Do not include any text outside the JSON object."""


SYSTEM_MESSAGE = (
    "You are a professional YouTube content strategist. "
    "Always respond with valid JSON containing the requested fields."
)
