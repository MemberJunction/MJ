# MemberJunction File and Artifacts Architecture
## Native Multi-Modal AI with Cloud File Integration

**Date**: 2025-01-20
**Status**: Design Document

---

## Business Goals

### Problem Statement

Modern business users work with files scattered across multiple cloud platforms—Google Drive, SharePoint, Dropbox, Box, AWS S3, and more. AI applications need to process these files (PDFs, images, videos, documents) intelligently without forcing users to upload them multiple times or losing access to their native platform features.

### What We're Building

An artifact-based file handling system that:

1. **Enables Natural File Workflows**: Users can attach files from any cloud provider to artifacts without uploading copies
2. **Powers Multi-Modal AI**: Agents process PDFs, images, videos, and documents using native inference provider APIs (Anthropic, OpenAI, Gemini)
3. **Preserves Provider Features**: Files stay in their native platforms, retaining search, sharing, versioning, and collaboration capabilities
4. **Optimizes AI Costs**: Intelligent caching and file reference management reduces token usage and API calls by up to 75%
5. **Supports Mixed Workflows**: Combine user-uploaded files with AI-generated outputs in unified artifact containers

### Success Criteria

- Users can select files from Drive/SharePoint/etc. and attach to conversation artifacts
- AI agents can analyze PDFs, images, and videos without manual text extraction
- Files uploaded once can be referenced in multiple artifacts and conversations
- AI processing costs are minimized through provider file APIs and prompt caching
- Enterprise file platform features (permissions, search, versioning) remain fully functional

---

## Architecture Goals

### Core Principles

1. **Provider-Native Storage**: Files remain in their source cloud platforms (no local storage, no duplication)
2. **Flexible References**: Support any file provider through JSON metadata (not rigid database schemas)
3. **AI-Optimized**: Leverage inference provider File APIs for caching and native multi-modal processing
4. **Artifact-Centric**: Files are organized within artifact versions for versioning and lifecycle management
5. **Enterprise-Ready**: Work with files users don't "own" in our system (SharePoint docs, shared Drive files, etc.)

### Technical Requirements

- **Scalability**: Handle files from 1KB to 5TB without architecture changes
- **Provider Agnostic**: Support current providers (Drive, SharePoint, S3, Dropbox, Box) and future additions with minimal code
- **Cost Efficiency**: Minimize file uploads to inference providers through intelligent caching
- **Performance**: Sub-second file reference creation; lazy-load file metadata on demand
- **Security**: Honor source provider permissions; support enterprise authentication flows

---

## Architecture Overview

### Artifacts: The Foundation

**Artifacts are the primary container for all content in MemberJunction.** Every file reference exists within an artifact version. This provides:

- **Unified Lifecycle Management**: Files and their associated content (code, reports, analysis) are versioned together
- **Permission Inheritance**: Access control is managed at the artifact level
- **Collection Organization**: Artifacts group related files and outputs logically
- **Conversation Linkage**: Natural integration with chat-based workflows
- **Version History**: Every change to files or content creates a new artifact version

Artifacts serve multiple roles:
- **AI-Generated Outputs**: Code, reports, visualizations, summaries
- **User-Provided Inputs**: Documents, images, data files from cloud providers
- **Hybrid Containers**: Mix source files (PDFs, spreadsheets) with generated analysis and visualizations
- **Workflow Snapshots**: Complete state of inputs, outputs, and metadata at a point in time

### File Reference Model

Files are referenced as JSON metadata in `ArtifactVersion.Files`, not as separate database entities. This approach:

- **Supports any provider** through flexible JSON schemas
- **Works with files not in our database** (e.g., existing SharePoint documents)
- **Preserves provider-specific metadata** (Drive file IDs, SharePoint site paths, S3 bucket/key pairs)
- **Avoids sync complexity** (provider is source of truth)
- **Enables provider features** (search, versioning, sharing stay native)

### Artifact Version Entity

```typescript
interface ArtifactVersionEntity {
  ID: string;
  ArtifactID: string;
  Version: number;
  Configuration: string;  // JSON: Agent config, UI settings, etc.
  Content: string;        // Structured content (code, markdown, JSON data)
  Files: string;          // JSON array of FileReference objects

  __mj_CreatedAt: Date;
  __mj_UpdatedAt: Date;
}
```

### FileReference Schema

