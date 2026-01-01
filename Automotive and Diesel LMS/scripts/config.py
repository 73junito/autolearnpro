"""Centralized configuration and environment validation for scripts.

Provides a simple validate() that ensures required executables and env vars are present
and prints helpful messages. This keeps scripts consistent and fails fast when
prerequisites are missing.
"""
from typing import Optional
import os
import shutil
import sys

# Database env defaults
PGHOST = os.getenv("PGHOST")
PGPORT = os.getenv("PGPORT", "5432")
PGUSER = os.getenv("PGUSER", "postgres")
PGPASSWORD = os.getenv("PGPASSWORD")
PGDATABASE = os.getenv("PGDATABASE", "lms_api_prod")
DIRECT_DB = os.getenv("DIRECT_DB", "").lower() in ("1", "true", "yes") or bool(PGHOST)

# Ollama
OLLAMA_CLI = shutil.which("ollama")

# Stable Diffusion WebUI API
SD_WEBUI_API = os.getenv("SD_WEBUI_API", "http://127.0.0.1:7860")
SD_WEBUI_DEFAULT = os.path.expanduser(r"C:\stable-diffusion-webui\stable-diffusion-webui\models\Stable-diffusion\dreamshaper_8.safetensors")


def _fail(msg: str):
    print(msg)
    sys.exit(1)


def validate(require_db: bool = False, require_ollama: bool = True) -> None:
    """Validate environment and required tools.

    - If require_db or DIRECT_DB is true, ensure PGHOST and PGPASSWORD are set.
    - If require_ollama is true, ensure `ollama` is on PATH.
    Exits the process with an instructive message on failure.
    """
    if (require_db or DIRECT_DB):
        if not PGHOST:
            _fail("Error: DIRECT_DB mode requested but PGHOST is not set. Set PGHOST or unset DIRECT_DB.")
        if not PGPASSWORD and not os.getenv("PGPASSWORD_FILE"):
            # Prefer not to mandate PGPASSWORD if other auth is used, but warn/fail for simplicity
            _fail("Error: DIRECT_DB mode requires PGPASSWORD env var (or set PGPASSWORD_FILE).")

    if require_ollama and not OLLAMA_CLI:
        _fail("Error: 'ollama' CLI not found on PATH. Install Ollama or add it to PATH.")


def ollama_available() -> bool:
    return bool(OLLAMA_CLI)


__all__ = ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "DIRECT_DB", "OLLAMA_CLI", "SD_WEBUI_API", "SD_WEBUI_DEFAULT", "validate", "ollama_available"]
