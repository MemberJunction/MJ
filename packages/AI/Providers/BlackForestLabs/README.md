# @memberjunction/ai-blackforestlabs

MemberJunction AI provider for Black Forest Labs' FLUX image generation models. This package implements the `BaseImageGenerator` interface to provide text-to-image generation, image editing (inpainting/outpainting), and image variations through BFL's async task-based API.

## Architecture

```mermaid
graph TD
    A["FLUXImageGenerator<br/>(Provider)"] -->|extends| B["BaseImageGenerator<br/>(@memberjunction/ai)"]
    A -->|submits tasks| C["BFL REST API"]
    A -->|polls| D["Result Endpoint"]
    D -->|returns| E["Image URL"]
    A -->|downloads| F["Generated Image"]
    B -->|registered via| G["@RegisterClass"]

    style A fill:#7c5295,stroke:#563a6b,color:#fff
    style B fill:#2d6a9f,stroke:#1a4971,color:#fff
    style C fill:#2d8659,stroke:#1a5c3a,color:#fff
    style D fill:#2d8659,stroke:#1a5c3a,color:#fff
    style E fill:#b8762f,stroke:#8a5722,color:#fff
    style F fill:#2d6a9f,stroke:#1a4971,color:#fff
    style G fill:#b8762f,stroke:#8a5722,color:#fff
```

## Async Task Flow

```mermaid
sequenceDiagram
    participant App as Application
    participant FLUX as FLUXImageGenerator
    participant BFL as BFL API

    App->>FLUX: GenerateImage(params)
    FLUX->>BFL: POST /flux-2-pro (submit task)
    BFL-->>FLUX: { id: "task-123", polling_url: "https://api.bfl.ai/v1/get_result?id=task-123", cost: 4 }
    loop Poll polling_url until ready
        FLUX->>BFL: GET polling_url (or /get_result?id=task-123)
        BFL-->>FLUX: { status: "Pending" }
    end
    BFL-->>FLUX: { status: "Ready", cost: 4, result: { sample: "url" } }
    FLUX->>BFL: Download image from signed URL
    BFL-->>FLUX: Image data
    FLUX-->>App: ImageGenerationResult (with usage.cost in USD)
```

## Features

- **Text-to-Image Generation**: Generate photorealistic images using FLUX.2 Pro, FLUX 1.1 Pro, and other FLUX models
- **Image Editing**: Inpainting and outpainting via FLUX Fill model with mask support
- **Image Variations**: Create variations using FLUX Kontext Pro for image-to-image generation
- **Async Task Polling**: Configurable polling with adjustable interval and timeout
- **Multiple Models**: Support for FLUX.2 Pro (32B), FLUX 1.1 Pro, FLUX Dev, and FLUX Ultra
- **Seed Reproducibility**: Deterministic generation with seed parameter support
- **Resolution Control**: Custom width/height and aspect ratio settings up to 4MP

## Installation

```bash
npm install @memberjunction/ai-blackforestlabs
```

## Usage

```typescript
import { FLUXImageGenerator } from '@memberjunction/ai-blackforestlabs';

const generator = new FLUXImageGenerator('your-bfl-api-key');

const result = await generator.GenerateImage({
    prompt: 'A serene mountain landscape at sunset',
    model: 'flux-2-pro',
    size: '1536x1024'
});

if (result.success) {
    const image = result.images[0];
    console.log('Image generated, base64 length:', image.base64.length);
}
```

### Configure Polling

```typescript
generator.setPollingConfig({
    maxWaitTime: 180000,  // 3 minutes
    pollInterval: 3000     // 3 seconds
});
```

## Supported Models

| Model | ID | Modality | Description |
|-------|-----|----------|-------------|
| FLUX 3 Image | `flux-3-image` | Image | Up to 4K resolution, 16 aspect ratios, and up to 10 reference images |
| FLUX 3 Video | `flux-3-video` | Video | Text-to-video and image-to-video (5–20s), continuation via `v2v` (5–15s); API supports `hd`..`uhd` (driver maps `Quality` up to `qhd`) with optional native audio; driver refuses `VideoToVideo` and measures MP4 bytes for C2PA |
| FLUX.2 Pro | `flux-2-pro` | Image | 32B parameter, photorealistic 4MP images |
| FLUX 1.1 Pro | `flux-1.1-pro` | Image | Production-ready, high-volume workloads |
| FLUX.1 Dev | `flux-dev` | Image | Open-weights 12B for development |
| FLUX Ultra | `flux-ultra` | Image | Ultra-high quality |

