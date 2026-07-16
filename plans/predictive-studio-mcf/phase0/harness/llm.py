"""
LLM harness for the agent-role Phase-0 experiments (V1, V4, V8).

Calls an external model (Gemini) with a prompt + JSON-schema, returns parsed
structured output, and records model name + prompt sha256 + raw response to an
audit JSONL so every LLM judgment is reproducible/inspectable. The model NEVER
sees raw data values in the leakage/triage experiments — only schema, column
descriptions, and pre-computed statistics.
"""
from __future__ import annotations
import hashlib
import json
import os
import time
from pathlib import Path

RESULTS = Path(__file__).resolve().parent.parent / "results"
LLM_AUDIT = RESULTS / "llm_audit.jsonl"
MODEL = os.environ.get("PHASE0_LLM_MODEL", "gemini-2.5-flash")

_client = None


def _get_client():
    global _client
    if _client is None:
        from google import genai
        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            raise RuntimeError("GEMINI_API_KEY not set (see run.sh env)")
        _client = genai.Client(api_key=key)
    return _client


def ask_json(prompt: str, schema: dict, experiment: str, tag: str = "") -> dict:
    """Send prompt, require JSON matching `schema`, return parsed dict. Audited."""
    from google.genai import types
    client = _get_client()
    cfg = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=schema,
        temperature=0.0,  # determinism-leaning; recorded regardless
    )
    resp = client.models.generate_content(model=MODEL, contents=prompt, config=cfg)
    text = resp.text
    try:
        parsed = json.loads(text)
    except Exception:
        parsed = {"_parse_error": True, "_raw": text}
    rec = {
        "ts": round(time.time(), 3), "experiment": experiment, "tag": tag,
        "model": MODEL, "prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest()[:16],
        "prompt_len": len(prompt), "response": parsed,
    }
    with LLM_AUDIT.open("a") as f:
        f.write(json.dumps(rec) + "\n")
    return parsed
