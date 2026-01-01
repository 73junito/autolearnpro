Multimodal generation helper
===========================

Quick notes for running the multimodal generator in this repository.

Environment variables:
- `MM_OVERRIDE_PROMPT_FILE` : Path to a prompt file to override the base prompt (useful for strict regeneration).
- `MM_GPU_WARMUP_SECONDS` : Seconds to sleep before the first model call to reduce cold-start time (default 0).
- `MM_BASE_TIMEOUT` : Base timeout in seconds for model calls (default 120).
- `MM_AUDIO_WORD_TARGET` : Target minimum audio word count for QA (default 90).
- `MM_MIN_NUMBERED_STEPS` : Minimum numbered steps expected (default 6).
- `MM_MIN_VISUALS` : Minimum visuals expected (default 1).

Typical quick dry-run (no model calls, placeholder content written):
```powershell
python scripts/generate_multimodal_content.py --lessons scripts/tmp_small_lessons.csv --dry-run
```

Run a real generation (staged batches recommended):
```powershell
# example using an override prompt and 60s warmup before the first model
setx MM_OVERRIDE_PROMPT_FILE "scripts/prompts/strict_brake_prompt.txt"
setx MM_GPU_WARMUP_SECONDS 60
python scripts/generate_multimodal_content.py --lessons scripts/data/lessons.csv --models "lms-small,llama3.2:3b"
```

Post-run:
- `scripts/data/multimodal_generation_summary.json` contains per-lesson QA metadata.
- `scripts/data/multimodal_updates.sql` contains SQL updates for lessons with generated content.
- Logs for each model attempt are in `scripts/data/logs/`.

If you'd like, I can: run a small test, wire automatic QA selection hooks, or prepare a branch and commit these changes.
