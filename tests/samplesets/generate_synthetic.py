#!/usr/bin/env python3
from pathlib import Path
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent

SETS = {
    "S01_portrait_mixed": 16,
    "S02_lowlight_blur": 16,
    "S03_duplicates_burst": 20,
    "S04_edge_cases": 12,
}


def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)


def make_base(idx: int, w=1280, h=853):
    img = np.zeros((h, w, 3), dtype=np.uint8)
    c = ((idx * 37) % 180 + 40)
    img[:, :] = (c, c, c)
    cv2.putText(img, f"KTK {idx:03d}", (40, 90), cv2.FONT_HERSHEY_SIMPLEX, 2.2, (255, 255, 255), 4)
    return img


def add_face_like(img, idx):
    h, w = img.shape[:2]
    cx, cy = w // 2, h // 2
    cv2.circle(img, (cx, cy), 180, (210, 210, 210), -1)
    eye_y = cy - 45
    if idx % 5 == 0:
        cv2.line(img, (cx - 70, eye_y), (cx - 25, eye_y), (30, 30, 30), 5)
        cv2.line(img, (cx + 25, eye_y), (cx + 70, eye_y), (30, 30, 30), 5)
    else:
        cv2.circle(img, (cx - 45, eye_y), 16, (30, 30, 30), -1)
        cv2.circle(img, (cx + 45, eye_y), 16, (30, 30, 30), -1)
    cv2.ellipse(img, (cx, cy + 55), (60, 25), 0, 0, 180, (40, 40, 40), 4)


def apply_set_style(name: str, img, idx: int):
    if name == "S01_portrait_mixed":
        if idx % 2 == 0:
            add_face_like(img, idx)
    elif name == "S02_lowlight_blur":
        add_face_like(img, idx)
        img[:] = (img * 0.35).astype(np.uint8)
        if idx % 2 == 0:
            img[:] = cv2.GaussianBlur(img, (11, 11), 0)
    elif name == "S03_duplicates_burst":
        add_face_like(img, idx // 3)
        if idx % 3 == 1:
            img = cv2.GaussianBlur(img, (7, 7), 0)
        elif idx % 3 == 2:
            M = np.float32([[1, 0, 2], [0, 1, -2]])
            img = cv2.warpAffine(img, M, (img.shape[1], img.shape[0]))
    elif name == "S04_edge_cases":
        if idx % 3 == 0:
            add_face_like(img, idx)
            img[:] = np.clip(img + 90, 0, 255)
        elif idx % 3 == 1:
            add_face_like(img, idx)
            img[:] = (img * 0.2).astype(np.uint8)
        else:
            cv2.rectangle(img, (0, 0), (img.shape[1], img.shape[0]), (idx*19 % 255, 10, 240), -1)
    return img


def main():
    for set_name, count in SETS.items():
        in_dir = ROOT / set_name / "input"
        ensure_dir(in_dir)
        for i in range(count):
            img = make_base(i)
            img = apply_set_style(set_name, img, i)
            out = in_dir / f"{set_name.lower()}_{i:03d}.jpg"
            cv2.imwrite(str(out), img)

        # one intentionally broken file for edge cases
        if set_name == "S04_edge_cases":
            (in_dir / "broken_001.jpg").write_bytes(b"not-a-real-jpeg")

    print("Synthetic sample sets generated.")


if __name__ == "__main__":
    main()
