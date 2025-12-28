import os
import shutil


def pytest_configure(config):
    """Record whether an `ollama` binary is available or the CI exposed `OLLAMA_AVAILABLE`.

    This value is used during collection to skip tests that reference `ollama` when
    it's not present on the runner (prevents FileNotFoundError during test collection).
    """
    available = os.getenv("OLLAMA_AVAILABLE")
    if not available:
        available = shutil.which("ollama")
    config._ollama_available = bool(available)


def pytest_collection_modifyitems(config, items):
    """Skip any collected test whose source file contains the token 'ollama'
    when `ollama` is not available.

    This is a pragmatic, repository-level safety net: it looks for the literal
    string 'ollama' in test files and marks those tests as skipped. Tests that
    are properly marked with a custom marker can be handled separately if desired.
    """
    if getattr(config, "_ollama_available", False):
        return

    skip_reason = "OLLAMA not available on runner — skipping ollama-dependent tests"
    try:
        import pytest
    except Exception:
        return

    for item in list(items):
        try:
            source_path = str(item.fspath)
            with open(source_path, "r", encoding="utf-8") as fh:
                src = fh.read()
            if "ollama" in src:
                item.add_marker(pytest.mark.skip(reason=skip_reason))
        except Exception:
            # Be conservative: if we can't read a file, don't block collection
            continue
