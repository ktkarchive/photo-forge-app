# Photo Forge S06 튜닝 리포트

- 대상: S06_user_test
- 샘플 수: 1
- 권장 최소 샘플 수: 20

## 프로파일 결과
| Profile | Keep | Reject | Review | Reject ratio | 주요 사유 Top3 |
|---|---:|---:|---:|---:|---|
| conservative | 0 | 1 | 0 | 1.0000 | motion_blur:1 |
| balanced | 0 | 1 | 0 | 1.0000 | motion_blur:1 |
| aggressive | 0 | 1 | 0 | 1.0000 | motion_blur:1 |

## 판정
- 현재 샘플 수가 부족하여(20장 미만) 프리셋 확정 불가
- 다음 액션: S06 input에 최소 20~50장 추가 후 재실행

세부 JSON: QA_TUNING_S06.json