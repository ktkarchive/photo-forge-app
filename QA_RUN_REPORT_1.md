# Photo Forge QA 1차 실행 리포트 (2026-04-05 19:01:54)

조건: synthetic sampleset, dry-run, eyes=2 focus=2 blur=1 exposure=1 duplicate=1

| Set | Exit | Time(s) | Total | Keep | Reject | Review | Note |
|---|---:|---:|---:|---:|---:|---:|---|
| S01_portrait_mixed | 0 | 1.71 | 16 | 0 | 14 | 2 | OK |
| S02_lowlight_blur | 0 | 1.33 | 16 | 0 | 16 | 0 | OK |
| S03_duplicates_burst | 0 | 1.55 | 20 | 0 | 19 | 1 | OK |
| S04_edge_cases | 0 | 1.06 | 13 | 0 | 11 | 2 | OK |

## 판정
- 기본 분석 파이프라인(건수 집계/CSV/summary 생성) 통과
- synthetic 데이터 기반이므로 정확도 평가는 보류 (실사진 샘플셋 필요)