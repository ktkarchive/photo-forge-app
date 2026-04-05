# Photo Forge QA 2차 실행 리포트 (2026-04-05 19:05:54)

조건: dry-run, eyes=2 focus=2 blur=1 exposure=1 duplicate=1

| Set | Exit | Time(s) | Total | Keep | Reject | Review | Note |
|---|---:|---:|---:|---:|---:|---:|---|
| S01_portrait_mixed | 0 | 1.73 | 16 | 0 | 14 | 2 | OK |
| S02_lowlight_blur | 0 | 1.36 | 16 | 0 | 16 | 0 | OK |
| S03_duplicates_burst | 0 | 1.51 | 20 | 0 | 19 | 1 | OK |
| S04_edge_cases | 0 | 1.05 | 13 | 0 | 11 | 2 | OK |
| S05_real_lite | 0 | 1.81 | 6 | 0 | 6 | 0 | OK |

- 판정: 5개 세트 모두 실행 성공 (스모크/회귀 1차 통과)
- 주의: S05_real_lite는 비인물 위주 실이미지이므로 눈감음 정확도 평가는 제한적