Photo Forge macOS Beta QA Checklist

목적
- 2026-04-12 베타 배포 전 필수 품질 게이트를 점검한다.

테스트 환경
- macOS Sonoma/Sequoia 최소 2대 (Apple Silicon 1, Intel 1 권장)
- Python 3.10+ 새 가상환경
- 입력 샘플셋: tests/samplesets/*

A. 설치/실행
- [ ] `python3 -m pip install -r requirements.txt` 성공
- [ ] `python3 -m ktk_select.cli --help` 정상 출력
- [ ] `scripts/run_mac.sh` 실행 성공

B. 기본 분석 플로우
- [ ] dry-run 실행 시 output/result.csv, output/summary.json 생성
- [ ] non-dry-run 실행 시 keep/reject/review 폴더 생성
- [ ] summary.total == result.csv 행수

C. 규칙별 동작
- [ ] eyes_closed level=0/1/2/3 변화에 따라 reject/review 비율이 단조 증가 경향
- [ ] focus level=0/1/2/3 변화에 따라 reject/review 비율이 단조 증가 경향
- [ ] blur/exposure/duplicate 각각 on/off 시 결과 차이 확인
- [ ] 사유코드가 CSV에 기록됨(eyes_closed, focus, blur, exposure, duplicate)

D. 예외/안정성
- [ ] 비인물 사진만 있는 폴더에서 크래시 없음
- [ ] 손상 파일 포함 폴더에서 전체 실행 중단 없이 처리 계속
- [ ] mediapipe 오류 시 reason code로 fallback되고 파이프라인은 완료

E. 파일 처리 안전성
- [ ] dry-run에서 원본 파일 변경 없음
- [ ] copy 모드에서 원본 유지 확인
- [ ] move 모드에서 원본->결과 이동 확인
- [ ] 중복 파일명 충돌 시 정책대로 처리(rename/skip/overwrite)

F. 성능
- [ ] 500장 샘플 처리 완료(시간 기록)
- [ ] 2,000장 샘플 처리 완료(시간 기록)
- [ ] 메모리 급증/프로세스 비정상 종료 없음

G. 릴리즈 산출물
- [ ] RC 스크립트로 아티팩트 생성
- [ ] 아티팩트 압축 해제 후 실행 재현
- [ ] 릴리즈 노트의 실행 명령 그대로 동작

Sign-off
- QA 담당:
- 실행 일시:
- 이슈 링크:
- Go/No-Go:
