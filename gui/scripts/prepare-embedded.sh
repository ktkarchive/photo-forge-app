#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GUI="$(cd "$(dirname "$0")/.." && pwd)"
EMB="$GUI/embedded"

rm -rf "$EMB"
mkdir -p "$EMB"
cp -R "$ROOT/photo_forge" "$EMB/photo_forge"
cp "$ROOT/requirements.txt" "$EMB/requirements.txt"

echo "Embedded sources prepared: $EMB"
