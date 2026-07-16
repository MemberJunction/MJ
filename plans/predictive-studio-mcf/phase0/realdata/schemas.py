"""
Gemini structured-output schemas for the Track-A real-data experiments (A6.9.1).

Every LLM call in the session uses one of these via harness.llm.ask_json —
schema-forced, temp 0, audited. The TRIAGE schema is the standalone twin of the
future Core `TriageDecision` Zod schema (Doc 5): task family + triage verdict +
the worth-building / meaningfulness judgment + cited stats + story seed.
"""

TRIAGE_SCHEMA = {
    "type": "object",
    "properties": {
        "task_family": {"type": "string", "enum": [
            "classification", "regression", "survival", "forecasting",
            "clustering", "uplift", "none"]},
        "triage": {"type": "string", "enum": ["commit", "defer", "combine", "reuse"]},
        "model_worth_building": {"type": "boolean"},
        "expected_meaningfulness": {
            "type": "object",
            "properties": {
                "decision_informed": {"type": "string"},
                "value_metric": {"type": "string"},
                "honest_ceiling": {"type": "string"},
            },
            "required": ["decision_informed", "value_metric", "honest_ceiling"],
        },
        "chosen_components": {"type": "array", "items": {"type": "string"}},
        "composition_graph": {
            "type": "object",
            "properties": {
                "nodes": {"type": "array", "items": {"type": "object", "properties": {
                    "id": {"type": "string"}, "component": {"type": "string"}},
                    "required": ["id", "component"]}},
                "edges": {"type": "array", "items": {"type": "object", "properties": {
                    "from": {"type": "string"}, "to": {"type": "string"},
                    "port": {"type": "string"}, "adapter": {"type": "string"}},
                    "required": ["from", "to", "port"]}},
            },
        },
        "calibration_required": {"type": "boolean"},
        "cited_stats": {"type": "array", "items": {"type": "object", "properties": {
            "name": {"type": "string"}, "value": {"type": "string"},
            "why": {"type": "string"}}, "required": ["name", "value", "why"]}},
        "data_prerequisites": {"type": "array", "items": {"type": "string"}},
        "validation_plan": {"type": "string"},
        "story_seed": {"type": "object", "properties": {
            "nominal_name": {"type": "string"}, "narrative": {"type": "string"}},
            "required": ["nominal_name", "narrative"]},
        "rationale": {"type": "string"},
    },
    "required": ["task_family", "triage", "model_worth_building",
                 "expected_meaningfulness", "cited_stats", "validation_plan", "rationale"],
}

SYNTHESIS_SCHEMA = {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": ["resolve", "recombine", "stop"]},
        "winner": {"type": "string"},
        "cited_numbers": {"type": "array", "items": {"type": "string"}},
        "rationale": {"type": "string"},
    },
    "required": ["action", "cited_numbers", "rationale"],
}

LEAKSCREEN_SCHEMA = {
    "type": "object",
    "properties": {
        "flags": {"type": "array", "items": {"type": "object", "properties": {
            "column": {"type": "string"}, "leaky": {"type": "boolean"},
            "reason": {"type": "string"}},
            "required": ["column", "leaky", "reason"]}},
    },
    "required": ["flags"],
}

STORY_SCHEMA = {
    "type": "object",
    "properties": {
        "nominal_name": {"type": "string"},
        "narrative": {"type": "string"},
        "groundings": {"type": "array", "items": {"type": "string"}},
        "role_in_story": {"type": "string"},
    },
    "required": ["nominal_name", "narrative", "groundings", "role_in_story"],
}

REPAIR_SCHEMA = {
    "type": "object",
    "properties": {
        "accepted": {"type": "boolean"},
        "repaired_graph": {
            "type": "object",
            "properties": {
                "nodes": {"type": "array", "items": {"type": "object", "properties": {
                    "id": {"type": "string"}, "component": {"type": "string"}},
                    "required": ["id", "component"]}},
                "edges": {"type": "array", "items": {"type": "object", "properties": {
                    "from": {"type": "string"}, "to": {"type": "string"},
                    "port": {"type": "string"}, "adapter": {"type": "string"}},
                    "required": ["from", "to", "port"]}},
            },
        },
        "rationale": {"type": "string"},
    },
    "required": ["accepted", "rationale"],
}
