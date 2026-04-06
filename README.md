# Photo Forge

인물 사진 대량 선별 자동화 도구 — macOS

Photo Forge는 대규모 인물 촬영 후 쓸 수 있는 사진을 빠르게 솎아내는 도구입니다.  
5종 자동 필터로 문제 컷을 감지하고, 인앱 미리보기에서 직접 승인/제외를 결정하는 워크플로를 제공합니다.

---

## 주요 기능

### 자동 필터

| 필터 | 방식 | 기본 레벨 |
|---|---|---:|
| 눈 감음 `eyes_closed` | MediaPipe FaceMesh EAR | 2 |
| 초점 불량 `out_of_focus` | Laplacian Variance | 2 |
| 모션 블러 `motion_blur` | 고주파 성분 분석 | 1 |
| 노출 불량 `exposure_bad` | 밝기 히스토그램 분석 | 1 |
| 중복컷 `duplicate` | EXIF 버스트 + 해시 유사도 기반 그룹화 | 1 |

각 필터는 **0(끄기) ~ 3(강함)** 레벨로 독립 조절할 수 있습니다.  
강도 조절은 파일 필터링이 아니라 **승인/제외 재판정**에 사용됩니다.

### UI

- **크게보기 / 작게보기** 2모드 토글
- **썸네일 클릭** 시 인앱 미리보기 팝업
- 미리보기에서 이전/다음 탐색, 승인/제외 결정, 좌우 화살표 키 지원
- 중복 그룹 대표컷 배지 표시 및 대표 재지정 가능

---

## 워크플로

Photo Forge는 승인(approve) / 제외(reject) 기반 수동 검토형 워크플로를 사용합니다.  
자동 분석 후 미리보기에서 최종 결정하고 export합니다.

---

## 설치

1. [Releases](../../releases) 페이지에서 `Photo-Forge-0.0.1-arm64.dmg` 다운로드
2. DMG를 열어 `Photo Forge.app`을 `/Applications`으로 드래그
3. 처음 실행 전, 터미널에서 아래 명령어 실행:

```
xattr -cr /Applications/Photo\ Forge.app
```

4. 실행 — Gatekeeper 경고 발생 시 **시스템 설정 → 개인 정보 보호 및 보안**에서 허용

> 미서명 빌드입니다. 위 명령어는 다운로드 격리 속성만 제거하며 앱 자체에는 영향이 없습니다.

---

## 출력 구조

### report 모드
분석 결과 파일만 생성하며 파일 이동/복사 없음.

```
output/
├── result.csv
└── summary.json
```

### copy 모드
원본 유지 + 출력 폴더로 복사.

```
output/
├── Approved/
├── Rejected/
│   ├── eyes_closed/
│   ├── out_of_focus_subject/
│   ├── motion_blur/
│   ├── exposure_bad/
│   ├── duplicate_near/
│   ├── duplicate_exact/
│   └── manual/
├── result.csv
└── summary.json
```

### move 모드
승인본은 원위치 유지, 제외본만 `output/Rejected/*`로 이동.

---

## 중복 처리

- EXIF 촬영시각 + 해시 유사도 기반으로 버스트 그룹 구성
- 그룹 대표컷 1장 유지, 나머지 제외(duplicate_near / duplicate_exact)
- GUI에서 중복 수 / 대표 배지 확인 및 대표 재지정 가능

---

## 베타 대비 변경점 (v0.0.1)

- 정식 v0.0.1 릴리즈
- 목록 보기 제거, 크게보기/작게보기 2모드 토글로 개편
- 인앱 미리보기 도입 (이전/다음, 키보드 지원)
- 용어 "거절" → "제외"로 통일
- 중복 대표 배지 및 대표 재지정 기능 추가

---

## 요구 사양

- macOS 12 이상
- Apple Silicon (M1 / M2 / M3 / M4)
- 별도 Python 설치 불필요

---

## 알려진 제한 사항 (v0.0.1)

- Apple Silicon(arm64) 전용 빌드
- macOS 12 이상 필요
- JPEG 우선 처리 (`.jpg` / `.jpeg`)
- 미서명 빌드 — Gatekeeper 수동 허용 필요
- `mediapipe` 런타임 오류 시 눈 감음 필터가 review 처리로 fallback
