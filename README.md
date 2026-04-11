# Photo Forge

대량 인물 사진 선별을 위한 데스크톱 도구입니다.

Photo Forge는 촬영 직후 수백~수천 장의 사진을 빠르게 검토할 수 있게 해주는 선별 워크플로에 집중합니다.
자동 분석으로 1차 후보를 나누고, 사용자는 카드/미리보기 화면에서 승인/제외를 빠르게 확정할 수 있습니다.

## 0.0.4 핵심 변화 (최신)
- **다국어 지원**: 한국어 / 영어 / 일본어 UI 전환 기능 추가
  - 우측 상단 국기 버튼(🇰🇷 🇬🇧 🇯🇵)으로 즉시 전환
  - 시스템 언어 자동 감지 (변경 이력 없을 때)
  - 마지막 선택 언어 유지 (localStorage)
  - 시작 화면, 설정, 미리보기, 분석/리뷰 UI 전반 번역 반영
- **레이아웃 안정화**: 언어 전환 시 헤더/버튼 높이 변동이 줄어들도록 고정 폭/정렬 보정
- **테마/헤더 정리**: 상단 토글/브랜드 영역 배치 개선, 시작 화면 버전 표기 갱신
- **Stitch SDK worker 운영 문서화**: 외부 runtime 기반 UI 실험 경로와 wrapper 스크립트 정리

## 0.0.3 핵심 변화
- **치명적 버그 수정**: 파일 복사/이동이 전혀 안 되던 문제 수정 (BigInt IPC 직렬화 오류)
- **UI 버그 수정**: 중복 썸네일 클릭 시 엉뚱한 사진으로 이동하는 문제 수정
- **UI 버그 수정**: 슬라이더 변경 후 썸네일 배지가 갱신되지 않는 문제 수정
- **초점 검출 수정**: 임계값 재캘리브레이션 (`-18/-12/-8` → `-200/-100/-50`)
- **EXIF orientation**: 세로 사진 썸네일이 가로로 표시되는 버그 수정 (PIL exif_transpose)
- **GPU 가속 활성화**: 렌더링 성능 향상
- **청크 rAF 렌더링**: 대량 사진 UI 블로킹 없이 점진적 표시
- **이벤트 위임**: 카드별 이벤트 → 그리드 단일 위임

## 0.0.2 핵심 변화
- Windows 배포 추가
  - 설치형(NSIS) exe 제공
  - 포터블(Portable) exe 제공
- 내장 Python 런타임 번들
  - mac app 안에 Python 3.11 + 핵심 패키지 포함
  - Windows app 안에 embeddable Python + 핵심 패키지 포함
  - 사용자 PC에 별도 Python을 미리 설치하지 않아도 실행 가능한 방향으로 전환
- 설정 조정 범위 확대
  - 규칙별 강도 0~3 조절
  - config 파일로 세부 threshold/파라미터 미세조절 가능
- mac 배포 유지
  - unsigned DMG 기준으로 계속 제공

## 주요 기능
- 인물 사진 대량 선별용 리뷰 UI
- 크게보기 / 작게보기 토글
- 인앱 미리보기 팝업
- 승인 / 제외 중심의 단순한 검토 흐름
- 중복 그룹 표시 및 대표컷 재지정
- 규칙별 강도 레벨 조절
  - 0 = off
  - 1 = 하
  - 2 = 중
  - 3 = 상

## 자동 판정 항목
- eyes_closed
- out_of_focus_subject
- motion_blur
- exposure_bad
- duplicate
- occlusion
- composition_bad

기본 운영 철학은 “복잡한 옵션 나열”보다 “항목별 강도 레벨”입니다.
사용자는 각 항목을 0~3으로 조절하고, 필요하면 config 파일에서 더 세밀하게 보정합니다.

## 배포 형식
### macOS
- DMG 배포
- 현재 기준: Apple Silicon 대상 unsigned build

### Windows
- 설치형 exe (NSIS)
- 포터블 exe

주의:
- 0.0.2부터 mac/Windows 모두 내장 Python 런타임을 함께 싣는 방향으로 재빌드했습니다.
- unsigned 앱 특성상 OS 보안 경고는 여전히 있을 수 있습니다.
- 실제 산출물 파일명과 해시는 release note 기준으로 확인합니다.

