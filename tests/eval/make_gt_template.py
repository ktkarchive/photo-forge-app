#!/usr/bin/env python3
import argparse
import csv
from pathlib import Path

HEADER = [
    "file",
    "gt_class",  # keep/reject/review
    "eyes_closed_gt",  # 0/1/blank
    "focus_subject_gt",  # 0/1/blank (1=subject in focus)
    "blur_gt",  # 0/1/blank (1=blur bad)
    "exposure_bad_gt",  # 0/1/blank
    "duplicate_gt",  # 0/1/blank
    "comment",
]


def main():
    p = argparse.ArgumentParser(description="Create ground-truth labeling template from result.csv")
    p.add_argument("--pred", required=True, help="Path to prediction result.csv")
    p.add_argument("--out", required=True, help="Path to output ground_truth.csv")
    args = p.parse_args()

    pred = Path(args.pred)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    with pred.open("r", encoding="utf-8", newline="") as f:
      rows = list(csv.DictReader(f))

    with out.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(HEADER)
        for r in rows:
            w.writerow([r.get("file", ""), "", "", "", "", "", "", ""])

    print(str(out))


if __name__ == "__main__":
    main()
