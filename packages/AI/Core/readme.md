[Back to AI Framework Overview](../README.md)

# @memberjunction/ai

Core abstractions and base classes for the MemberJunction AI Framework. This package defines provider-agnostic interfaces for Large Language Models, embeddings, image generation, audio, video, reranking, and more.

**Zero MemberJunction dependencies** beyond `@memberjunction/global` (which itself has no transitive dependencies). This package works in any TypeScript or JavaScript project -- no database, no metadata layer, no MJ runtime required.

## Installation

```bash
npm install @memberjunction/ai
```

## Base Classes

Every AI capability is represented by an abstract base class. Provider packages (OpenAI, Anthropic, Gemini, etc.) extend these to implement the actual API calls.

| Class | Purpose | Key Methods |
|-------|---------|-------------|
| `BaseLLM` | Chat completions (text generation) | `ChatCompletion()`, `ChatCompletions()` (parallel batch), `GetFileCapabilities()` |
| `BaseEmbeddings` | Text & multimodal embeddings | `EmbedText()`, `EmbedTexts()`, `EmbedContent()`, `GetFileCapabilities()` |
| `BaseImageGenerator` | Image generation, editing, variations | `GenerateImage()`, `EditImage()`, `CreateVariation()` |
| `BaseTextToSpeech` | Text-to-speech (`TTS` models) | `CreateSpeech()`, `GetVoices()`, `GetModels()`, `GetPronounciationDictionaries()` |
| `BaseSpeechToText` | Speech-to-text (`Speech to Text` models) | `SpeechToText()`, `GetModels()`; oversized audio via `TranscribeAudioWithSplitting()` |
| `BaseAudioGenerator` | **Deprecated.** Both of the above on one class. Kept, and still working, for existing drivers and callers; it implements both new classes | `CreateSpeech()`, `SpeechToText()`, `GetVoices()` |
| `BaseVideoGenerator` | Avatar video generation (`Video` models) | `CreateAvatarVideo()`, `GetAvatars()` |
| `BaseReranker` | Document reranking for retrieval | `Rerank()` |
| `BaseDecision` | Typed decisions (Likelihood, Choice, Score) with a probability per answer | `Decide()` |
| `BaseRealtimeModel` | Live, full-duplex, tool-calling realtime sessions (voice, and video where the model sends or takes it) | `StartSession()`, `CreateClientSession()`, `SupportsAvatarOutput()` |

All inherit from `BaseModel`, which manages API key storage and provides the `@RegisterClass` integration point.

One additional realtime primitive lives here that is *not* a `BaseModel` capability: `BaseRealtimeChannelServer` — the server half of the realtime **interactive-channel** plugin contract (`MJ: AI Agent Channels.ServerPluginClass`), mirroring the client half (`BaseRealtimeChannelClient` in the Angular conversations package). Concrete plugins register via `@RegisterClass(BaseRealtimeChannelServer, '<key>')` and are resolved per session by `RealtimeChannelServerHost` in `@memberjunction/ai-agents`. See [guides/REALTIME_CO_AGENTS_GUIDE.md](../../../guides/REALTIME_CO_AGENTS_GUIDE.md) §5.

## Realtime Sessions

The server half of MJ's realtime contract lives here; the browser half is `BaseRealtimeClient` in `@memberjunction/ai-realtime-client`. The [Real-Time Co-Agents Guide](../../../guides/REALTIME_CO_AGENTS_GUIDE.md) explains the architecture, and its §12 walks through adding a video-capable provider.

### Sessions and the browser mint (`baseRealtime.ts`)

