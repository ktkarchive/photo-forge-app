ktk.select macOS GUI (Electron)

실행(개발)
1) cd /Users/teykim/workspace_for_agent/ktk-select/gui
2) npm install
3) npm run dev

DMG 빌드(Unsigned)
1) cd /Users/teykim/workspace_for_agent/ktk-select/gui
2) npm install
3) npm run pack:mac:unsigned
4) 산출물: gui/release/ktk.select-gui-<version>-<arch>.dmg

UI/UX 원칙
- Stitch-guided + IBM Carbon Dark 톤
- 단순 레이아웃(입력/출력/레벨/실행)
- 마우스 동선 최소화