```typescript
/**
 * Universal file reference supporting any provider
 */
interface FileReference {
  // Core metadata (all providers)
  provider: string;         // "Google Drive" | "SharePoint" | "AWS S3" | "Dropbox" | "Box" | etc.
  name: string;             // Display name
  mimeType: string;         // MIME type (e.g., "application/pdf", "image/jpeg")
  size?: number;            // Bytes
  role: FileRole;           // "source" | "generated" | "reference" | "output"
  uploadedAt?: string;      // ISO 8601 timestamp
  uploadedBy?: string;      // User ID who attached this file

  // Provider-specific identifiers (varies by provider)
  url?: string;             // Public or pre-signed download URL
  fileId?: string;          // Provider file ID (Drive, Box)
  path?: string;            // File path (S3, Dropbox)

  // Provider-specific metadata (optional)
  providerMetadata?: {
    // Google Drive
    driveId?: string;
    permissions?: any;

    // SharePoint/OneDrive
    siteId?: string;
    driveId?: string;
    itemId?: string;
    webUrl?: string;

    // AWS S3
    bucket?: string;
    key?: string;
    region?: string;

    // Dropbox
    pathLower?: string;
    pathDisplay?: string;
    rev?: string;

    // Box
    boxFileId?: string;
    sharedLink?: string;

    // Extensible for any provider
    [key: string]: any;
  };

  // AI inference provider integration
  inferenceProviderFileId?: string;   // Anthropic/OpenAI/Gemini file ID
  inferenceProvider?: string;         // "Anthropic" | "OpenAI" | "Gemini"
  inferenceProviderExpiresAt?: string; // ISO 8601 timestamp

  // Optional extracted content (for search/indexing)
  extractedText?: string;
  extractedMetadata?: {
    pageCount?: number;       // PDFs
    duration?: number;        // Video/audio (seconds)
    dimensions?: { width: number; height: number };  // Images/video
    author?: string;
    createdDate?: string;
    [key: string]: any;
  };

  // Display optimization
  thumbnailUrl?: string;    // Pre-signed thumbnail URL
}

type FileRole = 'source' | 'generated' | 'reference' | 'output';
```

### Example Artifact with Files

```json
{
  "ID": "version-123",
  "ArtifactID": "artifact-abc",
  "Version": 1,
  "Content": "# Document Analysis\n\nKey findings from the financial report...",
  "Files": "[
    {
      \"provider\": \"Google Drive\",
      \"fileId\": \"1BxiMVs0XRA5nFMdKvBdBZjgmUin_wMKy\",
      \"url\": \"https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUin_wMKy\",
      \"name\": \"Q4_Financial_Report.pdf\",
      \"mimeType\": \"application/pdf\",
      \"size\": 2457600,
      \"role\": \"source\",
      \"uploadedAt\": \"2025-01-20T10:30:00Z\",
      \"providerMetadata\": {
        \"driveId\": \"0AHj9vOCj9CJCUk9PVA\"
      },
      \"inferenceProviderFileId\": \"file_abc123\",
      \"inferenceProvider\": \"Anthropic\",
      \"inferenceProviderExpiresAt\": \"2025-01-22T10:30:00Z\",
      \"extractedMetadata\": {
        \"pageCount\": 45,
        \"author\": \"Finance Team\"
      }
    },
    {
      \"provider\": \"AWS S3\",
      \"path\": \"artifacts/2025/01/sales_chart.png\",
      \"url\": \"https://my-bucket.s3.amazonaws.com/artifacts/2025/01/sales_chart.png?X-Amz-...\",
      \"name\": \"sales_chart.png\",
      \"mimeType\": \"image/png\",
      \"size\": 145678,
      \"role\": \"generated\",
      \"uploadedAt\": \"2025-01-20T10:35:00Z\",
      \"providerMetadata\": {
        \"bucket\": \"my-bucket\",
        \"key\": \"artifacts/2025/01/sales_chart.png\",
        \"region\": \"us-east-1\"
      }
    }
  ]"
}
```

---

## What Exists Today vs What We're Building

### Existing Infrastructure (Fully Built)

#### MJStorage Package
MemberJunction already has a comprehensive file storage abstraction system:

**Core Abstraction**:
- `FileStorageBase` - Abstract base class for all providers
- 7 provider implementations:
  - `AWSStorageProvider` - AWS S3
  - `AzureStorageProvider` - Azure Blob Storage
  - `GCSStorageProvider` - Google Cloud Storage
  - `GoogleDriveStorageProvider` - Google Drive
  - `SharePointStorageProvider` - SharePoint/OneDrive
  - `DropboxStorageProvider` - Dropbox
  - `BoxStorageProvider` - Box

**Key Types**:
```typescript
type CreatePreAuthUploadUrlPayload = {
  UploadUrl: string;
  ProviderKey?: string;
};

type StorageObjectMetadata = {
  name: string;
  path: string;
  fullPath: string;
  size: number;
  contentType: string;
  lastModified: Date;
  isDirectory: boolean;
  etag?: string;
  cacheControl?: string;
  customMetadata?: Record<string, string>;
};

type FileSearchOptions = {
  maxResults?: number;
  fileTypes?: string[];
  modifiedAfter?: Date;
  modifiedBefore?: Date;
  pathPrefix?: string;
  searchContent?: boolean;
  providerSpecific?: Record<string, any>;
};

type FileSearchResult = {
  path: string;
  name: string;
  size: number;
  contentType: string;
  lastModified: Date;
  relevance?: number;
  excerpt?: string;
  matchInFilename?: boolean;
  customMetadata?: Record<string, string>;
  providerData?: Record<string, any>;
};
```

