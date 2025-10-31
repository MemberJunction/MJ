# Opus Clip Integration Proposal for MemberJunction

## Executive Summary

This document proposes integrating [Opus Clip](https://www.opus.pro) - an AI-powered video clipping service - into MemberJunction's action framework. The integration will enable agents and users to automatically transform long-form videos into viral short-form clips at scale, with clips saved to any of MJ's 7 supported cloud storage providers.

---

## Opus Clip Overview

### What is Opus Clip?

Opus Clip is an AI video clipping service that automatically generates short-form viral clips from long-form videos (YouTube links or uploaded files). It:
- Analyzes video content to identify compelling moments
- Generates clips optimized for social media
- Adds captions, highlights, and branding
- Supports 20+ languages
- Processes up to 10-hour videos (30 GB max)

### API Capabilities

**Base URL:** `https://api.opus.pro`

**Authentication:** Bearer token (API key from dashboard)

**Rate Limits:**
- 30 requests/minute per API key
- Up to 50 concurrent projects
- Projects expire after 30 days

**Pricing:** 1 credit = 1 minute of video processing

**Key Endpoints:**
1. **Upload & Create Project** - Submit videos for processing
2. **Get Clips** - Retrieve generated clips by project/collection
3. **Export Collection** - Export multiple clips with download URLs
4. **Brand Templates** - Customize clip appearance
5. **Share Project** - Set project visibility
6. **Webhooks** - Real-time project completion notifications

---

## Current Gaps: No Official TypeScript SDK

**Finding:** Opus Clip does NOT provide an official TypeScript/JavaScript SDK. The API must be accessed via direct REST calls.

**Implication:** We need to build our own TypeScript wrapper class to encapsulate API interactions.

---

## Proposed Architecture

### 1. Core OpusClipClient Class

Create a comprehensive TypeScript client in `packages/MJStorage/src/integrations/OpusClipClient.ts` (or new package `@memberjunction/opus-clip`):

```typescript
/**
 * TypeScript client for Opus Clip API
 *
 * Handles video upload, clip generation, and retrieval of processed clips
 */
export class OpusClipClient {
    private apiKey: string;
    private baseUrl = 'https://api.opus.pro';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    // Core methods:
    async uploadVideo(file: Buffer, options?: VideoUploadOptions): Promise<UploadResult>
    async createProjectFromYouTube(youtubeUrl: string, options?: ProjectOptions): Promise<ProjectResult>
    async createProjectFromUrl(videoUrl: string, options?: ProjectOptions): Promise<ProjectResult>
    async getProjectStatus(projectId: string): Promise<ProjectStatus>
    async getClips(projectId: string): Promise<ClipInfo[]>
    async exportCollection(collectionId: string): Promise<ExportedClip[]>
    async downloadClip(clipUrl: string): Promise<Buffer>

    // Helper methods:
    async waitForProjectCompletion(projectId: string, pollInterval?: number): Promise<void>
    async setupWebhook(webhookUrl: string, projectId: string): Promise<void>
}
```

**Key Features:**
- Encapsulates all API complexity
- Strong TypeScript typing
- Error handling and retries
- Webhook support for async notifications
- Polling helper for project completion

### 2. Integration with MJ Storage

Create `OpusClipStorageManager` to bridge Opus Clip → MJ Storage:

```typescript
/**
 * Manages saving Opus Clip outputs to MJ cloud storage providers
 */
export class OpusClipStorageManager {
    private opusClient: OpusClipClient;
    private storage: FileStorageBase;

    constructor(
        opusApiKey: string,
        storageProvider: FileStorageProviderEntity
    ) {
        this.opusClient = new OpusClipClient(opusApiKey);
        this.storage = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(
            FileStorageBase,
            storageProvider.ServerDriverKey
        );
    }

    /**
     * Complete workflow: Upload → Process → Save to Storage
     */
    async processAndSaveVideo(
        input: VideoInput,
        options: ProcessingOptions
    ): Promise<ProcessingResult> {
        // 1. Create project (YouTube URL or upload file)
        const project = await this.createProject(input, options);

        // 2. Wait for completion (polling or webhook)
        await this.opusClient.waitForProjectCompletion(project.projectId);

        // 3. Get generated clips
        const clips = await this.opusClient.getClips(project.projectId);

        // 4. Download and save to cloud storage
        const savedClips = await this.saveClipsToStorage(clips, options);

        return {
            projectId: project.projectId,
            clips: savedClips,
            success: true
        };
    }

    /**
     * Save selected clips to cloud storage
     */
    async saveClipsToStorage(
        clips: ClipInfo[],
        options: StorageOptions
    ): Promise<SavedClip[]> {
        const savedClips: SavedClip[] = [];

        for (const clip of clips) {
            // Download clip from Opus Clip
            const clipBuffer = await this.opusClient.downloadClip(clip.exportUrl);

            // Generate storage path
            const storagePath = `opus-clips/${options.projectId}/${clip.clipId}.mp4`;

            // Upload to cloud storage
            await this.storage.PutObject(
                storagePath,
                clipBuffer,
                'video/mp4',
                {
                    opusProjectId: options.projectId,
                    clipId: clip.clipId,
                    duration: clip.duration,
                    viralScore: clip.viralScore,
                    processedAt: new Date().toISOString()
                }
            );

            // Create download URL
            const downloadUrl = await this.storage.CreatePreAuthDownloadUrl(storagePath);

            savedClips.push({
                clipId: clip.clipId,
                storagePath,
                downloadUrl,
                metadata: clip
            });
        }

        return savedClips;
    }
}
```

### 3. MemberJunction Actions ("Verbs")

Create discrete actions in `packages/Actions/CoreActions/src/custom/opus-clip/`:

#### **Action 1: Create Opus Clip Project**

**Purpose:** Submit a video for clip generation

**Parameters:**
- **Input:**
  - `VideoSource` (string, required): 'YouTube' or 'Upload' or 'URL'
  - `YouTubeURL` (string, conditional): Required if VideoSource='YouTube'
  - `VideoURL` (string, conditional): Required if VideoSource='URL'
  - `VideoFile` (string, conditional): File path if VideoSource='Upload'
  - `OpusAPIKey` (string, required): Opus Clip API key
  - `ClipDurationMin` (number, optional): Min clip length in seconds (default: 30)
  - `ClipDurationMax` (number, optional): Max clip length in seconds (default: 90)
  - `SourceLanguage` (string, optional): Video language (default: auto-detect)
  - `EnableJumpcut` (boolean, optional): Auto-edit silence (default: true)

- **Output:**
  - `ProjectID` (string): Opus Clip project identifier
  - `Status` (string): 'Processing' or 'Completed' or 'Failed'
  - `EstimatedCompletionTime` (string): ISO timestamp
  - `CreditsUsed` (number): Credits consumed

**Result Codes:**
- `SUCCESS` - Project created successfully
- `INVALID_VIDEO_SOURCE` - VideoSource invalid
- `MISSING_VIDEO_INPUT` - Required video input missing
- `UPLOAD_FAILED` - File upload failed
- `API_ERROR` - Opus Clip API error
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `INSUFFICIENT_CREDITS` - Not enough Opus credits

**Implementation:**
```typescript
@RegisterClass(BaseAction, "Create Opus Clip Project")
export class CreateOpusClipProjectAction extends BaseAction {
    protected async InternalRunAction(
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        try {
            const apiKey = this.getParamValue(params, 'opusapikey');
            const videoSource = this.getParamValue(params, 'videosource');

            // Validate inputs
            if (!apiKey) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: 'OpusAPIKey is required'
                };
            }

            const client = new OpusClipClient(apiKey);
            let project: ProjectResult;

            // Create project based on source
            if (videoSource === 'YouTube') {
                const youtubeUrl = this.getParamValue(params, 'youtubeurl');
                if (!youtubeUrl) {
                    return {
                        Success: false,
                        ResultCode: 'MISSING_VIDEO_INPUT',
                        Message: 'YouTubeURL required for YouTube source'
                    };
                }

                project = await client.createProjectFromYouTube(youtubeUrl, {
                    clipDurationMin: this.getNumericParam(params, 'clipdurationmin', 30),
                    clipDurationMax: this.getNumericParam(params, 'clipdurationmax', 90),
                    sourceLanguage: this.getParamValue(params, 'sourcelanguage'),
                    enableJumpcut: this.getBooleanParam(params, 'enablejumpcut', true)
                });

            } else if (videoSource === 'Upload') {
                // Handle file upload
                // ...
            } else if (videoSource === 'URL') {
                // Handle URL
                // ...
            } else {
                return {
                    Success: false,
                    ResultCode: 'INVALID_VIDEO_SOURCE',
                    Message: 'VideoSource must be YouTube, Upload, or URL'
                };
            }

            // Add output parameters
            params.Params.push(
                { Name: 'ProjectID', Type: 'Output', Value: project.projectId },
                { Name: 'Status', Type: 'Output', Value: project.status },
                { Name: 'EstimatedCompletionTime', Type: 'Output', Value: project.estimatedCompletion },
                { Name: 'CreditsUsed', Type: 'Output', Value: project.creditsUsed }
            );

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Opus Clip project ${project.projectId} created successfully`,
                Params: params.Params
            };

        } catch (error) {
            return {
                Success: false,
                ResultCode: 'API_ERROR',
                Message: `Failed to create project: ${error.message}`
            };
        }
    }
}
```

---

#### **Action 2: Check Opus Clip Project Status**

**Purpose:** Poll project processing status

**Parameters:**
- **Input:**
  - `ProjectID` (string, required): Opus project ID
  - `OpusAPIKey` (string, required): API key

- **Output:**
  - `Status` (string): 'Processing', 'Completed', 'Failed'
  - `Progress` (number): Percentage complete (0-100)
  - `ClipCount` (number): Number of clips generated
  - `ErrorMessage` (string): Error if failed

**Result Codes:**
- `SUCCESS` - Status retrieved
- `PROJECT_NOT_FOUND` - Invalid project ID
- `API_ERROR` - API failure

---

#### **Action 3: Get Opus Clip Results**

**Purpose:** Retrieve all clips from a completed project

**Parameters:**
- **Input:**
  - `ProjectID` (string, required): Opus project ID
  - `OpusAPIKey` (string, required): API key
  - `MinViralScore` (number, optional): Filter clips by score (0-100)

- **Output:**
  - `Clips` (JSON array): Array of clip metadata
    - Each clip: `{ clipId, duration, viralScore, exportUrl, thumbnailUrl }`
  - `TotalClips` (number): Total clips available

**Result Codes:**
- `SUCCESS` - Clips retrieved
- `PROJECT_NOT_FOUND` - Invalid project
- `PROJECT_NOT_COMPLETED` - Still processing
- `NO_CLIPS_FOUND` - No clips generated

---

#### **Action 4: Save Opus Clips to Storage**

**Purpose:** Download clips and save to MJ cloud storage

**Parameters:**
- **Input:**
  - `ProjectID` (string, required): Opus project ID
  - `OpusAPIKey` (string, required): API key
  - `StorageProviderID` (string, required): MJ storage provider ID
  - `ClipIDs` (JSON array, optional): Specific clips to save (default: all)
  - `StorageFolder` (string, optional): Base folder (default: 'opus-clips/{projectId}')
  - `MinViralScore` (number, optional): Only save clips above score

- **Output:**
  - `SavedClips` (JSON array): Array of saved clip info
    - Each: `{ clipId, storagePath, downloadUrl, viralScore }`
  - `TotalSaved` (number): Count of saved clips
  - `TotalBytes` (number): Total storage used

**Result Codes:**
- `SUCCESS` - All clips saved
- `PARTIAL_SUCCESS` - Some clips failed
- `STORAGE_PROVIDER_NOT_FOUND` - Invalid provider
- `DOWNLOAD_FAILED` - Couldn't download clips
- `UPLOAD_FAILED` - Couldn't save to storage
- `PROJECT_NOT_COMPLETED` - Wait for processing

**Implementation:**
```typescript
@RegisterClass(BaseAction, "Save Opus Clips to Storage")
export class SaveOpusClipsToStorageAction extends BaseAction {
    protected async InternalRunAction(
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        try {
            const projectId = this.getParamValue(params, 'projectid');
            const apiKey = this.getParamValue(params, 'opusapikey');
            const providerId = this.getParamValue(params, 'storageproviderid');

            // Validation
            if (!projectId || !apiKey || !providerId) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PARAMETER',
                    Message: 'ProjectID, OpusAPIKey, and StorageProviderID are required'
                };
            }