| Export | What it is |
|---|---|
| `BaseRealtimeModel` | A server driver. `StartSession(params)` opens a server-side session; `CreateClientSession(params)` mints a browser session when `SupportsClientDirect` is true; `SupportsAvatarOutput(model)` says whether the model renders a live avatar on the endpoint the driver serves (default `false`). Its doc header holds the 8 driver obligations |
| `RealtimeSessionParams` | What a session is opened with: model, system prompt, tools, initial context, the open config bag, and `Avatar` (`RealtimeAvatarSettings`) when the session asks for a live avatar |
| `IRealtimeSession` | The live session: `SendInput` (typed `RealtimeInputFrame`s with a media kind), `OnOutput` (audio), `OnVideoFrame` (the model's video as `RealtimeVideoFrame`s), `OnTranscript`, `OnToolCall`, `OnInterruption`, `OnUsage`, `OnError`, `Capabilities` (`RealtimeSessionCapabilities`, including the supported inbound and outbound tracks) and `AvatarStatus`. `OnVideoOutput` (untyped video bytes) is deprecated in favor of `OnVideoFrame` |
| `ClientRealtimeSessionConfig` | What a browser session is minted with: `Provider`, `Model`, `EphemeralToken`, `ExpiresAt`, the private `SessionConfig` pact, `AvatarStatus`, and how the browser reaches the provider: `Transport` (`'direct'`, the default, or `'relay'`) and `RelayUrl`. A relay session's `EphemeralToken` is empty, and its `RelayUrl` carries the relay ticket, so it is never logged. `ParseRealtimeClientTransport` reads the transport from untyped data |
| `RealtimeAvatarSettings` | An avatar request: `AvatarID` (the vendor's avatar id), `Kind` (`'preset'` or `'custom'`), `Resolution`, `Background`, `PersonaName`, `Source`, and `Delivery` (`'room'` when a server-side session's host publishes the avatar into a meeting room) |
| `RealtimeAvatarStatus`, `RealtimeAvatarUnavailableReason` | What became of a request: `Requested`, `Granted`, and why not (`endpoint`, `bridged`, `custom-disabled`, `unknown-avatar`, `no-binding`, `host`, `browser`, `decoder-missing`, `decoder-failed`, `publish-failed`). `ParseRealtimeAvatarStatus` reads the JSON form the mint result carries, accepting only reasons it knows |
| `RealtimeUsage`, `RealtimeUsageModalityDetail` | A usage update: token amounts plus a per-modality split (`TextTokens`, `AudioTokens`, `ImageTokens`, `VideoTokens`, `CachedTokens`). Inbound `VideoFrames` and `VideoSeconds` are running totals for telemetry; outbound `VideoSeconds` is the seconds of video the model generated since the last update, which consumers add up |

### The model's video output

`RealtimeVideoFrame` (`realtimeVideoOutput.ts`) is one frame of a model's video, in one of three kinds, each with `Data`, `MimeType` and optional `PresentationTimeMs`, `KeyFrame`, `Width` and `Height`:

- `'fmp4'`: a piece of fragmented MP4 as the model sent it (`Piece`: `'init'` or `'fragment'`), which may carry the voice on its audio track (a Gemini Live avatar);
- `'chunk'`: one encoded frame (H.264 in Annex B form, VP8, VP9 or AV1), with a required `PresentationTimeMs` and `KeyFrame`;
- `'image'`: one still picture (JPEG, PNG, WebP).

`PresentationTimeMs` is media time on the stream's own timeline, shared with its voice, not wall-clock time. `Fmp4PieceToVideoFrame(data, mimeType, init)` builds an fMP4 frame from a model part: the piece from its first box, an init segment's picture size, and a fragment's time and key-frame flag from its first video sample. Bytes that open with an MP4 box are a piece whatever MIME type the part names. A server session emits frames through `IRealtimeSession.OnVideoFrame`; a browser driver hands them to its video player.

### The fragmented MP4 reader (`fmp4Reader.ts`)

Pure (no DOM, no Node APIs), so the browser and the meeting bot read avatar pieces with the same code. A box whose size runs past what holds it, or a track without the boxes that identify it, reads as `null`: the reader never guesses.

| Export | What it reads |
|---|---|
| `SniffFmp4Piece(bytes)` | What a piece opens with, from its first box: `'init'` for `ftyp`, or for `moov` (an init segment sent without its `ftyp`); `'fragment'` for `moof` or `styp`; `null` for anything else, such as raw PCM |
| `ReadFmp4Init(bytes)` | The tracks an init segment declares: id, handler (`vide`, `soun`), codec as RFC 6381 writes it (`avc1.42c01f`, `mp4a.40.2`), timescale, sample defaults, and an H.264 track's size and parameter sets or an AAC track's configuration |
| `ReadFmp4Fragment(bytes, init)` | A fragment's samples: track, decode time, duration, size, key-frame flag and bytes |
| `Fmp4VideoSeconds(bytes, init)`, `Fmp4AudioSeconds(bytes, init)` | The seconds of video or audio a piece carries, from its sample durations; a session counts the avatar video it generated with the first |
| `AvccToAnnexB(data, avc)`, `AdtsHeader(aac, bytes)` | Samples turned into the streams a decoder reads: H.264 Annex B (with the parameter sets before a key frame) and AAC with an ADTS header per frame |

### Tracks, frames and meetings

- **Tracks** (`realtimeTracks.ts`): `RealtimeTrackDescriptor` (modality, direction, encoding, rate, usage basis, consent), `ResolveRequestedTracks` (what a session asks for, intersected with what the model supports), `InboundVideoStreamsOf` and `InboundVideoRateOf` (a session's inbound video limits from its capabilities), `IsPcmAudioMimeType`.
- **Still frames to the model** (`realtimeVideoFrames.ts`): `RealtimeVideoFrameIntervalMs`, `RealtimeMinVideoFrameSpacingMs` and `ScaleRealtimeVideoFrame`, the rate and size math the browser's frame sampler and the meeting bot share.
- **Meeting attributes**: `realtimeAgentVision.ts` (`mj.agentCanSee` and `mj.agentWatches`: `AllowsAgentVision`, `IsAgentWatching`, `AgentVisionAttributes`, `AgentWatchesAttributes`; only `'true'` counts as consent) and `realtimeAgentAvatar.ts` (`REALTIME_AGENT_AVATAR_TRACK_NAME`, the `agent-avatar` camera track a meeting bot shows the avatar on, and `mj.agentAvatar`: `AgentAvatarAttributes`, `AgentAvatarAudioOnlyAttributes`, `ReadAgentAvatarAttribute`).
- **Resumption** (`realtimeSessionResumption.ts`): `RealtimeSessionResumption` moves a session to a new connection with the provider's handle when the provider says the connection is ending or it drops, with retries and a deadline.

### MJAPI's realtime proxy and relay (`realtimeProxyRegistry.ts`)

`RealtimeProxyRegistry` (a `BaseSingleton`) is the shared state between a provider driver that mints and MJAPI, which serves:

- **Proxy tickets** (`Issue`, `Consume`): one-time tickets for `/realtime-proxy?ticket=<id>`, a byte tunnel to a self-hosted provider's internal endpoint.
- **Relay sessions** (`IssueRelaySession`): one ticket per browser session for `/realtime/relay/<ticket>/…`, where MJAPI holds the provider credential. A session accepts one fresh connection within `REALTIME_RELAY_OPEN_WINDOW_SECONDS` (300) of the mint, then only resumes that present a resumption handle the relay forwarded to it; at most `REALTIME_RELAY_MAX_CONNECTIONS` (10) connections; it ends after `REALTIME_RELAY_SESSION_LIFETIME_SECONDS` (1800) or the session's `MaxSessionSeconds`. Sessions live in process memory, so several MJAPI instances need sticky routing for the relay path.
- **`IRealtimeRelayPolicy`**: the provider's half of the relay, called at five points: `UpstreamHeaders` (on every upstream open), `ReadOpenIntent` (the browser's first frame: a fresh open or a resume, and whether it asks for audio only), `OpeningFrames`, `FilterClientFrame` (forward or drop each later client frame; client frames are text) and `ObserveServerFrame` (find resumption handles; server frames go to the browser unchanged). Gemini's is `GeminiLiveRelayPolicy` in `@memberjunction/ai-gemini`.
- **URLs**: `BuildRealtimeRelayUrl(baseWs, id)` puts the ticket in the path (a provider's browser SDK appends its own path), and `ResolveRealtimeProxyBaseWsUrl(params)` finds MJAPI's public websocket origin (`proxyBaseUrl` in the config bag, then `MJAPI_PUBLIC_URL`, then `GRAPHQL_BASE_URL` and `GRAPHQL_PORT`).

### Catalog settings for realtime

`ModelConfiguration.Realtime` (the catalog's per-model and per-model-vendor JSON) carries the realtime knobs the drivers read, including `TurnDetection.Coverage` (`RealtimeTurnCoverage`: `audioActivityOnly` or `audioActivityAndAllVideo`; a driver sends only what its endpoint accepts) and `Pricing.AvatarVideoOutput` (a per-minute price for generated avatar video, `{ Price, Unit: 'Per Minute', Currency }`, which prices the video on a cost line of its own).

## Type Definitions

### Chat Types

| Type | Description |
|------|-------------|
| `ChatParams` | Full parameter set for chat requests: messages, model, temperature, topP, topK, streaming, effort level, response format, and more |
| `ChatResult` | Completion result with choices, token usage, cost tracking, and timing |
| `ChatMessage` | Single message with role, content (text or multimodal blocks), and optional metadata |
| `ChatMessageContentBlock` | Multimodal content: text, image (base64/URL), video, audio, or file |
| `StreamingChatCallbacks` | Callbacks for real-time streaming: `OnContent`, `OnComplete`, `OnError` |
| `ParallelChatCompletionsCallbacks` | Callbacks for batch parallel completions |
| `ChatMessageRole` | Enum: `system`, `user`, `assistant` |
| `VolatileStateMessageMetadata` / `TrailingVolatileStateSplit` | The one metadata flag (`volatileState`) drivers and the agent layer agree on for a per-request trailing message, and the `{ head, tail }` split `BaseLLM.splitTrailingVolatileState` returns so a driver can place its cache boundary before the volatile tail (protected seam: `isVolatileStateMessage`, `trailingVolatileStateIndex`, `splitTrailingVolatileState`) |

### Embedding Types

| Type | Description |
|------|-------------|
| `EmbedTextParams` / `EmbedTextResult` | Single text embedding request and response |
| `EmbedTextsParams` / `EmbedTextsResult` | Batch text embedding request and response |
| `EmbedContentParams` / `EmbedContentResult` | Multimodal embedding request (text and/or interleaved media blocks fused into one vector) and response. `EmbedContent()` is non-abstract — it defaults to `EmbedText` for text-only content; multimodal providers override it. Supported media is declared per provider via `GetFileCapabilities()` |

### Other Types

| Type | Description |
|------|-------------|
| `ImageGenerationParams` / `ImageGenerationResult` | Image generation parameters and results |
| `SummarizeParams` / `SummarizeResult` | Text summarization (deprecated) |
| `ClassifyParams` / `ClassifyResult` | Text classification (deprecated) |
| `RerankParams` / `RerankResult` | Document reranking |
| `DecisionParams` / `DecisionResult` | Typed decision parameters and structured results with probabilities |
| `ModelUsage` | Token counts and cost tracking (prompt tokens, completion tokens, total cost, currency) |
| `AIModelConfiguration` / `LLMConfigurationSettings` / `IsPrefixPromptCache` | The model catalog's `ModelConfiguration` JSONType bag (Model Types < Models < the vendor's `Configuration.ModelDefaults` (`AIVendorConfiguration`, parsed by `ParseVendorConfiguration`) < Model Vendors, resolved by `ResolveEffectiveModelConfiguration`). `LLMConfigurationSettings.PrefixPromptCache` (read via `IsPrefixPromptCache`) says whether a serving path's prompt cache is an exact byte-prefix match (OpenAI, xAI — set once under the vendor row's `Configuration.ModelDefaults`, inherited by every model it serves) rather than block/segment based, which decides whether the agent layer appends or replaces its trailing runtime-state message |
| `BaseResult` | Common result base with success flag, timing, and error info |
| `FileCapabilities` | Declares which non-text inputs a provider accepts: `SupportedMimeTypes` (e.g. `image/png`, `audio/mp3`, supports `image/*` wildcards), `MaxFileSize`, `MaxFilesPerRequest`, `HasFileAPI`. Returned by `GetFileCapabilities()` on `BaseLLM` (file inputs to chat) and `BaseEmbeddings` (media inputs to `EmbedContent`); `null` means text-only |

## Utilities

| Export | Description |
|--------|-------------|
| `AIAPIKeys` / `GetAIAPIKey()` | API key resolution from environment variables (`AI_VENDOR_API_KEY__<DRIVER>`) with optional runtime overrides |
| `AICredentialScope` / `CredentialScopeAllows()` | Which credential sources (`'Runtime'`, `'PlatformCredential'`, `'Environment'`) a run's scope (`'Any'` or `'RuntimeOnly'`) may use — the one place that decision is made |
| `ErrorAnalyzer` | Classifies provider errors into structured types with severity, retry hints, and failover recommendations |
| `AIErrorInfo` / `AIErrorType` | Structured error types: rate limit, authentication, context length, content filter, etc. |
| `serializeMessageContent()` / `deserializeMessageContent()` | Content block serialization for database storage |
| `parseBase64DataUrl()` / `createBase64DataUrl()` | Base64 data URL utilities |

## Usage Examples

### Chat Completion

```typescript
import { ChatParams, ChatMessageRole } from "@memberjunction/ai";
import { OpenAILLM } from "@memberjunction/ai-openai";

const llm = new OpenAILLM("your-api-key");

const result = await llm.ChatCompletion({
    model: "gpt-4.1",
    messages: [
        { role: ChatMessageRole.system, content: "You are a helpful assistant." },
        { role: ChatMessageRole.user, content: "What is the capital of France?" },
    ],
    temperature: 0.7,
    maxOutputTokens: 500,
});

console.log(result.data.choices[0].message.content);
```

### Streaming

```typescript
await llm.ChatCompletion({
    model: "gpt-4.1",
    messages: [{ role: ChatMessageRole.user, content: "Explain quantum computing." }],
    streaming: true,
    streamingCallbacks: {
        OnContent: (chunk, isComplete) => process.stdout.write(chunk),
        OnComplete: (result) => console.log("\nDone!"),
        OnError: (error) => console.error("Stream error:", error),
    },
});
```

### Parallel Completions

```typescript
const paramSets = [
    { ...base, temperature: 0.3 },
    { ...base, temperature: 0.7 },
    { ...base, temperature: 1.0 },
];

const results = await llm.ChatCompletions(paramSets, {
    OnCompletion: (result, index) => console.log(`Completion ${index} done`),
    OnAllCompleted: (results) => console.log(`All ${results.length} complete`),
});
```

### Multimodal Content

```typescript
const result = await llm.ChatCompletion({
    model: "gpt-4.1",
    messages: [{
        role: ChatMessageRole.user,
        content: [
            { type: "text", content: "What is in this image?" },
            { type: "image_url", content: "data:image/png;base64,..." },
        ],
    }],
});
```

### Text Embeddings

```typescript
import { OpenAIEmbedding } from "@memberjunction/ai-openai";

const embedder = new OpenAIEmbedding("your-api-key");
const result = await embedder.EmbedText({
    model: "text-embedding-3-small",
    text: "Sample text to embed",
});
console.log(`Dimensions: ${result.vector.length}`);
```

### API Key Resolution

```typescript
import { GetAIAPIKey } from "@memberjunction/ai";

// Reads AI_VENDOR_API_KEY__OPENAILLM from environment
const key = GetAIAPIKey("OpenAILLM");

// With runtime override
const key2 = GetAIAPIKey("AnthropicLLM", [
    { driverClass: "AnthropicLLM", apiKey: "sk-ant-..." },
]);

// Restricted to the runtime keys: no environment fallback for a class the list lacks
const key3 = GetAIAPIKey("OpenAILLM", runKeys, false, 'RuntimeOnly'); // undefined unless runKeys has OpenAILLM
```

## Implementing a New Provider

Extend the base class for the capability you want to support:

```typescript
import { BaseLLM, ChatParams, ChatResult, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseLLM, "MyProviderLLM")
export class MyProviderLLM extends BaseLLM {
    // Required: implement non-streaming chat
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        // Your API call here
    }

    // Required by BaseLLM but deprecated: new drivers should throw a "not supported" error
    public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> { /* ... */ }

    // Required by BaseLLM but deprecated: new drivers should throw a "not supported" error
    public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> { /* ... */ }

    // Optional: enable streaming by overriding these
    public get SupportsStreaming(): boolean { return true; }
    protected async createStreamingRequest(params: ChatParams): Promise<AsyncIterable<unknown>> { /* ... */ }
    protected processStreamingChunk(chunk: unknown): { content: string } { /* ... */ }
    protected finalizeStreamingResponse(content: string, lastChunk: unknown, usage: unknown): ChatResult { /* ... */ }
}
```

See the [full provider list](../Providers/README.md) for working examples across 25+ implementations.

## Dependencies

| Package | Purpose |
|---------|---------|
| `@memberjunction/global` | Class factory and global utilities (zero transitive dependencies) |
| `dotenv` | Environment variable loading |
| `rxjs` | Reactive extensions (internal use) |

## Related Packages

- **[AI Framework Overview](../README.md)** -- Architecture, provider matrix, and quick start
- **[Providers](../Providers/README.md)** -- All 25+ provider implementations
- **[Prompts](../Prompts/README.md)** -- MJ-integrated prompt template engine
- **[Agents](../Agents/README.md)** -- Agent execution framework