**Key Methods**:
- `CreatePreAuthUploadUrl()` - Generate pre-signed upload URLs
- `GetObject()` - Download file
- `PutObject()` - Upload file
- `DeleteObject()` - Delete file
- `CopyObject()` - Copy file
- `MoveObject()` - Move file
- `ListObjects()` - List files in directory
- `SearchFiles()` - Search for files (provider-specific)

#### Artifact System
The artifact entity system is fully built:

- `ArtifactEntity` - Container for versioned content
- `ArtifactVersionEntity` - Versioned snapshots (has `Configuration`, `Content` columns)
- `ArtifactTypeEntity` - Type definitions for artifacts
- `ConversationArtifactEntity` - Links artifacts to conversations
- Artifact viewer plugins (React components)
- Collection organization system

#### AI Multi-Modal Infrastructure
Core chat types already support multi-modal content:

```typescript
// From chat.types.ts
type ChatMessageContentBlock = {
  type: 'text' | 'image_url' | 'video_url' | 'audio_url' | 'file_url';
  content: string;
}

type ChatMessageContent = string | ChatMessageContentBlock[];

type ChatMessage<M = any> = {
  role: ChatMessageRole;
  content: ChatMessageContent;
  metadata?: M;
}
```

- `BaseLLM` providers can already accept `ChatMessage` with content blocks
- `ChatParams` already supports multi-modal messages

### What We're Building (New Components)

#### 1. Database Schema Enhancement
Add `Files` JSON column to `ArtifactVersion`:

```sql
ALTER TABLE [__mj].[ArtifactVersion]
ADD [Files] NVARCHAR(MAX) NULL;

ALTER TABLE [__mj].[ArtifactVersion]
ADD CONSTRAINT [CK_ArtifactVersion_Files_JSON]
CHECK (Files IS NULL OR ISJSON(Files) = 1);
```

#### 2. FileReference Schema
New TypeScript type representing a file reference (not a database entity):

```typescript
interface FileReference {
  provider: string;
  name: string;
  mimeType: string;
  size?: number;
  role: FileRole;
  uploadedAt?: string;
  uploadedBy?: string;

  // Provider identifiers
  url?: string;
  fileId?: string;
  path?: string;

  providerMetadata?: {
    // Google Drive
    driveId?: string;
    // SharePoint
    siteId?: string;
    driveId?: string;
    itemId?: string;
    // AWS S3
    bucket?: string;
    key?: string;
    region?: string;
    [key: string]: any;
  };

  // AI inference provider integration
  inferenceProviderFileId?: string;
  inferenceProvider?: string;
  inferenceProviderExpiresAt?: string;

  extractedText?: string;
  extractedMetadata?: any;
  thumbnailUrl?: string;
}
```

#### 3. MultiModalMessageBuilder Service
New service that builds `ChatMessage` objects with file content blocks from artifact versions:

```typescript
class MultiModalMessageBuilder {
  async buildMessageFromArtifact(
    artifactVersionID: string,
    textPrompt: string,
    options?: {
      includeFiles?: boolean;
      fileRoles?: FileRole[];
      uploadToInferenceProvider?: boolean;
    }
  ): Promise<ChatMessage>

  async ensureInferenceProviderUpload(
    fileRef: FileReference,
    artifactVersion: ArtifactVersionEntity
  ): Promise<void>
}
```

#### 4. BaseLLM Multi-Modal Extensions
Add new methods to `BaseLLM` base class:

```typescript
abstract class BaseLLM extends BaseModel {
  async uploadFileToProvider(file: {
    name: string;
    content: Buffer;
    mimeType: string;
  }): Promise<{ providerFileID: string; expiresAt: Date } | null>

  get multiModalCapabilities(): MultiModalCapabilities
}
```

Implement in provider-specific classes:
- `AnthropicLLM.uploadFileToProvider()` - Use Anthropic Files API
- `OpenAILLM.uploadFileToProvider()` - Use OpenAI Files API
- `GeminiLLM.uploadFileToProvider()` - Use Gemini File API

#### 5. UI Components
New Angular components for file management:

- `FilePickerComponent` - Google Drive/SharePoint file pickers
- `FileListComponent` - Display file references in artifact viewer
- `FileUploadComponent` - Upload new files to providers
- Integration with `MessageInputComponent` - Attach files to messages
- Integration with `ArtifactViewerPanelComponent` - View/download files

#### 6. Utility Services
- `FileReferenceValidator` - Validate FileReference JSON structures
- `InferenceFileManager` - Track file uploads to inference providers, handle expiration
- `FileMetadataExtractor` - Extract text and metadata from files
- `FileThumbnailGenerator` - Generate thumbnails for images/PDFs

---

## Passing Artifacts to Agents and Prompts

