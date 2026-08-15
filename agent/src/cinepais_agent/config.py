from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    google_api_key: str = ""
    web_api_base_url: str = "http://localhost:3000"
    cors_origin: str = "http://localhost:3000"
    max_output_tokens: int = 1024
    max_input_chars: int = 2000
    session_query_cap: int = 20
    agent_model_override: str = ""
    langsmith_tracing: str = ""
    langsmith_api_key: str = ""
    langsmith_project: str = "cinepais-agent"


settings = Settings()