## macOS 설치
1. 릴리즈에서 `Photo-Forge-0.0.3-arm64.dmg` 다운로드
2. DMG를 열어 `Photo Forge.app`을 `/Applications`로 복사
3. 처음 실행 전 터미널에서 아래 명령 실행

```bash
xattr -cr /Applications/Photo\ Forge.app
```

4. Gatekeeper 경고가 뜨면 시스템 설정 → 개인 정보 보호 및 보안에서 허용

## Windows 설치 / 실행
### 설치형
- 릴리즈에서 `Photo-Forge-0.0.3-x64-installer.exe` 다운로드
- 실행 후 설치 경로 선택
- 바탕화면/시작 메뉴 바로가기 생성 가능

### 포터블
- 릴리즈에서 `Photo-Forge-0.0.3-x64-portable.exe` 다운로드
- 원하는 폴더에 두고 바로 실행
- 테스트/파일 교체가 쉬워 초기 배포와 내부 검증에 적합

## 설정 조절
Photo Forge는 두 단계로 설정을 만질 수 있습니다.

### 1) 기본 조절: 규칙별 레벨
각 규칙은 0~3 레벨을 독립적으로 가집니다.
- eyes_closed
- out_of_focus_subject
- motion_blur
- exposure_bad
- duplicate
- occlusion
- composition_bad

### 2) 세부 조절: config 파일
CLI/내부 설정 로직에서 config 파일을 통해 threshold를 미세 조정할 수 있습니다.
예시 개념:
- 눈감음 EAR 임계값
- 초점 delta 기준
- blur variance 최소값
- 과다노출 / 저노출 비율 기준
- duplicate 해밍 거리 기준
- burst window 초 단위

예시:
```yaml
rule_levels:
  eyes_closed: 2
  out_of_focus_subject: 2
  motion_blur: 2
  exposure_bad: 2
  duplicate: 1

rule_level_thresholds:
  motion_blur:
    1: 12
    2: 28
    3: 45
  exposure_bad:
    2:
      over: 0.18
      under: 0.25

thresholds:
  duplicate_hamming_max: 6
```

0.0.3부터 `subject_focus_delta` 기본값이 `-12.0`에서 `-100.0`으로 변경됐습니다.
배경 선명도 계산 방식 개선에 따른 스케일 재조정입니다.
기존 config를 직접 지정해서 쓰던 경우 값을 10배 정도 음수로 늘려주세요.

즉 0.0.2의 핵심은 단순 ON/OFF가 아니라,
“사용자가 실제로 손댈 만한 파라미터를 조정 가능한 구조”를 더 분명히 한 것입니다.

## 출력 구조
### report
분석 결과 파일만 생성합니다.

```text
output/
├── result.csv
└── summary.json
```

### copy
원본은 유지하고 결과만 출력 폴더로 복사합니다.

```text
output/
├── Approved/
├── Rejected/
├── result.csv
└── summary.json
```

### move
승인본은 원위치 유지, 제외본만 출력 폴더로 이동합니다.

## 권장 사용 시나리오
1. 폴더 불러오기
2. 규칙별 강도 조절
3. 자동 분석 실행
4. 카드/미리보기에서 승인/제외 확정
5. copy 또는 move로 결과 출력

## 알려진 상태
- mac 0.0.4 DMG와 Windows 0.0.4 설치형/포터블 바이너리를 함께 제공합니다.
- 내장 Python 번들로 방향을 바꿨지만, 대용량 런타임 포함 때문에 산출물 크기는 커졌습니다.
- unsigned 앱 특성상 OS 보안 경고가 있을 수 있습니다.
- Windows는 설치형(NSIS)과 포터블을 모두 같은 릴리즈 흐름으로 관리합니다.
- Stitch 관련 UI 실험은 MCP가 아니라 외부 runtime 기반 `@google/stitch-sdk` worker 경로를 사용합니다.

## 릴리즈 확인 포인트
릴리즈 시 확인할 것:
- mac DMG 파일명 및 SHA256
- Windows 설치형 exe 파일명 및 SHA256
- Windows 포터블 exe 파일명 및 SHA256
- 주요 변경점 요약

## 프로젝트 방향
- 대량작업 통합툴
- 뷰어 + 셀렉 + 변환 + 톤매칭 확장 가능 구조
- macOS / Windows 크로스 플랫폼 지원