## Class Registration

- Image generator: registered as `FLUXImageGenerator` via `@RegisterClass(BaseImageGenerator, 'FLUXImageGenerator')`.
- Video generator: registered as `FLUX3VideoGenerator` via `@RegisterClass(BaseVideoGenerator, 'FLUX3VideoGenerator')`.

## Verified against BFL docs

- **Verification date**: `2026-10-16`
- **Documentation URLs read**:
  - `https://docs.bfl.ai/flux_3/flux3_overview` (`flux_3/flux3_overview.md`)
  - `https://docs.bfl.ai/flux_3/flux3_video` (`flux_3/flux3_video.md`)
  - `https://docs.bfl.ai/flux_3/flux3_image` (`flux_3/flux3_image.md`)
  - `https://docs.bfl.ai/flux_3/flux3_image_generate` (`flux_3/flux3_image_generate.md`)
  - `https://docs.bfl.ai/flux_tools/flux_video_edit` (`flux_tools/flux_video_edit.md`)
  - `https://docs.bfl.ai/cookbook/video_quickstart` (`cookbook/video_quickstart.md`)
  - `https://docs.bfl.ai/cookbook/video_edit_recast_continue` (`cookbook/video_edit_recast_continue.md`)
  - `https://docs.bfl.ai/api_integration/integration_guidelines` (`api_integration/integration_guidelines.md`)
  - `https://docs.bfl.ai/api-reference/utility/generate-a-video-with-flux-3` (`api-reference/utility/generate-a-video-with-flux-3.md`)
  - `https://docs.bfl.ai/api-reference/utility/generate-an-image-with-flux-3` (`api-reference/utility/generate-an-image-with-flux-3.md`)
  - `https://docs.bfl.ai/api-reference/utility/get-result` (`api-reference/utility/get-result.md`)
  - `https://docs.bfl.ai/flux_2/flux2_text_to_image` (`flux_2/flux2_text_to_image.md`)
  - `https://bfl.ai/pricing` (`1 credit = $0.01 USD`)
- **Endpoints & Authentication**:
  - Base URLs: `https://api.bfl.ai/v1` (global), `https://api.eu.bfl.ai/v1`, `https://api.us.bfl.ai/v1`
  - Auth header on submit and poll: `x-key: <BFL_API_KEY>` (never sent when downloading signed delivery URLs on `delivery.*.bfl.ai`)
  - FLUX 3 Video submit: `POST /v1/flux-3-video`
  - FLUX 3 Image submit: `POST /v1/flux-3-image`
  - FLUX.2 Pro submit: `POST /v1/flux-2-pro`
  - Result polling: `GET <polling_url>` from submit response (validated to be `https:` and hostname ending in `.bfl.ai`), or fallback `GET /v1/get_result?id=<id>` when `polling_url` is omitted
- **FLUX 3 Video (`Flux3VideoInputsBody`, `additionalProperties: false`) parameters & limits**:
  - `mode`: `'t2v' | 'i2v' | 'v2v'` (required; `'v2v'` on `/v1/flux-3-video` is video continuation via `start_video`, whereas video editing is a separate endpoint `/v1/flux-tools/video-edit-v1`; `FLUX3VideoGenerator` refuses `Mode: 'VideoToVideo'`)
  - `prompt`: string (required)
  - `resolution`: `'hd' | 'fhd' | 'qhd' | 'uhd'` (API schema default `'hd'`; driver maps `Quality`: `'draft' -> 'hd' + draft: true`, `'standard' -> 'fhd'`, `'high' -> 'qhd'`)
  - `aspect_ratio`: `'auto' | '21:9' | '2:1' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '9:21'` (API schema default `'auto'`; driver requires one of the 8 fixed ratios so pixel dimensions are known; `'4:5'` is not supported)
  - `duration`: `'auto'` or integer `5..20` seconds for `'t2v'` and `'i2v'`; `5..15` seconds for `'v2v'` (API schema default `'auto'`; driver requires an integer in `5..20` for `'t2v'`/`'i2v'` or `5..15` for `'v2v'`)
  - `generate_audio`: boolean (BFL API defaults to `true`; `FLUX3VideoGenerator` always sends `generate_audio: params.WantAudio === true` so omitted `WantAudio` never bills for audio)
  - `draft`: boolean (optional; set to `true` for `'draft'` quality tier)
  - `keyframes`: `Array<[number, string]> | string[]` (`1..10` items; required in `'i2v'` mode; timestamped `[seconds, image]` pairs with `0 <= seconds <= duration` or plain base64/HTTPS URL strings)
  - `start_video`: string (`'v2v'` continuation mode only; base64 or HTTPS URL; `mp4`; ≤50 MB; ≤15s per `cookbook/video_edit_recast_continue.md`)
  - `safety_tolerance`: integer `0..7` (default `2`)
  - `user`, `version`: optional strings in the `t2v`/`i2v`/`v2v` input schemas (`webhook_url` and `webhook_secret` are not in the `t2v`/`i2v`/`v2v` input schemas)
  - Does not accept `seed`, `fps`, `width`, or `height`.
