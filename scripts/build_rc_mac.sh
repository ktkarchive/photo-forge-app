#!/usr/bin/env bash
set -euo pipefail

# Photo Forge macOS RC artifact builder (CLI first)
# Usage: scripts/build_rc_mac.sh [version]

VERSION="${1:-0.1.0-rc1}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/release"
STAGE_DIR="$OUT_DIR/photo-forge-$VERSION-macos"
VENV_DIR="$ROOT_DIR/.venv_rc"

mkdir -p "$OUT_DIR"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"
python -m pip install --upgrade pip
python -m pip install -r "$ROOT_DIR/requirements.txt"

# sanity
python -m ktk_select.cli --help >/dev/null

cp "$ROOT_DIR/README.txt" "$STAGE_DIR/README.txt"
cp "$ROOT_DIR/config.example.yaml" "$STAGE_DIR/config.example.yaml"
cp -R "$ROOT_DIR/scripts" "$STAGE_DIR/scripts"

cat > "$STAGE_DIR/run.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
python3 -m ktk_select.cli "$@"
EOF
chmod +x "$STAGE_DIR/run.sh"

ARCHIVE="$OUT_DIR/photo-forge-$VERSION-macos.tar.gz"
tar -czf "$ARCHIVE" -C "$OUT_DIR" "photo-forge-$VERSION-macos"

cat > "$OUT_DIR/photo-forge-$VERSION-SHA256.txt" <<EOF
$(shasum -a 256 "$ARCHIVE")
EOF

echo "RC build done"
echo "archive: $ARCHIVE"
echo "checksum: $OUT_DIR/photo-forge-$VERSION-SHA256.txt"
