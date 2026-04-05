ktk.select CLI (MVP)

목표
- 대량 인물 사진에서 품질이 낮은 컷을 자동 분류(keep/reject/review)
- macOS/Windows 공통 Python CLI
- 기본 필터: eyes_closed, out_of_focus_subject
- 옵션 필터: motion_blur, exposure_bad, duplicate

빠른 시작
1) Python 3.10+ 권장
2) 의존성 설치
   pip install -r requirements.txt

실행 예시
- 기본 실행
  python -m photo_culler.cli run --input ./photos --output ./out

- 항목별 강도 (0=off, 1=하, 2=중, 3=상)
  python -m photo_culler.cli run --input ./photos --output ./out \
    --eyes-level 2 --focus-level 2 --blur-level 1 --exposure-level 1 --duplicate-level 0

- 공격적 제외
  python -m photo_culler.cli run --input ./photos --output ./out \
    --eyes-level 3 --focus-level 3 --blur-level 3 --exposure-level 3 --duplicate-level 3

- AI 옵션(Codex auth/API 키)
  python -m photo_culler.cli run --input ./photos --output ./out \
    --ai-mode smart --api-provider codex --ai-model gpt-4.1-mini --max-ai-calls 300

- 파일 이동 없이 리포트만
  python -m photo_culler.cli run --input ./photos --output ./out --dry-run

- 단일 파일 설명
  python -m photo_culler.cli explain --file ./photos/IMG_0001.JPG --eyes-level 2 --focus-level 2

출력물
- output/result.csv
- output/summary.json
- output/keep, output/reject, output/review (dry-run이면 미생성)

config 사용
- config.example.yaml 복사 후 수정
- run 시 --config config.yaml 전달
- config의 rule_levels가 CLI 값보다 우선 적용됨

참고
- eyes_closed는 mediapipe 설치 시 EAR 기반 계산
- mediapipe 미설치 시 eyes_closed는 review 사유로 처리
- AI 재판정은 OPENAI_API_KEY 또는 CODEX_API_KEY가 있으면 동작
