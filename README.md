# Photo Forge

인물 사진 대량 선별 자동화 도구 — macOS

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

1. [Releases](../../releases) 페이지에서 `Photo-Forge-0.1.0-beta1-arm64.dmg` 다운로드
2. DMG를 열어 `Photo Forge.app`을 Applications 폴더로 드래그
3. 처음 실행 전, 터미널에서 아래 명령어 실행:

```
xattr -cr /Applications/Photo\ Forge.app
```

4. 실행

> 현재 베타는 미서명 빌드입니다. 위 명령어는 다운로드 격리 속성만 제거하며 앱 자체에는 영향이 없습니다.

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

## 요구 사양

- macOS 12 이상
- Apple Silicon (M1 / M2 / M3 / M4)
- 별도 Python 설치 불필요

---

## 알려진 제한 사항 (v0.1.0-beta1)

- Apple Silicon(arm64) 전용 빌드 — Intel Mac(x86_64) 미지원
- 미서명 빌드 — Gatekeeper 수동 허용 필요
- JPEG 파일만 처리 (`.jpg` / `.jpeg`)
- `mediapipe` 런타임 오류 시 눈 감음 필터가 `review` 처리로 fallback
