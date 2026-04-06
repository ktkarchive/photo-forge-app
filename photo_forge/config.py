from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Tuple


@dataclass
class Thresholds:
    eye_closed_ratio: float = 0.22
    subject_focus_delta: float = -12.0
    blur_var_min: float = 90.0
    overexposed_ratio_max: float = 0.18
    underexposed_ratio_max: float = 0.25
    duplicate_hamming_max: int = 6


@dataclass
class RuleFlags:
    eyes_closed: bool = True
    out_of_focus_subject: bool = True
    motion_blur: bool = True
    exposure_bad: bool = True
    duplicate: bool = False
    occlusion: bool = False
    composition_bad: bool = False


@dataclass
class AIConfig:
    mode: str = "off"  # off|smart|full
    provider: str = "codex"
    max_calls_per_run: int = 0
    model: str = "gpt-4.1-mini"


RULE_LEVEL_KEYS = [
    "eyes_closed",
    "out_of_focus_subject",
    "motion_blur",
    "exposure_bad",
    "duplicate",
    "occlusion",
    "composition_bad",
]

DEFAULT_RULE_LEVELS: Dict[str, int] = {
    "eyes_closed": 2,
    "out_of_focus_subject": 2,
    "motion_blur": 2,
    "exposure_bad": 2,
    "duplicate": 0,
    "occlusion": 0,
    "composition_bad": 0,
}


def clamp_level(value: Any) -> int:
    try:
        iv = int(value)
    except Exception:
        iv = 0
    return max(0, min(3, iv))


def _threshold_eye(level: int) -> float:
    return {1: 0.18, 2: 0.22, 3: 0.26}.get(level, 0.22)


def _threshold_focus(level: int) -> float:
    return {1: -18.0, 2: -12.0, 3: -8.0}.get(level, -12.0)


def _threshold_blur(level: int) -> float:
    # 완화된 블러 컷오프 (실사용 과거절 완화)
    return {1: 30.0, 2: 50.0, 3: 0.0}.get(level, 50.0)


def _threshold_exposure(level: int) -> Tuple[float, float]:
    # (overexposed_ratio_max, underexposed_ratio_max)
    return {
        1: (0.24, 0.32),
        2: (0.18, 0.25),
        3: (0.14, 0.20),
    }.get(level, (0.18, 0.25))


def _threshold_duplicate(level: int) -> int:
    return {1: 5, 2: 6, 3: 8}.get(level, 6)


def build_profile_from_rule_levels(rule_levels: Dict[str, int]) -> Tuple[RuleFlags, Thresholds, Dict[str, int]]:
    lv = {k: clamp_level(rule_levels.get(k, DEFAULT_RULE_LEVELS.get(k, 0))) for k in RULE_LEVEL_KEYS}

    rules = RuleFlags(
        eyes_closed=lv["eyes_closed"] > 0,
        out_of_focus_subject=lv["out_of_focus_subject"] > 0,
        motion_blur=lv["motion_blur"] > 0,
        exposure_bad=lv["exposure_bad"] > 0,
        duplicate=lv["duplicate"] > 0,
        occlusion=lv["occlusion"] > 0,
        composition_bad=lv["composition_bad"] > 0,
    )

    thresholds = Thresholds(
        eye_closed_ratio=_threshold_eye(lv["eyes_closed"]),
        subject_focus_delta=_threshold_focus(lv["out_of_focus_subject"]),
        blur_var_min=_threshold_blur(lv["motion_blur"]),
        overexposed_ratio_max=_threshold_exposure(lv["exposure_bad"])[0],
        underexposed_ratio_max=_threshold_exposure(lv["exposure_bad"])[1],
        duplicate_hamming_max=_threshold_duplicate(lv["duplicate"]),
    )

    return rules, thresholds, lv


def apply_threshold_overrides(thresholds: Thresholds, values: Dict[str, Any]) -> Thresholds:
    for key, value in values.items():
        if hasattr(thresholds, key):
            setattr(thresholds, key, value)
    return thresholds


def _read_yaml(path: Path) -> Dict[str, Any]:
    try:
        import yaml  # type: ignore
    except Exception as e:  # pragma: no cover
        raise RuntimeError("PyYAML 설치가 필요합니다: pip install pyyaml") from e

    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    if not isinstance(data, dict):
        raise ValueError("config 파일 최상위는 mapping(dict) 이어야 합니다")
    return data


def load_config_file(path: Optional[str]) -> Dict[str, Any]:
    if not path:
        return {}
    p = Path(path).expanduser().resolve()
    if not p.exists() or not p.is_file():
        raise FileNotFoundError(f"config 파일을 찾을 수 없습니다: {p}")
    return _read_yaml(p)


def merge_config_overrides(
    rules: RuleFlags,
    thresholds: Thresholds,
    ai: AIConfig,
    rule_levels: Dict[str, int],
    conf: Dict[str, Any],
) -> Tuple[RuleFlags, Thresholds, AIConfig, Dict[str, int]]:
    if not conf:
        return rules, thresholds, ai, rule_levels

    merged_levels = dict(rule_levels)

    # legacy global level: 전체 항목 일괄 적용
    if isinstance(conf.get("level"), int):
        glv = clamp_level(conf.get("level"))
        for k in RULE_LEVEL_KEYS:
            merged_levels[k] = glv

    conf_rule_levels = conf.get("rule_levels") or {}
    if isinstance(conf_rule_levels, dict):
        for key, value in conf_rule_levels.items():
            if key in RULE_LEVEL_KEYS:
                merged_levels[key] = clamp_level(value)

    # level 반영 재계산
    rules, thresholds, merged_levels = build_profile_from_rule_levels(merged_levels)

    # legacy bool rules 호환
    conf_rules = conf.get("rules") or {}
    if isinstance(conf_rules, dict):
        for key, value in conf_rules.items():
            if key in RULE_LEVEL_KEYS:
                if bool(value) is False:
                    merged_levels[key] = 0
                elif merged_levels[key] == 0:
                    merged_levels[key] = 2
        rules, thresholds, merged_levels = build_profile_from_rule_levels(merged_levels)

    # threshold 수동 오버라이드
    conf_thresholds = conf.get("thresholds") or {}
    if isinstance(conf_thresholds, dict):
        apply_threshold_overrides(thresholds, conf_thresholds)

    conf_ai = conf.get("ai") or {}
    if isinstance(conf_ai, dict):
        if "mode" in conf_ai:
            ai.mode = str(conf_ai["mode"])
        if "provider" in conf_ai:
            ai.provider = str(conf_ai["provider"])
        if "max_calls_per_run" in conf_ai:
            ai.max_calls_per_run = int(conf_ai["max_calls_per_run"])
        if "model" in conf_ai:
            ai.model = str(conf_ai["model"])

    return rules, thresholds, ai, merged_levels


def rules_to_dict(rules: RuleFlags) -> Dict[str, Any]:
    return asdict(rules)


def thresholds_to_dict(thresholds: Thresholds) -> Dict[str, Any]:
    return asdict(thresholds)
