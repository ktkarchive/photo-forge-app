ktk.select 샘플셋 표준 구조

목적
- 베타 전/후 회귀 테스트를 동일 조건으로 반복하기 위한 고정 입력 데이터 구조

디렉토리 규칙
- tests/samplesets/
  - S01_portrait_mixed/
    - input/                  # 원본 입력 (인물/비인물 혼합)
    - expected_baseline/      # 기준 summary.csv/json(버전별)
  - S02_lowlight_blur/
    - input/
    - expected_baseline/
  - S03_duplicates_burst/
    - input/
    - expected_baseline/
  - S04_edge_cases/
    - input/                  # 손상 파일, EXIF 이상, 극단 노출
    - expected_baseline/
  - S05_real_lite/
    - input/                  # macOS 캐시 기반 실이미지 소량(개인사진 미포함)
    - expected_baseline/

각 세트에 포함할 메타 파일
- manifest.json
  - set_id, 목적, 파일 수, 인물 비율, 해상도 분포
- notes.md
  - 수집 출처, 개인정보/저작권 주의사항, 제외 규칙

운영 규칙
- input은 원본 불변(수정 금지)
- expected_baseline은 버전 태그와 함께 누적 보관
- 성능 측정은 같은 하드웨어/같은 옵션으로 기록

권장 실행 예시
- python -m ktk_select.cli run --input tests/samplesets/S01_portrait_mixed/input --output /tmp/ktk_s01 --dry-run
