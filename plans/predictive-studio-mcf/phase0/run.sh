#!/usr/bin/env bash
# Phase-0 experiment runner. Sets the OpenMP path (xgboost/lightgbm on macOS) and
# loads the gitignored LLM key from .env.local if present.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export DYLD_LIBRARY_PATH="/opt/homebrew/opt/libomp/lib:${DYLD_LIBRARY_PATH:-}"
export PYTHONHASHSEED=0
[ -f "$HERE/.env.local" ] && set -a && . "$HERE/.env.local" && set +a
cd "$HERE"
exec .venv/bin/python -m "experiments.$1" "${@:2}"
