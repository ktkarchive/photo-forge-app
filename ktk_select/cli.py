from __future__ import annotations

import argparse
import csv
import json
import shutil
from dataclasses import asdict
from pathlib import Path
from typing import Dict, List

from .config import (
    AIConfig,
    DEFAULT_RULE_LEVELS,
    build_profile_from_rule_levels,
    load_config_file,
    merge_config_overrides,
)

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


def _iter_images(input_dir: Path):
    for p in input_dir.rglob("*"):
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS:
            yield p


def _load_image(path: Path):
    try:
        import cv2
        import numpy as np
    except Exception as e:  # pragma: no cover
        raise RuntimeError("opencv-python, numpy 설치가 필요합니다: pip install -r requirements.txt") from e

    img = cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)
    return img


REJECT_REASON_PRIORITY = [
    ("eyes_closed", "눈감"),
    ("out_of_focus_subject", "초점"),
    ("focus_unavailable", "초점"),
    ("motion_blur", "블러"),
    ("exposure_bad", "노출"),
    ("duplicate_exact:", "중복"),
    ("duplicate:", "중복"),
]


def _ensure_dirs(output_dir: Path):
    (output_dir / "keep").mkdir(parents=True, exist_ok=True)
    (output_dir / "reject").mkdir(parents=True, exist_ok=True)
    (output_dir / "review").mkdir(parents=True, exist_ok=True)
    for _key, label in REJECT_REASON_PRIORITY:
        (output_dir / "reject" / label).mkdir(parents=True, exist_ok=True)


def _resolve_export_mode(args) -> str:
    # backward compatibility flags take precedence
    if getattr(args, "dry_run", False):
        return "report"
    if getattr(args, "move", False):
        return "move"

    mode = str(getattr(args, "export_mode", "copy") or "copy")
    if mode not in {"report", "copy", "move"}:
        return "copy"
    return mode


def _reject_bucket_label(reject_reasons: List[str]) -> str:
    text = ";".join(reject_reasons)
    for key, label in REJECT_REASON_PRIORITY:
        if key in text:
            return label
    return ""


def _resolve_target_path(target: Path, conflict_policy: str) -> Path | None:
    if not target.exists():
        return target
    if conflict_policy == "overwrite":
        return target
    if conflict_policy == "skip":
        return None

    # rename
    stem = target.stem
    suffix = target.suffix
    parent = target.parent
    i = 1
    while True:
        cand = parent / f"{stem}_{i}{suffix}"
        if not cand.exists():
            return cand
        i += 1


def _apply_check(result, reject_reasons: List[str], review_reasons: List[str]):
    if result.available is False:
        if result.reason:
            review_reasons.append(result.reason)
        return
    if result.passed is False and result.reason:
        reject_reasons.append(result.reason)


def _rule_levels_from_args(args) -> Dict[str, int]:
    return {
        "eyes_closed": args.eyes_level,
        "out_of_focus_subject": args.focus_level,
        "motion_blur": args.blur_level,
        "exposure_bad": args.exposure_level,
        "duplicate": args.duplicate_level,
        "occlusion": args.occlusion_level,
        "composition_bad": args.composition_level,
    }


def _quality_penalty(reject_reasons: List[str], rule_levels: Dict[str, int]) -> int:
    penalty = 0
    joined = ";".join(reject_reasons)
    if "eyes_closed" in joined:
        penalty += int(rule_levels.get("eyes_closed", 0))
    if "out_of_focus_subject" in joined:
        penalty += int(rule_levels.get("out_of_focus_subject", 0))
    if "motion_blur" in joined:
        penalty += int(rule_levels.get("motion_blur", 0))
    if "exposure_bad" in joined:
        penalty += int(rule_levels.get("exposure_bad", 0))
    return penalty


def _is_better_representative(candidate: Dict, current: Dict, rule_levels: Dict[str, int]) -> bool:
    # 낮은 penalty 우선, 동점이면 선명도/초점 지표가 더 좋은 컷 우선
    cand_penalty = _quality_penalty(candidate.get("reject_reasons", []), rule_levels)
    cur_penalty = _quality_penalty(current.get("reject_reasons", []), rule_levels)
    if cand_penalty != cur_penalty:
        return cand_penalty < cur_penalty

    cand_scores = candidate.get("scores", {})
    cur_scores = current.get("scores", {})
    cand_blur = float(cand_scores.get("laplacian_var", 0.0))
    cur_blur = float(cur_scores.get("laplacian_var", 0.0))
    if cand_blur != cur_blur:
        return cand_blur > cur_blur

    cand_focus = float(cand_scores.get("focus_delta", 0.0))
    cur_focus = float(cur_scores.get("focus_delta", 0.0))
    if cand_focus != cur_focus:
        return cand_focus > cur_focus

    return str(candidate.get("file", "")) < str(current.get("file", ""))


