#!/usr/bin/env bash
set -e

# Start local stack with Docker Compose
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not installed or not in PATH"
  exit 1
fi

echo "Starting services via docker-compose..."
docker compose up --build -d

echo "Services started. Backend on http://localhost:4000 (if build succeeded)."

echo "Run 'docker compose logs -f backend' to view backend logs." 