This section defines how artifact version IDs and file references flow through the agent and prompt execution interfaces.

### Prompt Execution with Artifacts

#### AIPromptParams Interface
Prompts receive artifact data through the `data` property:

```typescript
// From prompt.types.ts
class AIPromptParams {
  prompt: AIPromptEntityExtended;
  data?: Record<string, unknown>;  // <-- Artifact data goes here
  configurationId?: string;
  contextUser?: UserInfo;
  // ... more properties
}
```

#### Example: Passing Artifact to Prompt

```typescript
// User asks to analyze a document
const artifactVersionID = 'version-123';  // Contains PDF files

// Prepare prompt parameters
const params = new AIPromptParams();
params.prompt = documentAnalysisPrompt;
params.data = {
  artifactVersionID: artifactVersionID,
  userQuery: 'Summarize the key financial findings'
};

// Execute prompt
const runner = new AIPromptRunner();
const result = await runner.ExecutePrompt(params);
```

#### Inside Prompt Template
The prompt template can reference the artifact:

```markdown
{{#if artifactVersionID}}
Analyze the documents in artifact version {{artifactVersionID}}.
{{/if}}

User's question: {{userQuery}}
```

#### Multi-Modal Message Building
The prompt execution flow builds multi-modal messages:

```typescript
// Inside AIPromptRunner.ExecutePrompt()
async executeWithFiles(params: AIPromptParams): Promise<AIPromptRunEntity> {
  const artifactVersionID = params.data?.artifactVersionID as string;

  if (artifactVersionID) {
    // Load artifact version
    const md = new Metadata();
    const version = await md.GetEntityObject<ArtifactVersionEntity>(
      'MJ: Artifact Versions',
      params.contextUser
    );
    await version.Load(artifactVersionID);

    // Build multi-modal message from files
    const messageBuilder = new MultiModalMessageBuilder();
    const renderedPrompt = await this.renderPromptTemplate(params);

    const message = await messageBuilder.buildMessageFromArtifact(
      version,
      renderedPrompt,
      {
        includeFiles: true,
        uploadToInferenceProvider: true
      }
    );

    // Execute with multi-modal message
    const chatParams = new ChatParams();
    chatParams.messages = [message];
    chatParams.enableCaching = true;

    const llm = this.createLLMInstance(model);
    const result = await llm.ChatCompletion(chatParams);

    return this.createRunRecord(result);
  }
}
```

### Agent Execution with Artifacts

#### ExecuteAgentParams Interface
Agents receive artifact data through `data` (visible to LLM) or `payload` (hidden from LLM):

```typescript
// From agent-types.ts
type ExecuteAgentParams<TContext = any, P = any> = {
  agent: AIAgentEntityExtended;
  conversationMessages: ChatMessage[];
  contextUser?: UserInfo;

  data?: Record<string, any>;      // Template data, visible to LLM
  payload?: P;                     // Agent state, hidden from LLM
  context?: TContext;              // Runtime config, hidden from LLM

  cancellationToken?: AbortSignal;
  onProgress?: AgentExecutionProgressCallback;
  onStreaming?: AgentExecutionStreamingCallback;
  parentAgentHierarchy?: string[];
  parentDepth?: number;
  parentRun?: AIAgentRunEntityExtended;
};
```

**Key Distinction**:
- **`data`**: Passed to template rendering, visible in prompts sent to LLM
- **`payload`**: Agent internal state, NOT visible to LLM
- **`context`**: Runtime configuration, NOT visible to LLM

#### Example: Passing Artifact to Agent

```typescript
// User uploads document and asks agent to analyze
const artifactVersionID = 'version-456';

const agentParams: ExecuteAgentParams = {
  agent: documentAnalyzerAgent,
  conversationMessages: [
    { role: 'user', content: 'Analyze the uploaded financial report' }
  ],
  data: {
    artifactVersionID: artifactVersionID,  // Visible to LLM in templates
    userQuery: 'What are the key revenue trends?'
  },
  payload: {
    // Agent-specific state, hidden from LLM
    processingStatus: 'initial',
    retryCount: 0
  }
};

const agentExecutor = new AgentExecutor();
const result = await agentExecutor.execute(agentParams);
```

#### Inside Agent Prompts
Agent prompts can reference the artifact data:

```markdown
You are analyzing documents for the user.

{{#if artifactVersionID}}
The user has provided documents in artifact version {{artifactVersionID}}.
Review these documents carefully.
{{/if}}

User's question: {{userQuery}}
```

#### Agent Implementation with File Processing