def run_command(args):
    input_dir = Path(args.input).expanduser().resolve()
    if not input_dir.exists() or not input_dir.is_dir():
        raise SystemExit(f"입력 폴더를 찾을 수 없습니다: {input_dir}")

    output_dir = Path(args.output).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    conf = load_config_file(args.config)

    rule_levels = _rule_levels_from_args(args)
    rules, thresholds, rule_levels = build_profile_from_rule_levels(rule_levels)
    ai_conf = AIConfig(
        mode=args.ai_mode,
        provider=args.api_provider,
        max_calls_per_run=args.max_ai_calls,
        model=args.ai_model,
    )

    rules, thresholds, ai_conf, rule_levels = merge_config_overrides(
        rules, thresholds, ai_conf, rule_levels, conf
    )

    try:
        from .detectors import (
            compute_ahash,
            detect_exposure,
            detect_eyes_closed_bymesh,
            detect_motion_blur,
            detect_subject_focus,
            hamming_distance64,
        )
    except Exception as e:
        raise SystemExit("opencv-python/mediapipe/numpy 설치 후 다시 실행해 주세요: pip install -r requirements.txt") from e

    export_mode = _resolve_export_mode(args)

    if export_mode == "move" and not getattr(args, "confirm_move", False):
        raise SystemExit("move mode는 안전을 위해 --confirm-move 옵션이 필요합니다.")

    if export_mode != "report":
        _ensure_dirs(output_dir)

    rows = []
    ai_calls_used = 0
    file_conflict_skipped = 0

    items: List[Dict] = []
    images = list(_iter_images(input_dir))
    for p in images:
        image = _load_image(p)
        if image is None:
            items.append(
                {
                    "file": str(p),
                    "reject_reasons": [],
                    "review_reasons": ["load_failed"],
                    "scores": {},
                    "hash": None,
                }
            )
            continue

        reject_reasons: List[str] = []
        review_reasons: List[str] = []
        scores: Dict[str, float] = {}

        if rules.eyes_closed:
            r = detect_eyes_closed_bymesh(image, thresholds.eye_closed_ratio)
            if r.score is not None:
                scores["eyes_ear"] = r.score
            _apply_check(r, reject_reasons, review_reasons)

        if rules.out_of_focus_subject:
            r = detect_subject_focus(image, thresholds.subject_focus_delta)
            if r.score is not None:
                scores["focus_delta"] = r.score
            _apply_check(r, reject_reasons, review_reasons)

        if rules.motion_blur:
            r = detect_motion_blur(image, thresholds.blur_var_min)
            if r.score is not None:
                scores["laplacian_var"] = r.score
            _apply_check(r, reject_reasons, review_reasons)

        if rules.exposure_bad:
            r = detect_exposure(image, thresholds.overexposed_ratio_max, thresholds.underexposed_ratio_max)
            if r.score is not None:
                scores["exposure_score"] = r.score
            _apply_check(r, reject_reasons, review_reasons)

        ah = compute_ahash(image) if rules.duplicate else None
        items.append(
            {
                "file": str(p),
                "reject_reasons": reject_reasons,
                "review_reasons": review_reasons,
                "scores": scores,
                "hash": ah,
            }
        )

    # duplicate는 버스트 그룹 단위로 대표컷(품질 우선) 1장만 남기고 나머지를 reject 처리
    if rules.duplicate:
        groups: List[Dict] = []
        dup_threshold = int(thresholds.duplicate_hamming_max)

        for idx, item in enumerate(items):
            ah = item.get("hash")
            if ah is None:
                continue

            matched = False
            for g in groups:
                rep_idx = g["rep_idx"]
                rep_hash = items[rep_idx].get("hash")
                if rep_hash is None:
                    continue
                hd = hamming_distance64(int(ah), int(rep_hash))
                if hd <= dup_threshold:
                    g["members"].append(idx)
                    matched = True
                    if _is_better_representative(item, items[rep_idx], rule_levels):
                        g["rep_idx"] = idx
                    break

            if not matched:
                groups.append({"rep_idx": idx, "members": [idx]})

        for g in groups:
            members = g["members"]
            if len(members) <= 1:
                continue
            rep_idx = g["rep_idx"]
            rep_name = Path(items[rep_idx]["file"]).name
            rep_hash = items[rep_idx].get("hash")
            for idx in members:
                if idx == rep_idx:
                    continue
                cur_hash = items[idx].get("hash")
                hd = hamming_distance64(int(cur_hash), int(rep_hash)) if (cur_hash is not None and rep_hash is not None) else dup_threshold
                if hd == 0:
                    items[idx]["reject_reasons"].append(f"duplicate_exact:{rep_name}")
                else:
                    items[idx]["reject_reasons"].append(f"duplicate:{rep_name}:hd={hd}")

    for item in items:
        p = Path(item["file"])
        reject_reasons = list(item.get("reject_reasons", []))
        review_reasons = list(item.get("review_reasons", []))
        scores = dict(item.get("scores", {}))

        if reject_reasons:
            klass = "reject"
        elif review_reasons:
            klass = "review"
        else:
            klass = "keep"

        if ai_conf.mode in {"smart", "full"}:
            should_ai = (ai_conf.mode == "full" and klass != "reject") or (ai_conf.mode == "smart" and klass == "review")
            within_budget = ai_conf.max_calls_per_run <= 0 or ai_calls_used < ai_conf.max_calls_per_run
            if should_ai and within_budget:
                try:
                    from .ai_reviewer import ai_review_image

                    ai_decision, ai_reason = ai_review_image(p, model=ai_conf.model)
                    ai_calls_used += 1
                    scores["ai_used"] = 1.0
                    if ai_decision == "reject" and klass != "reject":
                        klass = "reject"
                        reject_reasons.append(ai_reason)
                    elif ai_decision == "keep" and klass == "review":
                        klass = "keep"
                    elif ai_decision == "review":
                        if klass != "reject":
                            klass = "review"
                        review_reasons.append(ai_reason)
                except Exception as e:
                    review_reasons.append(f"ai_error:{e.__class__.__name__}")

        rows.append(
            {
                "file": str(p),
                "class": klass,
                "reject_reasons": ";".join(reject_reasons),
                "review_reasons": ";".join(review_reasons),
                "scores": json.dumps(scores, ensure_ascii=False),
            }
        )

        if export_mode != "report":
            if klass == "reject":
                reject_bucket = _reject_bucket_label(reject_reasons)
                if reject_bucket:
                    target = output_dir / "reject" / reject_bucket / p.name
                else:
                    target = output_dir / "reject" / p.name
            else:
                target = output_dir / klass / p.name
            target.parent.mkdir(parents=True, exist_ok=True)
            resolved_target = _resolve_target_path(target, args.conflict_policy)
            if resolved_target is None:
                file_conflict_skipped += 1
            elif export_mode == "move":
                shutil.move(str(p), str(resolved_target))
            else:
                shutil.copy2(str(p), str(resolved_target))

    result_csv = output_dir / "result.csv"
    with result_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["file", "class", "reject_reasons", "review_reasons", "scores"])
        writer.writeheader()
        writer.writerows(rows)

    summary = {
        "input": str(input_dir),
        "output": str(output_dir),
        "export_mode": export_mode,
        "report_mode": export_mode == "report",
        "rule_levels": rule_levels,
        "total": len(rows),
        "keep": sum(1 for r in rows if r["class"] == "keep"),
        "reject": sum(1 for r in rows if r["class"] == "reject"),
        "review": sum(1 for r in rows if r["class"] == "review"),
        "rules": asdict(rules),
        "thresholds": asdict(thresholds),
        "ai": {
            "mode": ai_conf.mode,
            "provider": ai_conf.provider,
            "model": ai_conf.model,
            "max_ai_calls": ai_conf.max_calls_per_run,
            "ai_calls_used": ai_calls_used,
        },
        "file_conflict_policy": args.conflict_policy,
        "file_conflict_skipped": file_conflict_skipped,
    }
    summary_json = output_dir / "summary.json"
    summary_json.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"완료: total={summary['total']} keep={summary['keep']} reject={summary['reject']} review={summary['review']}")
    print(f"리포트: {result_csv}")
    print(f"요약: {summary_json}")


