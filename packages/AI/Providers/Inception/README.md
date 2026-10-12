# @memberjunction/ai-inception

MemberJunction AI provider for Inception Labs, whose Mercury models use a diffusion architecture. It ships two drivers:

- **`InceptionLLM`** (`BaseLLM`), for the Mercury chat models (`Mercury 2`, `Mercury Edit 2`) through Inception's OpenAI-compatible API at `https://api.inceptionlabs.ai/v1`. It extends `OpenAILLM` from `@memberjunction/ai-openai`, maps the effort level onto Mercury's `instant` / `low` / `medium` / `high` reasoning tiers, and does not offer tool calling.
- **`InceptionDecision`** (`BaseDecision`), for Mercury Decide on Inception's Decisions API (below).

Both use the same Inception API key.

## Decisions: Mercury Decide

`InceptionDecision` calls Inception's Decisions API, `POST https://api.inceptionlabs.ai/v1/decisions`, which serves `mercury-decide`, a diffusion-based decision model released on 2026-09-30. In MJ's catalog it is the `Mercury Decide` model. The API speaks TypeSafe's System One format exactly, so the driver extends `BaseSystemOneDecision` from `@memberjunction/ai`, which owns the request and answer mapping; the driver adds the endpoint, a check that there is a key, Inception's error messages and the classification of the statuses Inception documents.

| | |
|---|---|
| **Endpoint** | `https://api.inceptionlabs.ai/v1/decisions`. A URL passed to the constructor wins, then a credential's `endpoint`. Either is the full request URL. |
| **Key** | An Inception API key, sent as `Authorization: Bearer <key>`: the same key `Mercury 2` uses. |
| **Model** | `mercury-decide`, the row's `APIName` and the driver's default. |
| **Limits** | Up to 255 options per Choice and 10 levels per Score (set as the model's `Decision` limits). No streaming or tools. Inception documents no context window for this API. |
| **Price** | $0.02 per million input tokens, a promotional price 50% off the regular $0.04. Output tokens are reported but not charged. |

**Two routes.** The model has two Inference Provider rows:

| Vendor | Driver | APIName | Priority |
|---|---|---|---|
| Inception Labs | `InceptionDecision` (this package) | `mercury-decide` | 2 (preferred) |
| OpenRouter | `OpenRouterDecision` ([`@memberjunction/ai-openrouter`](../OpenRouter/README.md)) | `inception/mercury-decide-20260930` (pinned), 65,536-token context | 1 |

`AIDecisionRunner` sorts a model's rows by `Priority`, highest first, and takes the first one with a credential; on a failover-eligible error it moves to the next.

**Configuration.** Bind an `API Key` AI Credential to the model's `Inception Labs` Inference Provider row (or to the `Inception Labs` vendor, which also covers `Mercury 2`), or set the legacy variable:

```bash
AI_VENDOR_API_KEY__INCEPTIONDECISION=...
```

**Usage.** Name the model and the vendor through `AIDecisionRunner`, or call the driver directly:

```typescript
import { InceptionDecision } from '@memberjunction/ai-inception';

const decide = new InceptionDecision('your-inception-api-key');
const result = await decide.Decide({
    Model: 'mercury-decide',
    State: { message: 'Please refund the duplicate charge on my account.' },
    Questions: {
        billing: { Kind: 'Likelihood', Instructions: 'Is this request about billing?' },
        urgency: { Kind: 'Score', Instructions: 'How urgent is this request?', Levels: ['Can wait', 'Needs attention soon', 'Needs immediate attention'] },
    },
});
```

**As a fallback.** The shipped `Default Decision` prompt does not bind Mercury Decide, and its bindings are unchanged. Like every active `Decision` model, it joins `Default Decision`'s power-matched fallbacks once one of its rows has a credential. It is unmeasured in MJ (OpenRouter says it leads JevBench), so its `PowerRank` is 44: farther from `Default Decision`'s target rank (57) than every other shipped Decision model but SubQ Snap (43), so its two rows come after Kev-0.8B (45) and before SubQ Snap.

Existing credentials can be enough to reach it: an Inception key bound to the `Inception Labs` vendor for `Mercury 2`, or a default `API Key` credential, covers its Inception row, and an OpenRouter key set for Jev covers its OpenRouter row. On such a host `Default Decision` can send a decision's state to Inception once every earlier candidate has failed. To prevent that, set the row's `Status` to `Inactive`.

**Errors and failover.**

- A missing key fails before any request with a `NoCredentials` error that allows failover.
- The message names Inception's `error.message`, or a `422`'s FastAPI `detail[].msg`.
- A `401` is an `Authentication` error. `ErrorAnalyzer` rates it fatal, which stops the failover loop, as for every other driver.
- A `402` (billing inactive or quota exceeded) is a `NoCredit` error and a `422` (an invalid request) a `ModelError`; the driver sets these itself, so both allow failover. `ErrorAnalyzer` alone reads a `402` as `Unknown` and most `422`s as a fatal `InvalidRequest`.
- A `404` (`model_not_found`) is a `ModelError` and a `413` (`request_too_large`) an `Unknown` error; both fail over. So do a `429` and a `5xx`.

## Class Registration

- `InceptionLLM`, via `@RegisterClass(BaseLLM, 'InceptionLLM')`. The `Mercury 2` and `Mercury Edit 2` rows name it.
- `InceptionDecision`, via `@RegisterClass(BaseDecision, 'InceptionDecision')`. The `Mercury Decide` model's `Inception Labs` row names it.

## Dependencies

- `@memberjunction/ai` - Core AI abstractions, including `BaseSystemOneDecision`
- `@memberjunction/ai-openai` - `OpenAILLM`, which `InceptionLLM` extends
- `@memberjunction/global` - Class registration