```typescript
class DocumentAnalyzerAgent extends BaseAgent {
  async execute(params: ExecuteAgentParams): Promise<AgentRunResult> {
    const artifactVersionID = params.data?.artifactVersionID as string;

    if (!artifactVersionID) {
      throw new Error('No artifact provided for analysis');
    }

    // Load artifact version with files
    const version = await this.loadArtifactVersion(artifactVersionID);
    const files: FileReference[] = JSON.parse(version.Files || '[]');
    const sourceFiles = files.filter(f => f.role === 'source');

    this.reportProgress(`Found ${sourceFiles.length} source files to analyze`);

    // Build multi-modal message
    const messageBuilder = new MultiModalMessageBuilder();
    const userMessage = params.conversationMessages.find(m => m.role === 'user');

    const messageWithFiles = await messageBuilder.buildMessageFromArtifact(
      version,
      userMessage?.content as string || 'Analyze these documents',
      {
        includeFiles: true,
        fileRoles: ['source'],
        uploadToInferenceProvider: true
      }
    );

    // Execute prompt with files
    const chatParams = new ChatParams();
    chatParams.messages = [messageWithFiles];
    chatParams.enableCaching = true;  // Cache file uploads

    const model = await this.getModel();
    const llm = this.createLLMInstance(model);
    const result = await llm.ChatCompletion(chatParams);

    // Create output artifact version with analysis
    const outputVersion = await this.createOutputVersion(
      version.ArtifactID,
      result.data.choices[0].message.content
    );

    return {
      success: true,
      outputVersionID: outputVersion.ID,
      summary: 'Analysis complete'
    };
  }

  private async loadArtifactVersion(
    versionID: string
  ): Promise<ArtifactVersionEntity> {
    const md = new Metadata();
    const version = await md.GetEntityObject<ArtifactVersionEntity>(
      'MJ: Artifact Versions',
      this.contextUser
    );
    await version.Load(versionID);
    return version;
  }

  private async createOutputVersion(
    artifactID: string,
    analysisContent: string
  ): Promise<ArtifactVersionEntity> {
    const md = new Metadata();
    const version = await md.GetEntityObject<ArtifactVersionEntity>(
      'MJ: Artifact Versions',
      this.contextUser
    );
    version.NewRecord();
    version.ArtifactID = artifactID;
    version.Content = analysisContent;
    version.Version = await this.getNextVersion(artifactID);
    await version.Save();
    return version;
  }
}
```

### Multi-Modal Message Builder Implementation

The `MultiModalMessageBuilder` service bridges artifact file references and LLM multi-modal messages:

```typescript
class MultiModalMessageBuilder {
  constructor(
    private fileProviderRegistry: FileProviderRegistry,
    private llmFactory: LLMFactory
  ) {}

  /**
   * Build ChatMessage from artifact version with file content blocks
   */
  async buildMessageFromArtifact(
    artifactVersion: ArtifactVersionEntity,
    textPrompt: string,
    options?: {
      includeFiles?: boolean;
      fileRoles?: FileRole[];
      uploadToInferenceProvider?: boolean;
    }
  ): Promise<ChatMessage> {
    // Start with text block
    const blocks: ChatMessageContentBlock[] = [
      { type: 'text', content: textPrompt }
    ];

    // Add file blocks if requested
    if (options?.includeFiles !== false) {
      const files: FileReference[] = JSON.parse(artifactVersion.Files || '[]');

      // Filter by role if specified
      const filteredFiles = options?.fileRoles
        ? files.filter(f => options.fileRoles.includes(f.role))
        : files;

      // Convert each file to content block
      for (const fileRef of filteredFiles) {
        // Upload to inference provider if requested
        if (options?.uploadToInferenceProvider) {
          await this.ensureInferenceProviderUpload(fileRef, artifactVersion);
        }

        // Create content block
        const block = await this.createContentBlock(fileRef);
        blocks.push(block);
      }
    }

    return {
      role: 'user',
      content: blocks,
      metadata: {
        artifactID: artifactVersion.ArtifactID,
        artifactVersionID: artifactVersion.ID
      }
    };
  }

  /**
   * Upload file to inference provider if needed
   */
  private async ensureInferenceProviderUpload(
    fileRef: FileReference,
    artifactVersion: ArtifactVersionEntity
  ): Promise<void> {
    // Check if already uploaded and not expired
    if (fileRef.inferenceProviderFileId &&
        !this.isExpired(fileRef.inferenceProviderExpiresAt)) {
      return;  // Already uploaded and cached
    }

    // Get LLM instance
    const llm = await this.llmFactory.createFromCurrentConfig();

    // Check if provider supports File API
    if (!llm.multiModalCapabilities.supportsFileAPI) {
      return;  // Will use URLs instead
    }

    // Download file from storage provider
    const storageProvider = this.fileProviderRegistry.getProvider(fileRef.provider);
    const fileBuffer = await this.downloadFile(storageProvider, fileRef);

    // Upload to inference provider
    const uploadResult = await llm.uploadFileToProvider({
      name: fileRef.name,
      content: fileBuffer,
      mimeType: fileRef.mimeType
    });

    if (uploadResult) {
      // Update file reference with inference provider data
      fileRef.inferenceProviderFileId = uploadResult.providerFileID;
      fileRef.inferenceProvider = llm.vendorName;
      fileRef.inferenceProviderExpiresAt = uploadResult.expiresAt.toISOString();

      // Save updated files back to artifact version
      const files: FileReference[] = JSON.parse(artifactVersion.Files || '[]');
      const index = files.findIndex(f =>
        (f.fileId && f.fileId === fileRef.fileId) ||
        (f.path && f.path === fileRef.path)
      );

      if (index >= 0) {
        files[index] = fileRef;
        artifactVersion.Files = JSON.stringify(files);
        await artifactVersion.Save();
      }
    }
  }

  /**
   * Create ChatMessageContentBlock from FileReference
   */
  private async createContentBlock(
    fileRef: FileReference
  ): Promise<ChatMessageContentBlock> {
    const type = this.getBlockTypeFromMimeType(fileRef.mimeType);

    let content: string;

    // Prefer cached inference provider file ID
    if (fileRef.inferenceProviderFileId &&
        !this.isExpired(fileRef.inferenceProviderExpiresAt)) {
      content = fileRef.inferenceProviderFileId;
    }
    // Fall back to URL if available
    else if (fileRef.url) {
      content = fileRef.url;
    }
    // Generate download URL from provider
    else {
      const provider = this.fileProviderRegistry.getProvider(fileRef.provider);
      content = await provider.getDownloadUrl(fileRef);
    }

    return { type, content };
  }

  private getBlockTypeFromMimeType(
    mimeType: string
  ): ChatMessageContentBlock['type'] {
    if (mimeType.startsWith('image/')) return 'image_url';
    if (mimeType.startsWith('video/')) return 'video_url';
    if (mimeType.startsWith('audio/')) return 'audio_url';
    return 'file_url';
  }

  private isExpired(expiresAt?: string): boolean {
    if (!expiresAt) return true;
    return new Date(expiresAt) < new Date();
  }

  private async downloadFile(
    provider: FileStorageBase,
    fileRef: FileReference
  ): Promise<Buffer> {
    const path = fileRef.path || fileRef.fileId || fileRef.url;
    if (!path) {
      throw new Error('No valid file path or ID in FileReference');
    }

    const result = await provider.GetObject(path);
    return result;
  }
}
```

