# Photo Forge

인물 사진 대량 선별 자동화 도구 — macOS · Windows

Photo Forge는 대규모 인물 촬영 후 쓸 수 있는 사진을 빠르게 솎아내는 도구입니다.  
눈 감음·초점 불량·모션 블러·노출 이상·중복컷을 자동 감지하여 **keep / review / reject** 3단계로 분류합니다.

---

## 주요 기능

| 필터 | 방식 | 기본 레벨 |
|---|---|---:|
| 눈 감음 `eyes_closed` | MediaPipe FaceMesh EAR | 2 |
| 초점 불량 `out_of_focus` | Laplacian Variance | 2 |
| 모션 블러 `motion_blur` | 고주파 성분 분석 | 1 |
| 노출 불량 `exposure_bad` | 밝기 히스토그램 분석 | 1 |
| 중복컷 `duplicate` | EXIF 촬영시각 버스트 그룹 | 1 |

각 필터는 **0(끄기) ~ 3(강함)** 레벨로 독립 조절할 수 있습니다.

---

## 설치

### macOS GUI (권장)

1. [Releases](../../releases) 페이지에서 `Photo-Forge-0.1.0-beta1-arm64.dmg` 다운로드
2. DMG를 열어 `Photo Forge.app`을 Applications 폴더로 드래그
3. 첫 실행 시 Gatekeeper 경고 → **시스템 환경설정 → 보안 및 개인 정보 보호 → "확인 없이 열기"** 선택

> 현재 베타는 미서명 빌드입니다. Gatekeeper 경고가 발생할 수 있습니다.

### CLI (macOS / Windows)

```bash
# Python 3.10+ 필요
pip install -r requirements.txt
python -m ktk_select.cli run --input ./photos --output ./out
```

---

## 빠른 시작

### CLI 기본 실행

```bash
# balanced 기본값으로 실행
python -m ktk_select.cli run --input ./photos --output ./out

# 필터 강도 직접 지정
python -m ktk_select.cli run --input ./photos --output ./out \
  --eyes-level 2 --focus-level 2 --blur-level 1 --exposure-level 1 --duplicate-level 1

# 파일 이동 없이 리포트만 생성
python -m ktk_select.cli run --input ./photos --output ./out --export-mode report

# 단일 파일 분석
python -m ktk_select.cli explain --file ./photos/IMG_0001.JPG --eyes-level 2 --focus-level 2
```

### Export 모드

| 모드 | 설명 |
|---|---|
| `copy` (기본) | 원본 유지 + 출력 폴더에 복사 |
| `move` | 원본을 출력 폴더로 이동 (`--confirm-move` 필요) |
| `report` | 파일 조작 없이 CSV/JSON 리포트만 생성 |

---

## 출력 구조

```
output/
├── keep/              # 선별된 사진
├── review/            # 수동 확인 권장
├── reject/
│   ├── 눈감음/
│   ├── 초점/
│   ├── 블러/
│   ├── 노출/
│   └── 중복/
├── result.csv         # 파일별 전체 판정 결과
└── summary.json       # 집계 통계
```

중복컷은 버스트 그룹에서 대표컷 1장만 keep, 나머지는 reject(중복) 처리합니다.

---

## 설정 파일

`config.example.yaml`을 복사하여 사용합니다.

```yaml
rule_levels:
  eyes: 2
  focus: 2
  blur: 1
  exposure: 1
  duplicate: 1
```

```bash
python -m ktk_select.cli run --input ./photos --output ./out --config config.yaml
```

설정 파일의 `rule_levels`가 CLI 인수보다 우선 적용됩니다.

---

## 요구 사양

### macOS GUI
- macOS 12 이상
- Apple Silicon (M1 / M2 / M3 / M4)
- 별도 Python 설치 불필요

### CLI
- Python 3.10+
- `numpy >= 1.24`, `opencv-python >= 4.8`, `mediapipe >= 0.10`, `pyyaml >= 6.0`, `Pillow >= 10.0`

---

## 알려진 제한 사항 (v0.1.0-beta1)

- Apple Silicon(arm64) 전용 빌드 — Intel Mac(x86_64) 미지원
- 미서명 빌드 — Gatekeeper 수동 허용 필요
- JPEG 파일만 처리 (`.jpg` / `.jpeg`)
- `mediapipe` 미설치 또는 런타임 오류 시 눈 감음 필터가 `review` 처리로 fallback
- AI 재판정(`--ai-mode`) 기능은 별도 API 키 필요 (기본값 off)
