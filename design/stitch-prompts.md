ktk.select · Stitch Prompt Pack (IBM Carbon Dark)

원칙
- Layout/Color source-of-truth는 Stitch 프로젝트/스크린
- 테마는 IBM Carbon Dark token 기반
- 수동 CSS 변경은 최소화(컴포넌트 치환 수준)

Prompt A (메인 작업화면)
Design a desktop app screen for "ktk.select" using IBM Carbon Design System dark theme.
Use a wide 16:9 macOS window layout.
Left panel: import controls and per-rule exclusion strength sliders (0 off, 1 low, 2 medium, 3 high) for eyes_closed, subject_focus, blur, exposure, duplicate.
Center-right panel: sortable results table with columns filename, decision(keep/reject/review), reasons, score.
Top bar: buttons [Import Folder], [Analyze], [Export].
Bottom status: total, keep, reject, review counts and AI review usage.
Keep typography clean, dense, professional, minimal clutter.

Prompt B (내보내기 설정 모달)
Create a modal dialog for ktk.select export options in IBM Carbon dark theme.
Sections:
1) Export mode: copy / move / metadata-only / hardlink.
2) Folder mapping: keep, reject, review destination paths.
3) Source handling: keep original / remove classified from source / remove reject only / move all processed to archive.
4) Safety: dry-run, conflict policy(rename/overwrite/skip), rollback manifest generation.
Primary CTA: "Export" secondary: "Save preset".

Prompt C (초보자 온보딩)
Create a 3-step onboarding wizard for ktk.select (Carbon dark):
Step1 import, Step2 set rule strengths, Step3 export mode.
Use concise Korean labels and helper text for beginners.