            // Load storage provider
            const md = new Metadata();
            const provider = await md.GetEntityObject<FileStorageProviderEntity>(
                'File Storage Providers',
                params.ContextUser
            );
            await provider.Load(providerId);

            if (!provider.ID) {
                return {
                    Success: false,
                    ResultCode: 'STORAGE_PROVIDER_NOT_FOUND',
                    Message: `Storage provider ${providerId} not found`
                };
            }

            // Create storage manager
            const manager = new OpusClipStorageManager(apiKey, provider);

            // Get clips
            const clipIds = this.getParamValue(params, 'clipids') as string[] | undefined;
            const minViralScore = this.getNumericParam(params, 'minviralscore', 0);

            const allClips = await manager.opusClient.getClips(projectId);

            // Filter clips
            let clipsToSave = allClips;
            if (clipIds?.length) {
                clipsToSave = allClips.filter(c => clipIds.includes(c.clipId));
            }
            if (minViralScore > 0) {
                clipsToSave = clipsToSave.filter(c => c.viralScore >= minViralScore);
            }

            // Save to storage
            const savedClips = await manager.saveClipsToStorage(clipsToSave, {
                projectId,
                folder: this.getParamValue(params, 'storagefolder') || `opus-clips/${projectId}`
            });

            const totalBytes = savedClips.reduce((sum, c) => sum + (c.metadata.sizeBytes || 0), 0);