def explain_command(args):
    p = Path(args.file).expanduser().resolve()
    if not p.exists() or not p.is_file():
        raise SystemExit(f"파일을 찾을 수 없습니다: {p}")

    image = _load_image(p)
    if image is None:
        print(json.dumps({"file": str(p), "error": "load_failed"}, ensure_ascii=False, indent=2))
        return

    try:
        from .detectors import (
            detect_exposure,
            detect_eyes_closed_bymesh,
            detect_motion_blur,
            detect_subject_focus,
        )
    except Exception as e:
        raise SystemExit("opencv-python/mediapipe/numpy 설치 후 다시 실행해 주세요: pip install -r requirements.txt") from e

    conf = load_config_file(args.config)
    rule_levels = _rule_levels_from_args(args)
    rules, thresholds, rule_levels = build_profile_from_rule_levels(rule_levels)
    ai_conf = AIConfig()
    rules, thresholds, _, rule_levels = merge_config_overrides(rules, thresholds, ai_conf, rule_levels, conf)

    out = {
        "file": str(p),
        "rule_levels": rule_levels,
        "rules": asdict(rules),
        "checks": {},
    }

    if rules.eyes_closed:
        r = detect_eyes_closed_bymesh(image, thresholds.eye_closed_ratio)
        out["checks"]["eyes_closed"] = {
            "level": rule_levels["eyes_closed"],
            "available": r.available,
            "score": r.score,
            "passed": r.passed,
            "reason": r.reason,
            "detail": r.detail,
        }

    if rules.out_of_focus_subject:
        r = detect_subject_focus(image, thresholds.subject_focus_delta)
        out["checks"]["out_of_focus_subject"] = {
            "level": rule_levels["out_of_focus_subject"],
            "available": r.available,
            "score": r.score,
            "passed": r.passed,
            "reason": r.reason,
            "detail": r.detail,
        }

    if rules.motion_blur:
        r = detect_motion_blur(image, thresholds.blur_var_min)
        out["checks"]["motion_blur"] = {
            "level": rule_levels["motion_blur"],
            "available": r.available,
            "score": r.score,
            "passed": r.passed,
            "reason": r.reason,
            "detail": r.detail,
        }

    if rules.exposure_bad:
        r = detect_exposure(image, thresholds.overexposed_ratio_max, thresholds.underexposed_ratio_max)
        out["checks"]["exposure_bad"] = {
            "level": rule_levels["exposure_bad"],
            "available": r.available,
            "score": r.score,
            "passed": r.passed,
            "reason": r.reason,
            "detail": r.detail,
        }

    print(json.dumps(out, ensure_ascii=False, indent=2))


