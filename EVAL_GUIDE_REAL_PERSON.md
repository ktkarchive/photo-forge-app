Photo Forge 실인물 평가 가이드 (4차)

목적
- 실인물 샘플에서 분류 품질(keep/reject/review)과 규칙별 성능(eyes/focus/blur/exposure/duplicate)을 정량 평가

1) 예측 결과 생성
- 예시:
  python3 -m ktk_select.cli run \
    --input tests/samplesets/S05_real_lite/input \
    --output /tmp/ktk_eval/S05 \
    --eyes-level 2 --focus-level 2 --blur-level 1 --exposure-level 1 --duplicate-level 1 \
    --dry-run

2) GT 템플릿 생성
- 예시:
  python3 tests/eval/make_gt_template.py \
    --pred /tmp/ktk_eval/S05/result.csv \
    --out tests/samplesets/S05_real_lite/ground_truth.template.csv

3) 라벨링 규칙
- gt_class: keep/reject/review 중 1개
- eyes_closed_gt: 1=눈감음(문제), 0=정상, 공란=평가 제외
- focus_subject_gt: 1=피사체 초점 정상, 0=피사체 초점 불량, 공란=평가 제외
- blur_gt/exposure_bad_gt/duplicate_gt: 1=문제 있음, 0=문제 없음, 공란=평가 제외

4) 평가 실행
- 예시:
  python3 tests/eval/evaluate_predictions.py \
    --pred /tmp/ktk_eval/S05/result.csv \
    --gt tests/samplesets/S05_real_lite/ground_truth.labeled.csv \
    --out-json tests/samplesets/S05_real_lite/eval_result.json \
    --out-md tests/samplesets/S05_real_lite/eval_result.md

5) 산출물
- eval_result.json: 기계 판독용
- eval_result.md: 요약 리포트
- 핵심 지표
  - class_accuracy
  - reject(binary) precision/recall/f1
  - rule별 precision/recall/f1

참고
- 현재 S05는 비인물 위주 실이미지 소량이므로 eyes_closed 정확도 해석은 제한적
- 실인물 승인 샘플(S06_real_portrait_approved) 추가 후 동일 절차 반복 권장
