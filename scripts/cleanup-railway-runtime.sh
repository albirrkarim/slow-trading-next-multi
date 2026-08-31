#!/bin/sh
set -eu

if [ -z "${RAILWAY_ENVIRONMENT:-}" ] && [ -z "${RAILWAY_PROJECT_ID:-}" ] && [ -z "${RAILWAY_SERVICE_ID:-}" ]; then
  echo "Skipping Railway runtime cleanup: no Railway environment variables were detected."
  echo "This protects local checkouts and localhost storage from accidental deletion."
  exit 0
fi

if [ ! -f ".next/standalone/server.js" ]; then
  echo "Refusing to clean runtime files: .next/standalone/server.js was not found." >&2
  echo "Run this only after a successful Next standalone build." >&2
  exit 1
fi

rm -rf .next/cache 2>/dev/null || true

rm -rf \
  docs \
  dist \
  src \
  storage \
  tmp \
  .git \
  .vscode \
  .windsurf \
  README.md \
  tsconfig.json \
  vitest.config.mts \
  .env.example \
  AGENTS.md \
  eslint.config.mjs \
  next.config.ts
