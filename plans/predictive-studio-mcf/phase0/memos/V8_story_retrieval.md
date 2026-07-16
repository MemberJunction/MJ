# V8 — Story-Tag Retrieval (the reuse bet)

**Verdict: PASS**

## Hypothesis
Meaning-tagged components are retrieved for a new task better than keyword search over technical names — so reuse-before-rebuild works because components are findable by *what they find*.

## Method
A 10-component library (technical name + nominal story tag + description) and 10 task queries phrased as a user would ask them, with known-correct answers. Three arms: **keyword** (token overlap on the technical name), **nominal** (LLM ranks story tags), **both** (LLM ranks name+story+description). Metric: top-3 retrieval accuracy. Gemini 2.5-flash.

## Result (`results/llm_audit.jsonl`)

| arm | top-3 accuracy |
|---|---|
| keyword (technical names) | 0.50 |
| **nominal (story tags)** | **1.00** |
| both | 1.00 |

PASS bar: meaning-aware top-3 ≥ 0.8 (**1.00**) and ≥ 0.2 over keyword (**+0.50**).

## Reading
Half the queries never matched on technical tokens — "who is quietly disengaging?" shares no words with `GaussianHMM_4state_v3`, but matches its story ("sees members cooling toward dormancy") immediately. Retrieval by *what a component finds* got the right capability every time. That's the mechanism that makes the library compound: the next project finds and reuses the existing HMM instead of rebuilding it, because it can be found by its meaning.

## What it does for the plan
Validates the story-layer's search-first reuse claim and right-sizes the investment: the payoff comes from the **nominal story tag** (name+story alone hit 1.00; adding the description didn't improve it), so the tagging agent's core job is producing a good one-line nominal identity — not verbose descriptions. Cheapest experiment, clean confirmation.

## Caveat
Small hand-authored library, one model; a production library is larger and messier, so real retrieval will be harder — but the directional advantage of meaning over tokens is unambiguous.

## Reproduce
`./run.sh v8_story_retrieval` — model gemini-2.5-flash. Prompts + responses in `results/llm_audit.jsonl`.