---

## Use Case Workflows

### User Attaches Google Drive Files

```typescript
// User selects files from Google Drive picker
const selectedFiles = [{
  id: '1BxiMVs0XRA5nFMdKvBdBZjgmUin_wMKy',
  name: 'Q4_Report.pdf',
  mimeType: 'application/pdf',
  size: 2457600
}];

// Create artifact
const artifact = await md.GetEntityObject<ArtifactEntity>(
  'MJ: Artifacts',
  contextUser
);
artifact.NewRecord();
artifact.Name = 'Q4 Financial Documents';
await artifact.Save();

// Create version with file references
const version = await md.GetEntityObject<ArtifactVersionEntity>(
  'MJ: Artifact Versions',
  contextUser
);
version.NewRecord();
version.ArtifactID = artifact.ID;
version.Version = 1;

const fileRefs: FileReference[] = selectedFiles.map(file => ({
  provider: 'Google Drive',
  fileId: file.id,
  name: file.name,
  mimeType: file.mimeType,
  size: file.size,
  role: 'source',
  uploadedAt: new Date().toISOString(),
  providerMetadata: { driveId: '0AHj9vOCj9CJCUk9PVA' }
}));

version.Files = JSON.stringify(fileRefs);
await version.Save();
```

### Agent Processes PDF

```typescript
class DocumentAnalyzerAgent extends BaseAgent {
  async execute(params: ExecuteAgentParams) {
    const version = await this.loadArtifactVersion(
      params.data.artifactVersionID
    );

    const files: FileReference[] = JSON.parse(version.Files || '[]');
    const sourceFiles = files.filter(f => f.role === 'source');

    const messageBuilder = new MultiModalMessageBuilder();
    const message = await messageBuilder.buildMessageFromArtifact(
      version,
      'Summarize the key findings from this financial report',
      {
        includeFiles: true,
        fileRoles: ['source'],
        uploadToInferenceProvider: true
      }
    );

    const model = await this.getModel();
    const llm = this.createLLMInstance(model);

    const chatParams = new ChatParams();
    chatParams.model = model.APIName;
    chatParams.messages = [message];
    chatParams.enableCaching = true;

    const result = await llm.ChatCompletion(chatParams);

    const outputVersion = await this.createOutputVersion(
      version.ArtifactID,
      result.data.choices[0].message.content
    );

    return { success: true, outputVersionID: outputVersion.ID };
  }
}
```

### AI Generates Image

