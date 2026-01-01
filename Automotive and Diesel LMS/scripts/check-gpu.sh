#!/usr/bin/env bash
# Cross-platform GPU diagnostic for Ollama + Docker
# Usage: ./scripts/check-gpu.sh
set -euo pipefail

echo "== GPU diagnostic: host =="
if command -v nvidia-smi >/dev/null 2>&1; then
  echo "nvidia-smi output:"
  nvidia-smi || true
else
  echo "nvidia-smi not found on host"
fi

echo "\n== Docker GPU test =="
if command -v docker >/dev/null 2>&1; then
  echo "Running docker nvidia/cuda nvidia-smi (may require --gpus on host)..."
  docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi || echo "docker run nvidia-smi failed"
else
  echo "docker not found"
fi

echo "\n== WSL check (if on Windows) =="
if command -v wsl >/dev/null 2>&1; then
  echo "WSL distros:"
  wsl -l -v || true
  echo "WSL nvidia-smi (try default distro):"
  wsl -- nvidia-smi || echo "wsl nvidia-smi failed"
fi

echo "\n== Ollama status =="
if command -v ollama >/dev/null 2>&1; then
  echo "ollama ps output:" 
  ollama ps || true
  echo "try a quick ollama run (will timeout after 30s):"
  set +e
  timeout 30s ollama run lms-assistant --nowordwrap 2>/tmp/ollama-run.log || true
  set -e
  echo "ollama run log (tail):"
  tail -n 200 /tmp/ollama-run.log || true
else
  echo "ollama CLI not found"
fi

echo "\n== Quick Python check (generate_questions_gpu_v2) =="
python -c "import subprocess,sys; print('ollama path:', subprocess.run(['which','ollama'], capture_output=True, text=True).stdout.strip())" || true

echo "\nDone. Review outputs above. If GPU not detected, install NVIDIA drivers and enable GPU support for Docker/WSL per README."