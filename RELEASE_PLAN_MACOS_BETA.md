Photo Forge macOS 베타 릴리즈 역산 계획 (기준일: 2026-04-05)

목표
- 베타 배포 목표일: 2026-04-12 (일)
- 범위: macOS 우선, Photo Forge 단독 집중

현재 상태 요약
- photo_forge 네임스페이스 전환 완료
- bridge 연동(/photo-forge/run) 동작 확인 완료
- UI 빌드/브리지 재기동/CLI 실행 기본 플로우 확인 완료
- 남은 리스크: eyes_closed(미디어파이프 런타임 변동), 패키징/서명/노타리, 회귀 테스트

D-7 ~ D-6 (4/05~4/06) — 기능 고정 + 안정화 착수
1) 기능 범위 고정 (Beta Scope Freeze)
   - 포함: import/analyze/export, rule level(0~3), dry-run, copy/move, summary/result 출력
   - 제외: 고급 AI 리체크 기본값 off
2) eyes_closed 안정화
   - mediapipe 실패 시 fallback 정책 명시(Review 처리 + reason code)
   - 런타임 에러 재현 케이스 수집/분류
3) 베타 QA 체크리스트 v1 작성

D-5 ~ D-4 (4/07~4/08) — 회귀 테스트 + 패키징 파이프라인
1) 회귀 테스트(샘플셋)
   - 소규모/중규모 폴더, 인물/비인물 혼합, 저조도/흔들림/중복 케이스
   - 결과 일관성(요약수치/CSV 행수/사유코드) 검증
2) macOS 배포 형태 확정
   - 1안: CLI 배포(빠름)
   - 2안: Electron 앱 베타 배포(.dmg)
3) 빌드 스크립트 정리
   - 버전 문자열/출력 경로/아티팩트 명명 규칙 통일

D-3 (4/09) — 릴리즈 후보 RC1
1) RC1 빌드 생성
2) 설치/실행 스모크 테스트(깨끗한 환경)
3) 알려진 이슈 문서화

D-2 (4/10) — 서명/노타리 준비
1) Apple Developer 인증서/권한 점검
2) 서명 스크립트 적용
3) 노타리 제출 리허설

D-1 (4/11) — Go/No-Go
1) 베타 Go/No-Go 회의(체크리스트 통과 기준)
2) 베타 릴리즈 노트 작성
3) 롤백/핫픽스 절차 확인

D-Day (4/12) — 베타 배포
1) 아티팩트 배포 (CLI 또는 DMG)
2) 초기 피드백 수집 채널 오픈
3) 치명 이슈 triage SLA 설정(당일/24h)

베타 품질 게이트 (필수 통과)
- [ ] 실행 크래시 0건(기본 플로우)
- [ ] 샘플셋 3종에서 분석 완료율 100%
- [ ] summary/result 파일 누락 0건
- [ ] dry-run 실제 파일 변형 0건
- [ ] move/copy 동작 검증 통과
- [ ] 오류 사유코드(eyes/focus/blur/exposure/duplicate) 정상 기록

릴리즈 직후 72시간 운영
- 0~24h: 치명 버그 핫픽스 우선
- 24~48h: 정확도 튜닝 파라미터 조정
- 48~72h: 사용자 피드백 기반 v1.0 백로그 확정

즉시 실행할 다음 작업 (오늘) [완료]
1) QA 체크리스트 문서 생성 → QA_CHECKLIST_MACOS_BETA.md
2) 샘플셋 폴더 표준 구조 확정 → tests/samplesets/README.md
3) RC 빌드 명령(스크립트) 고정 → scripts/build_rc_mac.sh