```typescript
// Agent generates image
const imageResult = await dalleAPI.generateImage({
  prompt: 'Sales trend chart',
  size: '1024x1024'
});

const imageBuffer = await fetch(imageResult.url).then(r => r.arrayBuffer());

// Upload to S3
const provider = this.getFileProviderService('AWS S3');
const fileRef = await provider.uploadFile(imageBuffer, {
  name: 'sales_trend.png',
  mimeType: 'image/png',
  folder: `artifacts/${artifactId}/generated`
});

// Add to artifact version
const version = await loadArtifactVersion(versionId);
const files: FileReference[] = JSON.parse(version.Files || '[]');
files.push({
  ...fileRef,
  role: 'generated',
  uploadedAt: new Date().toISOString()
});
version.Files = JSON.stringify(files);
await version.Save();
```

### Search Files Across Providers

```typescript
class FileSearchService {
  async searchAcrossProviders(query: string): Promise<FileReference[]> {
    const results: FileReference[] = [];
    const providers = await this.getActiveProviders();

    for (const providerConfig of providers) {
      const provider = this.getFileProviderService(providerConfig.name);

      if (provider.capabilities.supportsSearch) {
        try {
          const providerResults = await provider.searchFiles(query);
          results.push(...providerResults);
        } catch (error) {
          console.warn(`Search failed for ${providerConfig.name}:`, error);
        }
      }
    }

    return results;
  }
}
```

---

## Database Schema

### ArtifactVersion Enhancement

```sql
-- Add Files column
ALTER TABLE [__mj].[ArtifactVersion]
ADD [Files] NVARCHAR(MAX) NULL;

-- JSON validation constraint
ALTER TABLE [__mj].[ArtifactVersion]
ADD CONSTRAINT [CK_ArtifactVersion_Files_JSON]
CHECK (Files IS NULL OR ISJSON(Files) = 1);

-- Computed column for file count
ALTER TABLE [__mj].[ArtifactVersion]
ADD [FileCount] AS (
  CASE
    WHEN Files IS NULL THEN 0
    ELSE (SELECT COUNT(*) FROM OPENJSON(Files))
  END
) PERSISTED;

-- Index for performance
CREATE INDEX [IX_ArtifactVersion_Files]
ON [__mj].[ArtifactVersion]([ArtifactID])
INCLUDE ([Files])
WHERE [Files] IS NOT NULL;
```

### Useful Queries

```sql
-- Find artifacts with Google Drive files
SELECT av.*
FROM [__mj].[ArtifactVersion] av
CROSS APPLY OPENJSON(av.Files) WITH (
  provider NVARCHAR(100) '$.provider'
)
WHERE provider = 'Google Drive';

-- Find artifacts with PDFs
SELECT av.*
FROM [__mj].[ArtifactVersion] av
CROSS APPLY OPENJSON(av.Files) WITH (
  mimeType NVARCHAR(200) '$.mimeType'
)
WHERE mimeType = 'application/pdf';

-- Get file count per artifact
SELECT
  a.ID,
  a.Name,
  SUM(av.FileCount) as TotalFiles
FROM [__mj].[Artifact] a
JOIN [__mj].[ArtifactVersion] av ON av.ArtifactID = a.ID
GROUP BY a.ID, a.Name;

-- Search extracted text
SELECT av.*
FROM [__mj].[ArtifactVersion] av
CROSS APPLY OPENJSON(av.Files) WITH (
  extractedText NVARCHAR(MAX) '$.extractedText'
)
WHERE extractedText LIKE '%quarterly revenue%';
```

---

## Implementation Roadmap

### Phase 1: Database Schema & Core Types (Week 1)

**Goal**: Foundation for storing file references in artifacts

**What We're Building** (New):
- ✅ Migration: Add `Files` NVARCHAR(MAX) column to `ArtifactVersion`
- ✅ Migration: Add JSON validation constraint
- ✅ Migration: Add computed `FileCount` column
- ✅ Run CodeGen to update `ArtifactVersionEntity` class
- ✅ Create `FileReference` TypeScript interface
- ✅ Create `FileRole` type definition
- ✅ JSON validation utilities for FileReference

**What Already Exists** (Use as-is):
- ✅ `FileStorageBase` - Base class for all providers
- ✅ 7 provider implementations (S3, Azure, GCS, Drive, SharePoint, Dropbox, Box)
- ✅ `ArtifactEntity`, `ArtifactVersionEntity` - Core artifact system
- ✅ `ChatMessage`, `ChatMessageContentBlock` - Multi-modal message types

### Phase 2: Multi-Modal LLM Extensions (Week 2)

**Goal**: Enable LLMs to accept and process file references

**What We're Building** (New):
- ✅ Add `multiModalCapabilities` getter to `BaseLLM`
- ✅ Add `uploadFileToProvider()` method to `BaseLLM`
- ✅ Implement `AnthropicLLM.uploadFileToProvider()` - Use Files API (beta)
- ✅ Implement `OpenAILLM.uploadFileToProvider()` - Use Files API
- ✅ Implement `GeminiLLM.uploadFileToProvider()` - Use File API
- ✅ Create `MultiModalCapabilities` interface
- ✅ Update LLM message conversion for file content blocks