def add_rule_level_args(parser):
    parser.add_argument("--eyes-level", type=int, choices=[0, 1, 2, 3], default=DEFAULT_RULE_LEVELS["eyes_closed"], help="눈감음 제외 강도")
    parser.add_argument("--focus-level", type=int, choices=[0, 1, 2, 3], default=DEFAULT_RULE_LEVELS["out_of_focus_subject"], help="피사체 초점 제외 강도")
    parser.add_argument("--blur-level", type=int, choices=[0, 1, 2, 3], default=DEFAULT_RULE_LEVELS["motion_blur"], help="블러 제외 강도")
    parser.add_argument("--exposure-level", type=int, choices=[0, 1, 2, 3], default=DEFAULT_RULE_LEVELS["exposure_bad"], help="노출불량 제외 강도")
    parser.add_argument("--duplicate-level", type=int, choices=[0, 1, 2, 3], default=DEFAULT_RULE_LEVELS["duplicate"], help="중복컷 제외 강도")
    parser.add_argument("--occlusion-level", type=int, choices=[0, 1, 2, 3], default=DEFAULT_RULE_LEVELS["occlusion"], help="가림 제외 강도(예비)")
    parser.add_argument("--composition-level", type=int, choices=[0, 1, 2, 3], default=DEFAULT_RULE_LEVELS["composition_bad"], help="구도 제외 강도(예비)")


def build_parser():
    parser = argparse.ArgumentParser(prog="photo-forge", description="Photo Forge 사진 대량작업 CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="폴더 단위 자동 분류")
    run.add_argument("--input", required=True, help="입력 사진 폴더")
    run.add_argument("--output", required=True, help="출력 폴더")
    add_rule_level_args(run)
    run.add_argument("--config", default="", help="설정 파일(config.yaml)")
    run.add_argument("--export-mode", choices=["report", "copy", "move"], default="copy", help="출력 모드: report(리포트만), copy(복사), move(이동)")
    run.add_argument("--conflict-policy", choices=["rename", "skip", "overwrite"], default="rename", help="동일 파일명 충돌 처리")
    run.add_argument("--confirm-move", action="store_true", help="move 모드 실행 확인")
    run.add_argument("--dry-run", action="store_true", help="[호환] report 모드와 동일")
    run.add_argument("--move", action="store_true", help="[호환] move 모드와 동일")
    run.add_argument("--ai-mode", choices=["off", "smart", "full"], default="off")
    run.add_argument("--api-provider", default="codex")
    run.add_argument("--ai-model", default="gpt-4.1-mini")
    run.add_argument("--max-ai-calls", type=int, default=0)
    run.set_defaults(func=run_command)

    explain = sub.add_parser("explain", help="단일 파일 판정 근거 출력")
    explain.add_argument("--file", required=True, help="이미지 파일 경로")
    add_rule_level_args(explain)
    explain.add_argument("--config", default="", help="설정 파일(config.yaml)")
    explain.set_defaults(func=explain_command)

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