- **FLUX 3 Video 8×4 Dimension Lookup Table (`FLUX3_VIDEO_DIMENSIONS`, `width × height`)**:

| Aspect Ratio | `hd` (720p) | `fhd` (1080p) | `qhd` (1440p) | `uhd` (4K) |
|---|---|---|---|---|
| `21:9` | `1440×608` | `2176×928` | `2912×1248` | `4352×1856` |
| `2:1` | `1344×672` | `2016×1024` | `2720×1376` | `4032×2048` |
| `16:9` | `1280×704` | `1920×1088` | `2560×1440` | `3840×2176` |
| `4:3` | `1088×800` | `1632×1216` | `2176×1632` | `3264×2432` |
| `1:1` | `960×960` | `1440×1440` | `1920×1920` | `2880×2880` |
| `3:4` | `800×1088` | `1216×1632` | `1632×2176` | `2432×3264` |
| `9:16` | `704×1280` | `1088×1920` | `1440×2560` | `2176×3840` |
| `9:21` | `608×1440` | `928×2176` | `1248×2912` | `1856×4352` |

- **FLUX 3 Image (`Flux3ImageInputs`, `additionalProperties: false`) parameters & limits**:
  - `prompt`: string (required)
  - `images`: string[] | null (optional; up to `10` reference images)
  - `aspect_ratio`: `'auto' | '21:9' | '2:1' | '16:9' | '3:2' | '7:5' | '4:3' | '5:4' | '1:1' | '4:5' | '3:4' | '5:7' | '2:3' | '9:16' | '1:2' | '9:21'` (API schema default `'auto'`; driver omits `aspect_ratio` when no dimensions or aspect ratio are specified so BFL uses `'auto'`)
  - `resolution`: `'768sq' | '1k' | '1.5k' | '2k' | '4k'` (default `'1k'`)
  - `grounding`: boolean (BFL API defaults to `true`; `FLUXImageGenerator` always sets `grounding: false` so image generation never makes unsolicited web searches)
  - `safety_tolerance`: integer `0..7` (default `2`)
  - Does not accept `width`, `height`, `seed`, or `output_format`.
- **Polling Statuses (`StatusResponse` — 9 values)**:
  - Active: `'Pending'`, `'Reasoning'`, `'Generating'`
  - Success: `'Ready'` (`result.sample` contains the signed delivery URL)
  - Terminal failures: `'Error'`, `'Request Moderated'`, `'Content Moderated'`, `'No Card Generated'` (surfaces `details['Moderation Reasons']` when present), `'Task not found'`
- **Pricing Status (`bfl.ai/pricing`, `1 credit = $0.01 USD`)**:
  - Submit responses include initial `cost` (credits) and `/v1/get_result` includes settled `cost` (credits) on `'Ready'`. Both drivers convert `(pollResult.cost ?? submitResult.cost) / 100` to USD on `ModelUsage`.
  - Published **FLUX 3 Video** credits per output second on `bfl.ai/pricing`:
    - Draft 720p (`hd`): `6` credits/s (`$0.06/s`)
    - Standard `t2v` / `i2v`: 720p (`hd`) `15` credits/s (`$0.15/s`), 1080p (`fhd`) `24` credits/s (`$0.24/s`), 1440p (`qhd`) `28` credits/s (`$0.28/s`), 2160p (`uhd`) `41` credits/s (`$0.41/s`)
    - Video-to-video (`v2v` continuation): 720p (`hd`) `21` credits/s (`$0.21/s`), 1080p (`fhd`) `27` credits/s (`$0.27/s`), 1440p (`qhd`) `31` credits/s (`$0.31/s`), 2160p (`uhd`) `45` credits/s (`$0.45/s`)
  - Published **FLUX 3 Image** rates per image on `bfl.ai/pricing`: `768×768` `$0.041`, `1K` `$0.048`, `1.5K` `$0.07`, `2K` `$0.10`, `4K` `$0.607` (reference images and prompts are not charged extra).