**What Already Exists** (Extend):
- ✅ `BaseLLM.ChatCompletion()` - Already handles multi-modal messages
- ✅ Provider-specific LLM classes (AnthropicLLM, OpenAILLM, etc.)

### Phase 3: Message Builder Service (Week 3)

**Goal**: Convert artifact file references into LLM-ready messages

**What We're Building** (New):
- ✅ `MultiModalMessageBuilder` class
- ✅ `buildMessageFromArtifact()` method
- ✅ `ensureInferenceProviderUpload()` method
- ✅ `createContentBlock()` helper
- ✅ File expiration checking logic
- ✅ FileReference → ChatMessageContentBlock conversion
- ✅ `FileProviderRegistry` for accessing storage providers

**What Already Exists** (Integrate with):
- ✅ `FileStorageBase.GetObject()` - Download files from providers
- ✅ `ChatMessage`, `ChatMessageContentBlock` types

### Phase 4: Prompt & Agent Integration (Week 4)

**Goal**: Enable prompts and agents to work with artifact files

**What We're Building** (New):
- ✅ Update `AIPromptRunner.ExecutePrompt()` to detect `artifactVersionID` in `params.data`
- ✅ Build multi-modal messages when artifact contains files
- ✅ Update agent execution to pass `artifactVersionID` in `ExecuteAgentParams.data`
- ✅ Example agent: `DocumentAnalyzerAgent`
- ✅ Helper methods for loading artifact versions with files

**What Already Exists** (Extend):
- ✅ `AIPromptParams.data` - Already supports arbitrary data
- ✅ `ExecuteAgentParams.data` - Already supports template data
- ✅ `BaseAgent` - Base class for all agents
- ✅ `AIPromptRunner` - Prompt execution engine

### Phase 5: UI Components (Weeks 5-6)

**Goal**: User interface for attaching, viewing, and managing files in artifacts

**What We're Building** (New):
- ✅ `FilePickerComponent` - Google Drive picker integration
- ✅ `FilePickerComponent` - SharePoint file picker integration
- ✅ `FileListComponent` - Display file references in artifact viewer
- ✅ `FileUploadComponent` - Direct upload to storage providers
- ✅ File preview modal (images, PDFs)
- ✅ File download functionality
- ✅ Update `MessageInputComponent` to attach files
- ✅ Update `ArtifactViewerPanelComponent` to show files

**What Already Exists** (Integrate with):
- ✅ `ArtifactViewerPanelComponent` - Artifact viewer
- ✅ `MessageInputComponent` - Chat message input
- ✅ Angular services for artifact management

### Phase 6: Utility Services (Week 7)

**Goal**: Supporting services for file management

**What We're Building** (New):
- ✅ `FileReferenceValidator` - Validate JSON structure
- ✅ `InferenceFileManager` - Track inference provider uploads, handle expiration
- ✅ `FileMetadataExtractor` - Extract text from PDFs, images (OCR)
- ✅ `FileThumbnailGenerator` - Generate thumbnails for images/PDFs
- ✅ Background job: Clean up expired inference provider files
- ✅ Analytics: Track file usage, costs

**What Already Exists** (Use):
- ✅ `FileStorageBase` methods for file operations

### Phase 7: Production Features (Week 8)

**Goal**: Enterprise-ready file handling

**What We're Building** (New):
- ✅ Cross-provider file search UI
- ✅ File permission checking (verify user has access before attaching)
- ✅ Cost tracking dashboard (inference provider file uploads)
- ✅ File migration tools (move files between providers)
- ✅ Bulk file operations (attach multiple files to artifact)
- ✅ File version support (link to specific file versions in providers)

**What Already Exists** (Leverage):
- ✅ `FileStorageBase.SearchFiles()` - Provider-specific search
- ✅ Provider authentication flows

---

## Key Benefits

### For Users
- **No Re-uploads**: Attach files directly from Google Drive, SharePoint, etc.
- **Preserve Features**: Search, sharing, versioning stay in native platforms
- **Mix Sources**: Combine files from multiple providers in one artifact
- **AI Processing**: Natural language queries against PDFs, images, videos

### For Developers
- **Simple Schema**: Single JSON column, no complex relations
- **Provider Agnostic**: Easy to add new providers
- **Type Safe**: Strong TypeScript types throughout
- **Extensible**: Provider-specific metadata supported

### For Enterprise
- **Security**: Files stay in approved platforms
- **Compliance**: Leverage platform audit trails
- **Collaboration**: Teams use familiar tools
- **Cost Efficient**: AI caching reduces inference costs by 75%

---

## Summary

This architecture enables MemberJunction to work seamlessly with files across any cloud platform while leveraging modern multi-modal AI capabilities. Files are referenced via flexible JSON metadata, preserving provider features and avoiding database complexity, while intelligent caching and provider file APIs optimize AI processing costs.
