# Photo Forge QA 튜닝 리포트 3차

범위: S01~S05, dry-run, 프로파일 3종 비교

## 프로파일별 총괄
| Profile | Total | Reject | Review | Reject ratio | Review ratio | OK sets |
|---|---:|---:|---:|---:|---:|---:|
| conservative | 71 | 43 | 28 | 0.6056 | 0.3944 | 5 |
| balanced | 71 | 66 | 5 | 0.9296 | 0.0704 | 5 |
| aggressive | 71 | 66 | 5 | 0.9296 | 0.0704 | 5 |

## 권장
- 베타 기본값: balanced (eyes=2, focus=2, blur=1, exposure=1, duplicate=1)
- 이유: 현재 S01~S05 샘플에서는 balanced/aggressive 결과가 동일하게 나왔고, UX 관점에서 기본값은 balanced가 설명/조정이 용이함
- 주의: 실인물 데이터셋 추가 시 balanced/aggressive 차이가 커질 수 있으므로 재측정 필요

세부 결과 JSON: QA_TUNING_SWEEP_3.json