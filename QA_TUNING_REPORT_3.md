# Photo Forge QA 튜닝 리포트 3차

범위: S01~S06(로컬), dry-run, 프로파일 3종 비교

## 프로파일별 총괄
| Profile | Total | Reject | Review | Reject ratio | Review ratio | OK sets |
|---|---:|---:|---:|---:|---:|---:|
| conservative | 72 | 67 | 5 | 0.9306 | 0.0694 | 6 |
| balanced | 72 | 67 | 5 | 0.9306 | 0.0694 | 6 |
| aggressive | 72 | 67 | 5 | 0.9306 | 0.0694 | 6 |

## 권장
- 베타 기본값: balanced (eyes=2, focus=2, blur=1, exposure=1, duplicate=2)
- 이유: conservative/aggressive와 비교 시 과거절 리스크를 추가 확대하지 않으면서 중복 억제를 유지

세부 결과 JSON: QA_TUNING_SWEEP_3.json