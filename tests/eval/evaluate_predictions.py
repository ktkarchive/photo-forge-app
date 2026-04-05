#!/usr/bin/env python3
import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

CLASSES = ["keep", "review", "reject"]


def parse_reason_flags(reject_reasons: str, review_reasons: str):
    text = f"{reject_reasons};{review_reasons}".lower()
    return {
        "eyes_closed": int("eyes_closed" in text),
        "focus_subject": int(("out_of_focus_subject" not in text) and ("focus_unavailable" not in text)),
        "blur": int("motion_blur" in text),
        "exposure_bad": int("exposure_bad" in text),
        "duplicate": int("duplicate:" in text),
    }


def to_int_or_none(v: str):
    s = str(v or "").strip()
    if s == "":
        return None
    if s in {"0", "1"}:
        return int(s)
    return None


def safe_div(a, b):
    return a / b if b else 0.0


def binary_metrics(tp, fp, fn):
    p = safe_div(tp, tp + fp)
    r = safe_div(tp, tp + fn)
    f1 = safe_div(2 * p * r, p + r)
    return p, r, f1


def main():
    ap = argparse.ArgumentParser(description="Evaluate Photo Forge predictions against ground truth labels")
    ap.add_argument("--pred", required=True, help="result.csv path")
    ap.add_argument("--gt", required=True, help="ground_truth.csv path")
    ap.add_argument("--out-json", default="", help="output json path")
    ap.add_argument("--out-md", default="", help="output markdown path")
    args = ap.parse_args()

    pred_rows = {}
    with Path(args.pred).open("r", encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            pred_rows[r["file"]] = r

    gt_rows = []
    with Path(args.gt).open("r", encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            gt_rows.append(r)

    conf = defaultdict(lambda: defaultdict(int))
    total_labeled_class = 0
    correct_class = 0

    # binary reject-vs-nonreject
    tp_rej = fp_rej = fn_rej = 0

    # rule metrics
    rule_keys = ["eyes_closed", "focus_subject", "blur", "exposure_bad", "duplicate"]
    rule_stat = {k: {"tp": 0, "fp": 0, "fn": 0, "tn": 0, "labeled": 0} for k in rule_keys}

    missing_pred = []

    for g in gt_rows:
        file = g.get("file", "")
        p = pred_rows.get(file)
        if not p:
            missing_pred.append(file)
            continue

        pred_class = (p.get("class") or "").strip().lower()
        gt_class = (g.get("gt_class") or "").strip().lower()

        if gt_class in CLASSES:
            conf[gt_class][pred_class] += 1
            total_labeled_class += 1
            if pred_class == gt_class:
                correct_class += 1

            gt_rej = int(gt_class == "reject")
            pred_rej = int(pred_class == "reject")
            if gt_rej and pred_rej:
                tp_rej += 1
            elif (not gt_rej) and pred_rej:
                fp_rej += 1
            elif gt_rej and (not pred_rej):
                fn_rej += 1

        flags = parse_reason_flags(p.get("reject_reasons", ""), p.get("review_reasons", ""))
        gt_flag_map = {
            "eyes_closed": to_int_or_none(g.get("eyes_closed_gt", "")),
            "focus_subject": to_int_or_none(g.get("focus_subject_gt", "")),
            "blur": to_int_or_none(g.get("blur_gt", "")),
            "exposure_bad": to_int_or_none(g.get("exposure_bad_gt", "")),
            "duplicate": to_int_or_none(g.get("duplicate_gt", "")),
        }

        for k in rule_keys:
            y = gt_flag_map[k]
            if y is None:
                continue
            yhat = int(flags[k])
            rs = rule_stat[k]
            rs["labeled"] += 1
            if y == 1 and yhat == 1:
                rs["tp"] += 1
            elif y == 0 and yhat == 1:
                rs["fp"] += 1
            elif y == 1 and yhat == 0:
                rs["fn"] += 1
            else:
                rs["tn"] += 1

    cls_acc = safe_div(correct_class, total_labeled_class)
    pr, rr, f1r = binary_metrics(tp_rej, fp_rej, fn_rej)

    rule_metrics = {}
    for k, rs in rule_stat.items():
        p, r, f1 = binary_metrics(rs["tp"], rs["fp"], rs["fn"])
        rule_metrics[k] = {
            "labeled": rs["labeled"],
            "precision": round(p, 4),
            "recall": round(r, 4),
            "f1": round(f1, 4),
        }

    result = {
        "summary": {
            "labeled_class_count": total_labeled_class,
            "class_accuracy": round(cls_acc, 4),
            "missing_prediction_count": len(missing_pred),
        },
        "reject_binary": {
            "precision": round(pr, 4),
            "recall": round(rr, 4),
            "f1": round(f1r, 4),
            "tp": tp_rej,
            "fp": fp_rej,
            "fn": fn_rej,
        },
        "confusion_matrix": {g: dict(conf[g]) for g in CLASSES},
        "rule_metrics": rule_metrics,
        "missing_predictions": missing_pred[:50],
    }

    out_json = Path(args.out_json) if args.out_json else Path(args.gt).with_name("eval_result.json")
    out_md = Path(args.out_md) if args.out_md else Path(args.gt).with_name("eval_result.md")

    out_json.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = []
    lines.append("# Photo Forge 평가 리포트")
    lines.append("")
    lines.append(f"- labeled_class_count: {result['summary']['labeled_class_count']}")
    lines.append(f"- class_accuracy: {result['summary']['class_accuracy']:.4f}")
    lines.append(f"- missing_prediction_count: {result['summary']['missing_prediction_count']}")
    lines.append("")
    lines.append("## Reject(binary) metrics")
    rb = result["reject_binary"]
    lines.append(f"- precision: {rb['precision']:.4f}")
    lines.append(f"- recall: {rb['recall']:.4f}")
    lines.append(f"- f1: {rb['f1']:.4f}")
    lines.append("")
    lines.append("## Rule metrics")
    lines.append("| rule | labeled | precision | recall | f1 |")
    lines.append("|---|---:|---:|---:|---:|")
    for k in ["eyes_closed", "focus_subject", "blur", "exposure_bad", "duplicate"]:
        rm = result["rule_metrics"][k]
        lines.append(f"| {k} | {rm['labeled']} | {rm['precision']:.4f} | {rm['recall']:.4f} | {rm['f1']:.4f} |")

    out_md.write_text("\n".join(lines), encoding="utf-8")

    print(str(out_json))
    print(str(out_md))


if __name__ == "__main__":
    main()
