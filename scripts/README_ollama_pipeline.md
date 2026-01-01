# Ollama 3-Stage Pipeline

This script runs a 3-stage content pipeline using local Ollama models:

1. qwen3:1.7b — Draft (structure)
2. qwen2-math:1.5b — Validate (logic)
3. mistral:7b — Polish (tone)

Usage:

```powershell
# (ensure a shell with OLLAMA_HOST set if non-default)
python "scripts/ollama_pipeline.py" --topic "Introduction to Automotive Electrical Diagnostics"
```

Notes:
- The script prefers the HTTP API at `$OLLAMA_HOST` (default `http://127.0.0.1:11435`).
- If HTTP fails it will fall back to the `ollama` CLI (path can be overridden with `OLLAMA_EXE`).
- Outputs are saved to `outputs/ollama_pipeline/01_draft.txt`, `02_validated.txt`, `03_polished.txt`.
- Requires Python `requests` package: `pip install requests`.