            // Add outputs
            params.Params.push(
                { Name: 'SavedClips', Type: 'Output', Value: savedClips },
                { Name: 'TotalSaved', Type: 'Output', Value: savedClips.length },
                { Name: 'TotalBytes', Type: 'Output', Value: totalBytes }
            );

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Saved ${savedClips.length} clips to storage (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`,
                Params: params.Params
            };

        } catch (error) {
            return {
                Success: false,
                ResultCode: 'UPLOAD_FAILED',
                Message: `Failed to save clips: ${error.message}`
            };
        }
    }
}
```

---

#### **Action 5: Process Video End-to-End** (Composite Action)

**Purpose:** One-step action: submit video → wait → save clips

**Parameters:**
- **Input:**
  - All params from Actions 1 & 4 combined
  - `PollInterval` (number, optional): Seconds between status checks (default: 30)
  - `MaxWaitTime` (number, optional): Max wait in seconds (default: 3600)

- **Output:**
  - Combined outputs from all steps
  - `TotalProcessingTime` (number): Seconds elapsed

**Result Codes:**
- All codes from Actions 1, 2, 4
- `TIMEOUT` - Processing exceeded MaxWaitTime

**Workflow:**
```typescript
@RegisterClass(BaseAction, "Process Video with Opus Clip")
export class ProcessVideoOpusClipAction extends BaseAction {
    protected async InternalRunAction(
        params: RunActionParams
    ): Promise<ActionResultSimple> {
        const engine = ActionEngineServer.Instance;

        // Step 1: Create project
        const createResult = await this.runAction(
            engine,
            'Create Opus Clip Project',
            params
        );
        if (!createResult.Success) return createResult;

        const projectId = this.getOutputValue(createResult, 'ProjectID');

        // Step 2: Wait for completion
        const waitResult = await this.waitForCompletion(
            engine,
            projectId,
            params
        );
        if (!waitResult.Success) return waitResult;

        // Step 3: Save clips
        const saveResult = await this.runAction(
            engine,
            'Save Opus Clips to Storage',
            params
        );

        return saveResult;
    }
}
```

---

### 4. Database Schema Updates

#### New Action Category

```sql
DECLARE @OpusCategoryID UNIQUEIDENTIFIER = NEWID();

INSERT INTO [admin].[ActionCategory] (
    ID,
    Name,
    Description,
    ParentID,
    Status
) VALUES (
    @OpusCategoryID,
    'Opus Clip',
    'Actions for generating viral video clips using Opus Clip AI service',
    '15E03732-607E-4125-86F4-8C846EE88749', -- System Actions
    'Active'
);
```

#### Action Records

Create 5 action records (one per action above) with:
- Action metadata
- Parameter definitions
- Result codes
- Linked to Opus Clip category

---

### 5. Entity Tracking (Optional Enhancement)

Create MJ entities to track Opus Clip operations:

**OpusClipProject Entity:**
- `ID` (PK)
- `OpusProjectID` (Opus Clip project ID)
- `VideoSource` ('YouTube', 'Upload', 'URL')
- `VideoURL`
- `Status` ('Processing', 'Completed', 'Failed')
- `ClipCount`
- `CreditsUsed`
- `StorageProviderID` (FK)
- `StorageFolder`
- `CreatedAt`, `CompletedAt`

**OpusClipResult Entity:**
- `ID` (PK)
- `ProjectID` (FK to OpusClipProject)
- `OpusClipID` (Opus Clip's clip ID)
- `StoragePath`
- `DownloadURL` (pre-authenticated)
- `Duration`
- `ViralScore`
- `ThumbnailURL`
- `Metadata` (JSON)

This enables:
- Tracking all Opus Clip operations
- Reusing clips without re-download
- Historical reporting
- Cost tracking (credits)

---

## Implementation Phases

### Phase 1: Core Client Library (1-2 weeks)
- Create `OpusClipClient` TypeScript class
- Implement all API endpoints
- Add comprehensive error handling
- Unit tests for API wrapper
- Documentation

**Deliverables:**
- `packages/Integrations/OpusClip/` (new package)
- Full test coverage
- TypeDoc documentation

### Phase 2: Storage Integration (1 week)
- Create `OpusClipStorageManager`
- Implement download → upload pipeline
- Test with all 7 storage providers
- Handle large files efficiently (streaming)

**Deliverables:**
- Storage integration code
- Integration tests
- Performance benchmarks

### Phase 3: MJ Actions (1-2 weeks)
- Create 5 actions (listed above)
- Database migrations for actions
- Action parameter validation
- Result code handling
- Action unit tests

**Deliverables:**
- 5 working actions
- Migration files
- Action documentation

### Phase 4: Optional Enhancements (1 week)
- Create OpusClipProject/OpusClipResult entities
- Add webhook support for async processing
- Build Angular UI components
- Create dashboard for monitoring

**Deliverables:**
- Entity definitions
- CodeGen output
- UI components

### Phase 5: Agent Integration (1 week)
- Link actions to AI agents
- Create agent prompts/examples
- Test agent workflows
- Documentation for agent developers

**Deliverables:**
- Agent action configurations
- Example agent prompts
- Integration guide

---

## Technical Considerations

### 1. Async Processing

**Challenge:** Opus Clip processing can take minutes to hours depending on video length.

**Solutions:**
- **Polling Approach:** Simple, works everywhere
  - Action checks status every N seconds
  - Returns when complete or timeout
  - Easy to implement, resource-intensive

- **Webhook Approach:** Efficient, requires setup
  - Register webhook URL with Opus
  - Opus notifies MJ when complete
  - MJ API endpoint receives notification
  - Resume action execution
  - Complex but efficient

**Recommendation:** Start with polling (Phase 3), add webhook support (Phase 4)

### 2. Large File Handling

**Challenge:** Videos can be up to 30 GB.

**Solutions:**
- **Streaming:** Use Node.js streams for download/upload
- **Chunking:** Process in manageable chunks
- **Progress Tracking:** Show upload/download progress
- **Cleanup:** Delete temp files after upload

**Implementation:**
```typescript
// Stream-based download
async downloadClipStream(clipUrl: string): Promise<Readable> {
    const response = await fetch(clipUrl);
    return Readable.from(response.body);
}

// Stream directly to storage
async saveClipStream(clip: ClipInfo, storage: FileStorageBase): Promise<void> {
    const stream = await this.downloadClipStream(clip.exportUrl);
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
        chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    await storage.PutObject(clip.storagePath, buffer, 'video/mp4');
}
```

### 3. Error Recovery

**Scenarios:**
- Opus API rate limits (30/min)
- Network failures during download
- Storage upload failures
- Partial completion (some clips saved, others failed)

**Strategies:**
- **Exponential Backoff:** Retry with increasing delays
- **Partial Success Tracking:** Return which clips succeeded/failed
- **Idempotency:** Support re-running without duplicates
- **Cleanup:** Delete partial uploads on failure

### 4. Cost Management

**Opus Clip Pricing:** 1 credit per minute of video

**Considerations:**
- Track credits used per action
- Warn before large operations
- Allow credit limits in action params
- Log all operations for billing

**Action Parameter:**
```typescript
{
    Name: 'MaxCredits',
    Type: 'Input',
    Description: 'Maximum credits to consume (1 credit = 1 min video)',
    DefaultValue: '100'
}
```

### 5. Security

**API Key Management:**
- **Option 1:** Store in action params (less secure, flexible)
- **Option 2:** Store in MJ entity (FileStorageProvider-like)
- **Option 3:** Use agent context (runtime only)

**Recommendation:** Create `OpusClipProvider` entity similar to `FileStorageProviderEntity`:
```typescript
export class OpusClipProviderEntity extends BaseEntity {
    Name: string;
    APIKey: string;  // Encrypted in database
    Status: 'Active' | 'Disabled';
    MonthlyCredits: number;
    CreditsUsed: number;
}
```

---

## Usage Examples

### Example 1: Agent Workflow

Agent task: *"Create viral clips from our latest YouTube video and save to S3"*

Agent executes:
```typescript
// Step 1: Create project
const result1 = await executeAction({
    ActionName: 'Create Opus Clip Project',
    Params: [
        { Name: 'VideoSource', Value: 'YouTube' },
        { Name: 'YouTubeURL', Value: 'https://www.youtube.com/watch?v=abc123' },
        { Name: 'OpusAPIKey', Value: '...' },
        { Name: 'ClipDurationMin', Value: 30 },
        { Name: 'ClipDurationMax', Value: 60 }
    ]
});

const projectId = result1.Params.find(p => p.Name === 'ProjectID').Value;

// Step 2: Wait for completion
await executeAction({
    ActionName: 'Check Opus Clip Project Status',
    Params: [
        { Name: 'ProjectID', Value: projectId },
        { Name: 'OpusAPIKey', Value: '...' },
        { Name: 'WaitUntilComplete', Value: true }
    ]
});

// Step 3: Save high-scoring clips
await executeAction({
    ActionName: 'Save Opus Clips to Storage',
    Params: [
        { Name: 'ProjectID', Value: projectId },
        { Name: 'OpusAPIKey', Value: '...' },
        { Name: 'StorageProviderID', Value: 's3-provider-id' },
        { Name: 'MinViralScore', Value: 70 },
        { Name: 'StorageFolder', Value: 'marketing/viral-clips' }
    ]
});
```

### Example 2: Simplified End-to-End

```typescript
const result = await executeAction({
    ActionName: 'Process Video with Opus Clip',
    Params: [
        { Name: 'VideoSource', Value: 'YouTube' },
        { Name: 'YouTubeURL', Value: 'https://www.youtube.com/watch?v=abc123' },
        { Name: 'OpusAPIKey', Value: '...' },
        { Name: 'StorageProviderID', Value: 's3-provider-id' },
        { Name: 'MinViralScore', Value: 75 },
        { Name: 'MaxWaitTime', Value: 1800 }  // 30 min timeout
    ]
});

// Get saved clips
const savedClips = result.Params.find(p => p.Name === 'SavedClips').Value;
console.log(`Saved ${savedClips.length} clips to S3`);
```

### Example 3: Manual TypeScript Usage

```typescript
import { OpusClipClient, OpusClipStorageManager } from '@memberjunction/opus-clip';

// Create client
const client = new OpusClipClient(process.env.OPUS_API_KEY);

// Submit YouTube video
const project = await client.createProjectFromYouTube(
    'https://www.youtube.com/watch?v=example',
    {
        clipDurationMin: 30,
        clipDurationMax: 90,
        enableJumpcut: true
    }
);

// Wait for completion
await client.waitForProjectCompletion(project.projectId);

// Get clips
const clips = await client.getClips(project.projectId);

// Save to S3
const manager = new OpusClipStorageManager(
    process.env.OPUS_API_KEY,
    s3Provider
);

const saved = await manager.saveClipsToStorage(clips, {
    projectId: project.projectId,
    folder: 'viral-clips'
});

console.log(`Saved ${saved.length} clips`);
```

---

## Testing Strategy

### 1. Unit Tests

**OpusClipClient:**
- Mock HTTP requests
- Test error handling
- Validate request formatting
- Test retry logic

**OpusClipStorageManager:**
- Mock storage providers
- Test download → upload flow
- Test filtering logic
- Test partial failures

**Actions:**
- Mock OpusClipClient
- Test parameter validation
- Test result codes
- Test error scenarios

### 2. Integration Tests

**With Real Opus API:**
- Use test API key
- Submit small test videos
- Verify clip generation
- Test webhook notifications

**With Storage Providers:**
- Test all 7 providers
- Verify file integrity
- Test large files
- Test concurrent uploads

### 3. Performance Tests

**Benchmarks:**
- Upload time for various video sizes
- Download time for clips
- End-to-end processing time
- Memory usage for large files

---

## Documentation Deliverables

1. **API Documentation** (TypeDoc)
   - All public classes, methods, interfaces
   - Code examples
   - Error handling guide

2. **Action Documentation**
   - Each action's purpose
   - Parameter descriptions
   - Result codes
   - Usage examples

3. **Integration Guide**
   - Getting Opus Clip API key
   - Setting up storage providers
   - Configuring actions
   - Agent integration

4. **Best Practices**
   - Cost optimization
   - Error handling
   - Performance tuning
   - Security considerations

---

## Risks & Mitigations

### Risk 1: API Changes

**Risk:** Opus Clip is in closed beta; API may change

**Mitigation:**
- Version our wrapper to match API versions
- Abstract API calls behind interfaces
- Monitor Opus Clip changelog
- Build upgrade path for breaking changes

### Risk 2: Rate Limits

**Risk:** 30 requests/min may limit throughput

**Mitigation:**
- Implement request queuing
- Add exponential backoff
- Support multiple API keys (round-robin)
- Cache project status

### Risk 3: Processing Timeouts

**Risk:** Long videos may exceed action timeout

**Mitigation:**
- Use webhook approach (async)
- Support resumable operations
- Store partial results
- Allow background processing

### Risk 4: Storage Costs

**Risk:** Large video files consume storage

**Mitigation:**
- Implement auto-cleanup (expire after N days)
- Support selective clip saving (by viral score)
- Compress videos if possible
- Track storage usage in entities

---

## Cost Estimate

### Development Time

| Phase | Effort | Cost (@$150/hr) |
|-------|--------|-----------------|
| Phase 1: Core Client | 60 hours | $9,000 |
| Phase 2: Storage Integration | 30 hours | $4,500 |
| Phase 3: Actions | 50 hours | $7,500 |
| Phase 4: Optional Enhancements | 30 hours | $4,500 |
| Phase 5: Agent Integration | 20 hours | $3,000 |
| Testing & Documentation | 30 hours | $4,500 |
| **Total** | **220 hours** | **$33,000** |

### Ongoing Costs

- **Opus Clip Credits:** Variable (1 credit/min video)
- **Cloud Storage:** Variable (depends on clip count/size)
- **Maintenance:** ~5 hours/month

---

## Alternatives Considered

### Alternative 1: Use Opus Clip UI Manually

**Pros:** No development needed
**Cons:** No automation, no agent integration, manual work

**Verdict:** Not scalable for MJ/Skip use cases

### Alternative 2: Build Custom Video Clipping

**Pros:** Full control, no 3rd party costs
**Cons:** Massive engineering effort, AI model training required

**Verdict:** Not feasible; Opus Clip is best-in-class

### Alternative 3: Other Video Clipping Services

**Options:** Descript, Pictory, Kapwing
**Analysis:** Opus Clip has best API, best AI results, competitive pricing

**Verdict:** Opus Clip is the right choice

---

## Recommendation

### Recommended Approach

1. **Build Core Library First** (Phase 1 + 2)
   - Validates API integration
   - Provides foundation for actions
   - Can be used standalone

2. **Create Essential Actions** (Phase 3)
   - Actions 1, 2, 4 (Create, Check, Save)
   - Skip composite action initially
   - Get feedback from usage

3. **Add Enhancements Based on Usage** (Phase 4 + 5)
   - Webhooks if polling is too slow
   - Entities if tracking is needed
   - UI if requested

### Success Metrics

- Actions work reliably (>99% success rate)
- Processing time acceptable (<5 min for 10 min video)
- Agent integration seamless
- Storage costs manageable
- Developer adoption (used in 3+ agent workflows)

---

## Next Steps

1. **Approval:** Review and approve this proposal
2. **API Access:** Apply for Opus Clip API access (requires 20+ pack annual plan)
3. **Kickoff:** Begin Phase 1 development
4. **Iteration:** Build → Test → Refine
5. **Documentation:** Comprehensive guides
6. **Launch:** Enable for agents and users

---

## Questions for Discussion

1. **API Key Management:** Store in entity vs action params vs context?
2. **Webhook Infrastructure:** Do we have webhook endpoint capability?
3. **Storage Costs:** Who pays for cloud storage? (user vs system)
4. **Package Location:** New package `@memberjunction/opus-clip` or add to `@memberjunction/storage`?
5. **Priority:** Which phases are must-have vs nice-to-have?
6. **Timeline:** When do you need this operational?

---

## Conclusion

Integrating Opus Clip with MemberJunction will:
- Enable automated viral clip generation
- Provide agents with powerful video capabilities
- Leverage MJ's storage abstraction
- Follow MJ's action framework patterns
- Scale efficiently with proper architecture

The proposed architecture balances:
- **Simplicity:** Clean TypeScript wrapper
- **Flexibility:** Discrete actions for composition
- **Integration:** Works with MJ storage, entities, agents
- **Performance:** Async processing, streaming, caching
- **Maintainability:** Well-documented, tested, modular

**Ready to proceed when approved.**
