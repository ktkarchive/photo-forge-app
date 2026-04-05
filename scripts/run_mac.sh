#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: scripts/run_mac.sh <input_dir> <output_dir> [eyes] [focus] [blur] [exposure] [duplicate]"
  exit 1
fi

INPUT_DIR="$1"
OUTPUT_DIR="$2"
EYES="${3:-2}"
FOCUS="${4:-2}"
BLUR="${5:-2}"
EXPOSURE="${6:-2}"
DUPLICATE="${7:-0}"

python3 -m pip install -r requirements.txt
python3 -m photo_culler.cli run \
  --input "$INPUT_DIR" \
  --output "$OUTPUT_DIR" \
  --eyes-level "$EYES" \
  --focus-level "$FOCUS" \
  --blur-level "$BLUR" \
  --exposure-level "$EXPOSURE" \
  --duplicate-level "$DUPLICATE" \
  --ai-mode off

echo "Done. See: $OUTPUT_DIR/result.csv and $OUTPUT_DIR/summary.json"
