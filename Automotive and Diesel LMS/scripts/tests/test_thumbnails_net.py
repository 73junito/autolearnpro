import os
import tempfile
from pathlib import Path

import scripts.generate_thumbnails as gen


def test_generate_image_sdwebui_success(monkeypatch, tmp_path):
    # Simulate post_json returning an images array
    called = {}

    def fake_post_json(url, payload, timeout=120, session=None):
        called['url'] = url
        return {'images': ['FAKE_BASE64_IMAGE']}

    monkeypatch.setattr(gen, 'post_json', fake_post_json)

    # Create a dummy model file so generate_image_base64 prefers SD WebUI
    model_file = tmp_path / 'dummy_model.safetensors'
    model_file.write_text('')

    result = gen.generate_image_base64(str(model_file), 'test prompt', 128)
    assert result == 'FAKE_BASE64_IMAGE'
    assert called.get('url') is not None


def test_generate_image_sdwebui_failure_fallback_to_cli(monkeypatch, tmp_path):
    # Simulate post_json raising an exception
    def fake_post_json(url, payload, timeout=120, session=None):
        raise RuntimeError('SD API down')

    monkeypatch.setattr(gen, 'post_json', fake_post_json)

    # Monkeypatch CLI generator to return a known base64 string
    def fake_cli(model, prompt):
        return 'CLI_BASE64'

    monkeypatch.setattr(gen, '_generate_image_cli', fake_cli)

    # Create a dummy model file so generate_image_base64 will attempt SD WebUI
    model_file = tmp_path / 'dummy_model.safetensors'
    model_file.write_text('')

    result = gen.generate_image_base64(str(model_file), 'test prompt', 128)
    assert result == 'CLI_BASE64'