- **Delivery URL Expiry Conflict**:
  - BFL's documentation states three different expiry windows for signed `result.sample` delivery URLs: **10 minutes** (integration guide), **~1 hour** (FLUX 3 text-to-image and Video Edit pages), and **~2 hours** (video quickstart and FLUX 3 overview). Both drivers download bytes immediately upon `'Ready'` and never persist `result.sample`.
- **C2PA Provenance**:
  - BFL's help center documents C2PA embedding for API images only (nothing in BFL's docs states C2PA for video). `FLUX3VideoGenerator` measures the downloaded MP4 bytes at runtime with `HasC2PAManifest(bytes)` (top-level ISO-BMFF `uuid` box with extended type `d8fec3d6-1b0e-483c-9297-5828877ec481`, C2PA 2.2 §A.5.1.1) and sets `result.Provenance = { C2PA: HasC2PAManifest(bytes) }`.

## Opt-in Live Smoke Test (Run Only With Explicit Approval)

Automated test suites in CI and local builds never make live network calls to BFL. To run a live end-to-end smoke check (only with explicit approval from Colin):

- **Prerequisites**:
  1. `metadata/prompts/.default-generative-video-prompt.json` (`VS-GEN-2`) and the active `FLUX 3 Video` model + `Per Second` price unit (`VS-GEN-4`) are synced to the target SQL Server database.
  2. Standard MJ database environment variables (`DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`) and `BFL_API_KEY` are set.
  3. Run from `packages/AI/Prompts` (after building `@memberjunction/ai-blackforestlabs` and `@memberjunction/ai-prompts`).
- **Expected spend**: 1 draft 5-second 720p (`hd`) clip ≈ **30 credits (`$0.30 USD`)** at `bfl.ai/pricing`'s draft rate of 6 credits/s.

```bash
cd packages/AI/Prompts
node --input-type=module -e '
import { writeFileSync } from "node:fs";
import sql from "mssql";
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from "@memberjunction/sqlserver-dataprovider";
import { RunView } from "@memberjunction/core";
import { AIEngine } from "@memberjunction/aiengine";
import { AIVideoRunner } from "@memberjunction/ai-prompts";
import "@memberjunction/ai-blackforestlabs";

const pool = new sql.ConnectionPool({
    server: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 1433),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true },
});
await pool.connect();
await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA ?? "__mj"));

const user = UserCache.Instance.Users[0];
await AIEngine.Instance.Config(false, user);

const runner = new AIVideoRunner();
const result = await runner.RunGenerateVideo({
    Prompt: "A calm ocean wave rolling onto a sandy beach at sunrise",
    Mode: "TextToVideo",
    DurationSeconds: 5,
    AspectRatio: "16:9",
    Quality: "draft",
    WantAudio: false,
    ContextUser: user,
    CredentialScope: "RuntimeOnly",
    APIKeys: [{ driverClass: "FLUX3VideoGenerator", apiKey: process.env.BFL_API_KEY }],
});

if (!result.Success || !result.Video?.Data?.length) {
    console.error("Smoke test failed:", result.ErrorMessage);
    process.exit(1);
}

writeFileSync("/tmp/flux3-smoke.mp4", result.Video.Data);
console.log("Saved /tmp/flux3-smoke.mp4", {
    bytes: result.Video.Data.length,
    width: result.Video.Width,
    height: result.Video.Height,
    durationSeconds: result.Video.DurationSeconds,
    c2pa: result.C2PA,
    promptRunId: result.PromptRunID,
});

const rv = new RunView();
const runRes = await rv.RunView({
    EntityName: "MJ: AI Prompt Runs",
    ExtraFilter: `ID = '\''${result.PromptRunID}'\''`,
    Fields: ["ID", "Success", "Cost", "CostCurrency", "TokensUsedRollup"],
    ResultType: "simple",
}, user);
console.log("PromptRun row:", runRes.Results[0]);
await pool.close();
process.exit(0);
'
```
Then open `/tmp/flux3-smoke.mp4` to verify playback and confirm `PromptRun row` has a non-null `Cost` (`~0.30` USD).

## Dependencies

- `@memberjunction/ai` - Core AI abstractions (BaseImageGenerator, BaseVideoGenerator, GeneratedImage)
- `@memberjunction/global` - Class registration
