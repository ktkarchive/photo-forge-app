from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import cv2
import numpy as np

try:
    import mediapipe as mp  # type: ignore
except Exception:  # pragma: no cover
    mp = None


@dataclass
class CheckResult:
    available: bool
    score: Optional[float]
    passed: Optional[bool]
    reason: Optional[str] = None
    detail: Optional[Dict] = None


def _variance_of_laplacian(gray: np.ndarray) -> float:
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _eye_aspect_ratio(points: np.ndarray) -> float:
    # points: 6x2
    p1, p2, p3, p4, p5, p6 = points
    a = np.linalg.norm(p2 - p6)
    b = np.linalg.norm(p3 - p5)
    c = np.linalg.norm(p1 - p4)
    if c == 0:
        return 0.0
    return float((a + b) / (2.0 * c))


def detect_eyes_closed_bymesh(image_bgr: np.ndarray, eye_closed_ratio: float) -> CheckResult:
    if mp is None:
        return CheckResult(False, None, None, reason="eyes_closed_unavailable:mediapipe_missing")
    if not hasattr(mp, "solutions"):
        return CheckResult(False, None, None, reason="eyes_closed_unavailable:mediapipe_solutions_missing")

    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    h, w = image_rgb.shape[:2]

    # MediaPipe FaceMesh eye landmarks
    left_ids = [33, 160, 158, 133, 153, 144]
    right_ids = [362, 385, 387, 263, 373, 380]

    try:
        with mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
        ) as face_mesh:
            result = face_mesh.process(image_rgb)
    except Exception:
        return CheckResult(False, None, None, reason="eyes_closed_unavailable:mediapipe_runtime_error")

    if not result.multi_face_landmarks:
        return CheckResult(False, None, None, reason="eyes_closed_unavailable:no_face")

    lm = result.multi_face_landmarks[0].landmark

    left = np.array([[lm[i].x * w, lm[i].y * h] for i in left_ids], dtype=np.float32)
    right = np.array([[lm[i].x * w, lm[i].y * h] for i in right_ids], dtype=np.float32)

    left_ear = _eye_aspect_ratio(left)
    right_ear = _eye_aspect_ratio(right)
    ear = float((left_ear + right_ear) / 2.0)

    # 측면 얼굴(프로파일)에서는 한쪽 눈 landmark 품질이 급격히 떨어져 false reject가 늘어남.
    # 좌우 EAR 불균형이 큰 경우 눈감음 판정을 완화(통과 처리)한다.
    lo = max(min(left_ear, right_ear), 1e-6)
    hi = max(left_ear, right_ear)
    asym_ratio = float(hi / lo)
    profile_relaxed = asym_ratio >= 2.0

    is_closed = (ear < eye_closed_ratio) and (not profile_relaxed)
    return CheckResult(
        available=True,
        score=ear,
        passed=not is_closed,
        reason="eyes_closed" if is_closed else None,
        detail={"left_ear": left_ear, "right_ear": right_ear, "asym_ratio": asym_ratio, "profile_relaxed": profile_relaxed},
    )


def _largest_face_roi(gray: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
    detector = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
    if len(faces) == 0:
        return None
    return max(faces, key=lambda r: r[2] * r[3])


def detect_subject_focus(image_bgr: np.ndarray, subject_focus_delta: float) -> CheckResult:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    roi = _largest_face_roi(gray)
    if roi is None:
        return CheckResult(False, None, None, reason="focus_unavailable:no_face")

    x, y, w, h = roi
    face = gray[y : y + h, x : x + w]
    face_sharp = _variance_of_laplacian(face)

    mask = np.ones_like(gray, dtype=np.uint8)
    mask[y : y + h, x : x + w] = 0
    bg = gray[mask == 1]
    if bg.size < 100:
        return CheckResult(False, None, None, reason="focus_unavailable:bg_too_small")

    bg_sharp = float(cv2.Laplacian(bg.reshape(-1, 1), cv2.CV_64F).var())
    delta = face_sharp - bg_sharp

    out_of_focus = delta < subject_focus_delta
    return CheckResult(
        available=True,
        score=delta,
        passed=not out_of_focus,
        reason="out_of_focus_subject" if out_of_focus else None,
        detail={"face_sharp": face_sharp, "bg_sharp": bg_sharp},
    )


def detect_motion_blur(image_bgr: np.ndarray, blur_var_min: float) -> CheckResult:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    score = _variance_of_laplacian(gray)
    blurred = score < blur_var_min
    return CheckResult(True, score, not blurred, reason="motion_blur" if blurred else None)


def detect_exposure(image_bgr: np.ndarray, over_max: float, under_max: float) -> CheckResult:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    total = gray.size
    over = float((gray >= 245).sum() / total)
    under = float((gray <= 15).sum() / total)
    bad = (over > over_max) or (under > under_max)
    score = max(over / max(over_max, 1e-6), under / max(under_max, 1e-6))
    return CheckResult(
        True,
        score,
        not bad,
        reason="exposure_bad" if bad else None,
        detail={"over_ratio": over, "under_ratio": under},
    )


def compute_ahash(image_bgr: np.ndarray) -> int:
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    resized = cv2.resize(gray, (8, 8), interpolation=cv2.INTER_AREA)
    mean = resized.mean()
    bits = (resized > mean).astype(np.uint8).flatten()
    value = 0
    for b in bits:
        value = (value << 1) | int(b)
    return int(value)


def hamming_distance64(a: int, b: int) -> int:
    x = int(a) ^ int(b)
    try:
        return int(x.bit_count())
    except AttributeError:
        return bin(x).count("1")
