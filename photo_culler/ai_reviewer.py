from __future__ import annotations

import base64
import json
import os
import urllib.request
from pathlib import Path
from typing import Dict, Tuple


def _mime_for(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if ext == ".png":
        return "image/png"
    if ext == ".webp":
        return "image/webp"
    return "application/octet-stream"


def _data_url(path: Path) -> str:
    raw = path.read_bytes()
    return f"data:{_mime_for(path)};base64,{base64.b64encode(raw).decode('ascii')}"


def ai_review_image(path: Path, model: str = "gpt-4.1-mini") -> Tuple[str, str]:
    """
    Returns: (decision, reason)
      decision in {keep,reject,review}
    """
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("CODEX_API_KEY")
    if not api_key:
        return "review", "ai_unavailable:no_api_key"

    prompt = (
        "You are a photo culling judge. For a portrait photo, return JSON only: "
        '{"decision":"keep|reject|review","reason":"short_reason"}. '
        "Reject if eyes are closed or subject focus is clearly wrong. "
        "Review if uncertain."
    )

    body = {
        "model": model,
        "input": [
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": prompt},
                    {"type": "input_image", "image_url": _data_url(path)},
                ],
            }
        ],
        "text": {"format": {"type": "json_object"}},
    }

    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return "review", f"ai_error:{e.__class__.__name__}"

    text = payload.get("output_text", "").strip()
    if not text:
        # fallback parser for structured output chunks
        chunks = payload.get("output", [])
        for chunk in chunks:
            for c in chunk.get("content", []):
                if c.get("type") in {"output_text", "text"} and c.get("text"):
                    text += c["text"]

    try:
        parsed: Dict[str, str] = json.loads(text)
    except Exception:
        return "review", "ai_parse_failed"

    decision = (parsed.get("decision") or "review").lower().strip()
    reason = (parsed.get("reason") or "ai_reason_missing").strip()

    if decision not in {"keep", "reject", "review"}:
        decision = "review"
    return decision, f"ai:{reason}"
