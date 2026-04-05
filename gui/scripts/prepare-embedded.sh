#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GUI="$(cd "$(dirname "$0")/.." && pwd)"
EMB="$GUI/embedded"

rm -rf "$EMB"
mkdir -p "$EMB"
cp -R "$ROOT/ktk_select" "$EMB/ktk_select"
cp "$ROOT/requirements.txt" "$EMB/requirements.txt"

echo "Embedded sources prepared: $EMB"
