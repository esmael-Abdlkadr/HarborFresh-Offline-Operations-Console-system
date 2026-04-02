#!/usr/bin/env bash
set -e

# HarborFresh Offline Operations Console
# One-command startup — works from any directory

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting HarborFresh..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d --build

echo ""
echo "Waiting for service to be ready..."

for i in {1..30}; do
  if curl -fsS "http://localhost:8120" >/dev/null 2>&1; then
    echo ""
    echo "Service URL : http://localhost:8120"
    exit 0
  fi
  sleep 2
done

echo ""
echo "Service did not become ready in time."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" ps
exit 1
