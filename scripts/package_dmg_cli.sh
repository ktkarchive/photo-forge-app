#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-0.1.0-beta1}"
ARCH="$(uname -m)"
REL_DIR="$ROOT_DIR/release"
STAGE_ROOT="$REL_DIR/stage"
APP_DIR="$STAGE_ROOT/Photo Forge"
PAYLOAD_TGZ="$APP_DIR/photo-forge-src.tar.gz"
DMG_PATH="$REL_DIR/Photo-Forge-${VERSION}-macos-${ARCH}.dmg"

rm -rf "$STAGE_ROOT"
mkdir -p "$APP_DIR"
mkdir -p "$REL_DIR"

# source payload (exclude heavy/dev dirs)
tar \
  --exclude='.git' \
  --exclude='release' \
  --exclude='tests/samplesets/*/input/*' \
  --exclude='.venv*' \
  -czf "$PAYLOAD_TGZ" \
  -C "$ROOT_DIR" .

cat > "$APP_DIR/install.command" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
BASE="$HOME/.photo-forge"
APP="$BASE/app"
VENV="$BASE/venv"
SRC_TGZ="$(cd "$(dirname "$0")" && pwd)/photo-forge-src.tar.gz"

mkdir -p "$BASE"
rm -rf "$APP"
mkdir -p "$APP"

tar -xzf "$SRC_TGZ" -C "$APP"

python3 -m venv "$VENV"
source "$VENV/bin/activate"
python -m pip install --upgrade pip
python -m pip install -r "$APP/requirements.txt"

cat <<MSG
설치 완료:
- 앱 경로: $APP
- 가상환경: $VENV
다음 실행: run.command 더블클릭 또는 아래 명령
$VENV/bin/python -m photo_forge.cli --help
MSG
EOF

cat > "$APP_DIR/run.command" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
BASE="$HOME/.photo-forge"
APP="$BASE/app"
VENV="$BASE/venv"

if [ ! -x "$VENV/bin/python" ]; then
  echo "먼저 install.command를 실행해 주세요."
  exit 1
fi

source "$VENV/bin/activate"
cd "$APP"
python -m photo_forge.cli "$@"
EOF

cat > "$APP_DIR/README.txt" <<EOF
Photo Forge macOS CLI 배포 패키지 (${VERSION})

1) install.command 더블클릭 (최초 1회)
2) run.command 더블클릭 또는 터미널에서 CLI 실행

예시:
python -m photo_forge.cli run --input /path/to/photos --output /path/to/out --dry-run

주의:
- 본 패키지는 CLI 베타입니다.
- 최초 설치 시 인터넷 연결이 필요(pip 의존성 설치).
EOF

chmod +x "$APP_DIR/install.command" "$APP_DIR/run.command"

hdiutil create \
  -volname "Photo Forge" \
  -srcfolder "$STAGE_ROOT" \
  -ov \
  -format UDZO \
  "$DMG_PATH" >/dev/null

echo "$DMG_PATH"
