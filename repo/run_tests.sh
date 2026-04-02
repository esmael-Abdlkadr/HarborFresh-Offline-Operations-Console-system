#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "========================================"
echo " HarborFresh — Docker test suite"
echo "========================================"

# Keep the workspace clean even on failures.
cleanup() {
  docker compose --profile test down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo ""
echo "=== [1/2] Unit tests · TypeScript check · Lint (Docker) ==="
docker compose --profile test run --rm --build test

echo ""
echo "=== [2/2] Playwright E2E (Docker) ==="
docker compose --profile test run --rm e2e

echo ""
echo "========================================"
echo " All tests passed"
echo "========================================"
