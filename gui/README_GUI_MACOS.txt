Photo Forge macOS GUI (Electron)

실행(개발)
1) cd /Users/teykim/workspace_for_agent/photo-forge/gui
2) npm install
3) npm run dev

DMG 빌드(Unsigned)
1) cd /Users/teykim/workspace_for_agent/photo-forge/gui
2) npm install
3) npm run pack:mac:unsigned
4) 산출물: gui/release/Photo-Forge-<version>-<arch>.dmg

UI/UX 원칙
- Stitch-guided + IBM Carbon Dark 톤
- 단순 레이아웃(입력/출력/레벨/실행)
- 마우스 동선 최소화
- 분석 실행 시 report 분석 -> 검토 팝업(Approve/Reject 토글) -> 확인 시 실제 copy/move 적용
- 충돌정책(rename/skip/overwrite), 프리셋 저장, 최근 설정 복원
- Reject 이유 하이라이트: 눈감/초점/블러/노출/중복 (중복 사유는 모두 동시 하이라이트)
- 점수 색상: 0=녹색, 1=노랑, 2=주황, 3=빨강 (완전 동일 중복 duplicate_exact는 중복=3)
- 타협점수(0~15): 누적점수 <= 타협점수면 기본 approve
- 연사(0~3): EXIF 촬영시각 기반 중복 그룹 범위 조절 (0=OFF, 1=0.8s, 2=1.5s, 3=2.5s)
- 검토 생산성: 필터(전체/approve/reject + score>=N), 정렬(점수/파일명), 단축키(↑↓←→/A/R/Q/W/Enter/Esc), 원클릭 approve/reject 빠른보기
