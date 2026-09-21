# @memberjunction/ai-betty

MemberJunction provider for **Betty**, the MJ-native organization-scoped assistant. Implements
`BaseLLM` against the Betty Public API v1, so an MJ prompt or agent can call Betty like any other
model.

## Relationship to `@memberjunction/ai-betty-bot`

They are different services, not two versions of one. This package exists **alongside** the legacy
one — nothing in `ai-betty-bot` changes, no deployment has to migrate, and both can run in the same
instance.

| | `BettyBotLLM` (legacy) | `BettyLLM` (this package) |
|---|---|---|
| Host | `betty-api.tasio.co` | per-customer Betty deployment |
| Auth | key → `POST /settings` → JWT → bearer JWT | key is the bearer |
| Endpoint | `POST /response` | `POST /messages` |
| Request | `{ input }` | `{ message, conversationId?, context? }` |
| Response | `{ response, references[{link,title,type}] }` | `{ conversationId, messageId, response, references[{title,url?,contentItemId?}], requestId }` |
| History | first user message only | latest user turn + prior turns as context |
| Env var | `AI_VENDOR_API_KEY__BETTYBOTLLM` | `AI_VENDOR_API_KEY__BETTYLLM` |
| Base URL | `BETTY_BOT_BASE_URL` (defaulted) | `BETTY_API_BASE_URL` (**required**) |

Migrating a deployment is repointing one `AIModelVendor.DriverClass` from `BettyBotLLM` to
`BettyLLM`; rolling back is repointing it back.

## Configuration

```bash
BETTY_API_BASE_URL=https://<host>/betty/v1      # required — include the version segment
AI_VENDOR_API_KEY__BETTYLLM=<betty api key>     # from Insights › External › API keys
```

`BETTY_API_BASE_URL` has **no default** on purpose. Betty is deployed per customer, so a default
would let a misconfigured instance answer from another tenant. Unset, the first call fails with a
message naming the variable.

The API key needs the `betty:chat` scope. Credentials can also come through MJ's credential system
(`AICredentialBinding`), which outranks the environment variable.

## Metadata

Runtime resolution is `AIModelVendor.DriverClass` → this class. You need:

1. **MJ: AI Vendors** — a vendor row
2. **MJ: AI Models** — a model row, `AIModelTypeID` = LLM
3. **MJ: AI Model Vendors** — two rows: a *Model Developer* row, and an *Inference Provider* row
   carrying `DriverClass = 'BettyLLM'` and an `APIName`

Do not create **MJ: AI Vendor Type Definitions** rows — they are migration-seeded; reference them
by `@lookup`.

## Conversation handling

Betty threads conversations server-side through `conversationId`, but `ChatParams` carries no
correlation id and a fresh provider instance is constructed per execution, so there is nothing to
thread it through. MJ owns the history instead: the **latest** user message is the turn, and
everything before it goes in `context.text` — which the API documents as advisory and explicitly
non-authorizing, so it informs the answer without widening what the credential can reach.

This is the one behaviour deliberately *not* carried over from the legacy provider, which uses
`messages.find(m => m.role === user)` — `.find` returns the first match, so a three-turn exchange
sends the opening question and discards the follow-up.

## Citations

References ride as extra choices, matching `BettyBotLLM` exactly:

- `choices[0]` — the answer
- `choices[1]` — references formatted for display
- `choices[2]` — raw JSON, `finish_reason: 'references_json'`

Kept identical so anything already parsing the legacy provider's output keeps working across a
`DriverClass` repoint.

## Limitations

- **No streaming.** `SupportsStreaming` returns `false`. The API does support SSE via
  `Accept: text/event-stream`, so this is a clean follow-up rather than a dead end.
- `SummarizeText` and `ClassifyText` are not implemented.
- Token usage is reported as zero — the endpoint does not return counts.
