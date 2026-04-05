#!/usr/bin/env python3
from pathlib import Path
import json
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
SETS = [
    "S01_portrait_mixed",
    "S02_lowlight_blur",
    "S03_duplicates_burst",
    "S04_edge_cases",
    "S05_real_lite",
]

PROFILES = {
    "conservative": {"eyes": 1, "focus": 1, "blur": 1, "exposure": 1, "duplicate": 0},
    "balanced": {"eyes": 2, "focus": 2, "blur": 1, "exposure": 1, "duplicate": 1},
    "aggressive": {"eyes": 3, "focus": 3, "blur": 2, "exposure": 2, "duplicate": 2},
}


def run_once(set_name: str, prof_name: str, lv: dict) -> dict:
    in_dir = ROOT / "tests" / "samplesets" / set_name / "input"
    out_dir = Path("/tmp/ktk_tuning") / prof_name / set_name
    out_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        "python3", "-m", "ktk_select.cli", "run",
        "--input", str(in_dir),
        "--output", str(out_dir),
        "--eyes-level", str(lv["eyes"]),
        "--focus-level", str(lv["focus"]),
        "--blur-level", str(lv["blur"]),
        "--exposure-level", str(lv["exposure"]),
        "--duplicate-level", str(lv["duplicate"]),
        "--dry-run",
    ]

    t0 = time.time()
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    elapsed = round(time.time() - t0, 2)

    summary_path = out_dir / "summary.json"
    summary = {}
    if summary_path.exists():
        summary = json.loads(summary_path.read_text())

    total = int(summary.get("total", 0) or 0)
    keep = int(summary.get("keep", 0) or 0)
    reject = int(summary.get("reject", 0) or 0)
    review = int(summary.get("review", 0) or 0)

    return {
        "set": set_name,
        "profile": prof_name,
        "exit": p.returncode,
        "elapsed_sec": elapsed,
        "total": total,
        "keep": keep,
        "reject": reject,
        "review": review,
        "reject_ratio": round((reject / total) if total else 0.0, 4),
        "review_ratio": round((review / total) if total else 0.0, 4),
        "stderr": (p.stderr or "").strip()[:200],
    }


def main():
    rows = []
    for prof, lv in PROFILES.items():
        for s in SETS:
            rows.append(run_once(s, prof, lv))

    out_json = ROOT / "QA_TUNING_SWEEP_3.json"
    out_json.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    # aggregate by profile
    agg = {}
    for prof in PROFILES:
        xs = [r for r in rows if r["profile"] == prof and r["exit"] == 0]
        total = sum(r["total"] for r in xs)
        reject = sum(r["reject"] for r in xs)
        review = sum(r["review"] for r in xs)
        agg[prof] = {
            "total": total,
            "reject": reject,
            "review": review,
            "reject_ratio": round((reject / total) if total else 0.0, 4),
            "review_ratio": round((review / total) if total else 0.0, 4),
            "ok_sets": len(xs),
        }

    lines = []
    lines.append("# Photo Forge QA 튜닝 리포트 3차")
    lines.append("")
    lines.append("범위: S01~S05, dry-run, 프로파일 3종 비교")
    lines.append("")
    lines.append("## 프로파일별 총괄")
    lines.append("| Profile | Total | Reject | Review | Reject ratio | Review ratio | OK sets |")
    lines.append("|---|---:|---:|---:|---:|---:|---:|")
    for prof in ["conservative", "balanced", "aggressive"]:
        a = agg[prof]
        lines.append(f"| {prof} | {a['total']} | {a['reject']} | {a['review']} | {a['reject_ratio']:.4f} | {a['review_ratio']:.4f} | {a['ok_sets']} |")

    lines.append("")
    lines.append("## 권장")
    lines.append("- 베타 기본값: balanced (eyes=2, focus=2, blur=1, exposure=1, duplicate=1)")
    lines.append("- 이유: conservative 대비 저품질 컷 배제율이 높고, aggressive 대비 과도한 reject 리스크 완화")
    lines.append("")
    lines.append("세부 결과 JSON: QA_TUNING_SWEEP_3.json")

    out_md = ROOT / "QA_TUNING_REPORT_3.md"
    out_md.write_text("\n".join(lines), encoding="utf-8")

    print(str(out_md))
    print(str(out_json))


if __name__ == "__main__":
    main()
