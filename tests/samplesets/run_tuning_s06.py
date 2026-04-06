#!/usr/bin/env python3
from pathlib import Path
import csv
import json
import subprocess
import time
from collections import Counter

ROOT = Path(__file__).resolve().parents[2]
SET_NAME = "S06_user_test"
INPUT_DIR = ROOT / "tests" / "samplesets" / SET_NAME / "input"

PROFILES = {
    "conservative": {"eyes": 1, "focus": 1, "blur": 1, "exposure": 1, "duplicate": 1},
    "balanced": {"eyes": 2, "focus": 2, "blur": 1, "exposure": 1, "duplicate": 2},
    "aggressive": {"eyes": 3, "focus": 3, "blur": 2, "exposure": 2, "duplicate": 3},
}


def _iter_jpg_files(path: Path):
    if not path.exists():
        return []
    return [p for p in path.iterdir() if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg"}]


def _run_profile(name: str, lv: dict) -> dict:
    out_dir = Path("/tmp/photo_forge_tuning_s06") / name
    out_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        "python3",
        "-m",
        "photo_forge.cli",
        "run",
        "--input",
        str(INPUT_DIR),
        "--output",
        str(out_dir),
        "--eyes-level",
        str(lv["eyes"]),
        "--focus-level",
        str(lv["focus"]),
        "--blur-level",
        str(lv["blur"]),
        "--exposure-level",
        str(lv["exposure"]),
        "--duplicate-level",
        str(lv["duplicate"]),
        "--dry-run",
    ]

    t0 = time.time()
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    elapsed = round(time.time() - t0, 2)

    summary = {}
    summary_path = out_dir / "summary.json"
    if summary_path.exists():
        summary = json.loads(summary_path.read_text(encoding="utf-8"))

    cls = Counter()
    reasons = Counter()
    result_csv = out_dir / "result.csv"
    if result_csv.exists():
        with result_csv.open("r", encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                cls[row.get("class", "")] += 1
                for r in filter(None, (row.get("reject_reasons") or "").split(";")):
                    reasons[r.split(":")[0]] += 1

    return {
        "profile": name,
        "levels": lv,
        "exit": proc.returncode,
        "elapsed_sec": elapsed,
        "total": int(summary.get("total", 0) or 0),
        "keep": int(summary.get("keep", 0) or 0),
        "reject": int(summary.get("reject", 0) or 0),
        "review": int(summary.get("review", 0) or 0),
        "reject_ratio": round((int(summary.get("reject", 0) or 0) / int(summary.get("total", 0) or 1)), 4)
        if int(summary.get("total", 0) or 0)
        else 0.0,
        "class_counts": dict(cls),
        "reason_counts": dict(reasons),
        "stderr": (proc.stderr or "").strip()[:300],
    }


def _recommend(rows: list, sample_count: int) -> str:
    if sample_count < 20:
        return "insufficient_data"

    ok = [r for r in rows if r.get("exit") == 0]
    if not ok:
        return "none"

    # 과거절 방지: reject_ratio가 가장 낮은 프로파일 우선, 동점이면 balanced 선호
    ok_sorted = sorted(ok, key=lambda r: (r.get("reject_ratio", 1.0), 0 if r.get("profile") == "balanced" else 1))
    return ok_sorted[0]["profile"]


def main():
    files = _iter_jpg_files(INPUT_DIR)
    sample_count = len(files)

    rows = [_run_profile(name, lv) for name, lv in PROFILES.items()]
    recommendation = _recommend(rows, sample_count)

    payload = {
        "set": SET_NAME,
        "input_dir": str(INPUT_DIR),
        "sample_count": sample_count,
        "profiles": rows,
        "recommendation": recommendation,
        "minimum_recommended_samples": 20,
    }

    out_json = ROOT / "QA_TUNING_S06.json"
    out_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = []
    lines.append("# Photo Forge S06 튜닝 리포트")
    lines.append("")
    lines.append(f"- 대상: {SET_NAME}")
    lines.append(f"- 샘플 수: {sample_count}")
    lines.append("- 권장 최소 샘플 수: 20")
    lines.append("")

    lines.append("## 프로파일 결과")
    lines.append("| Profile | Keep | Reject | Review | Reject ratio | 주요 사유 Top3 |")
    lines.append("|---|---:|---:|---:|---:|---|")
    for r in rows:
        rc = Counter(r.get("reason_counts", {})).most_common(3)
        rs = ", ".join([f"{k}:{v}" for k, v in rc]) if rc else "-"
        lines.append(
            f"| {r['profile']} | {r['keep']} | {r['reject']} | {r['review']} | {r['reject_ratio']:.4f} | {rs} |"
        )

    lines.append("")
    if recommendation == "insufficient_data":
        lines.append("## 판정")
        lines.append("- 현재 샘플 수가 부족하여(20장 미만) 프리셋 확정 불가")
        lines.append("- 다음 액션: S06 input에 최소 20~50장 추가 후 재실행")
    else:
        lines.append("## 판정")
        lines.append(f"- 추천 프로파일: {recommendation}")

    lines.append("")
    lines.append("세부 JSON: QA_TUNING_S06.json")

    out_md = ROOT / "QA_TUNING_S06.md"
    out_md.write_text("\n".join(lines), encoding="utf-8")

    print(out_md)
    print(out_json)


if __name__ == "__main__":
    main()
