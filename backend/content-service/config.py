"""Application configuration using pydantic-settings."""

from pathlib import Path

from pydantic_settings import BaseSettings

# Resolve the root .env file (two levels up from this file)
_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):
    """Settings for the Content Service.

    Values are loaded from environment variables or a .env file.
    """

    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_ttl: int = 86400  # 24 hours

    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_consumer_group: str = "content-service"
    kafka_topic_created: str = "topic-created"
    kafka_content_generated: str = "content-generated"

    model_config = {"env_file": str(_ENV_FILE), "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
