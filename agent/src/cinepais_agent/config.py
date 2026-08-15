from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    google_api_key: str = ""
    web_api_base_url: str = "http://localhost:3000"
    cors_origin: str = "http://localhost:3000"
    max_output_tokens: int = 1024
    max_input_chars: int = 2000
    session_query_cap: int = 20
    # Global budget of accepted /chat requests per UTC day, sized against the ~USD 2.50 LLM
    # credit: Fase D measured 3.5 Gemini generation calls per /chat, so 40 x 3.5 = 140 calls
    # per counter window. A round 200 would be 700 calls — roughly 10x the entire credit.
    daily_request_cap: int = 40
    agent_model_override: str = ""
    langsmith_tracing: str = ""
    langsmith_api_key: str = ""
    langsmith_project: str = "cinepais-agent"

    @property
    def cors_origins(self) -> list[str]:
        """Allowed CORS origins, parsed from the comma-separated `CORS_ORIGIN` value.

        Vercel gives every preview branch its own domain, so a single-origin allowlist rejects
        every preview deploy. Blank entries are dropped so a trailing comma or a padded value
        (`"a, ,b"`) cannot widen the allowlist with an empty origin.
        """
        return [origin.strip() for origin in self.cors_origin.split(",") if origin.strip()]


settings = Settings()
