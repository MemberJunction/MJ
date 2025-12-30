# Multi-Modal Chat Support Implementation Plan

## Overview

This plan describes the implementation of multi-modal content support (images, video, audio) in MemberJunction conversations. The design provides:

1. **Scalable storage** - Small files inline (base64), large files in MJStorage
2. **Provider flexibility** - Configurable storage providers (S3, Azure, etc.)
3. **Capability metadata** - Model and agent-level input/output support flags
4. **Configurable limits** - System → Model → Agent cascade for size/count limits
5. **Backward compatibility** - Existing text messages remain unchanged
6. **Central utility** - ConversationUtility as single source of truth

---

## Phase 1: Database Schema

### 1.1 AI Model Entity - New Fields

Add the following fields to the `AIModel` table:

```sql
-- Input capabilities
SupportsImageInput          BIT DEFAULT 0
SupportsVideoInput          BIT DEFAULT 0
SupportsAudioInput          BIT DEFAULT 0

-- Output capabilities (for generative models)
SupportsImageOutput         BIT DEFAULT 0
SupportsVideoOutput         BIT DEFAULT 0
SupportsAudioOutput         BIT DEFAULT 0

-- Input size limits in bytes (NULL = use system default)
MaxImageInputSizeBytes      INT NULL    -- Default: 5,242,880 (5MB)
MaxVideoInputSizeBytes      INT NULL    -- Default: 52,428,800 (50MB)
MaxAudioInputSizeBytes      INT NULL    -- Default: 26,214,400 (25MB)

-- Count limits per message (NULL = use system default)
MaxImagesPerMessage         INT NULL    -- Default: 10
MaxVideosPerMessage         INT NULL    -- Default: 3
MaxAudiosPerMessage         INT NULL    -- Default: 5
```

### 1.2 AI Agent Entity - New Fields

Add the following fields to the `AIAgent` table:

```sql
-- Input toggles (agent can disable even if model supports)
AllowImageInput             BIT DEFAULT 1
AllowVideoInput             BIT DEFAULT 0
AllowAudioInput             BIT DEFAULT 0

-- Output toggles
AllowImageOutput            BIT DEFAULT 1
AllowVideoOutput            BIT DEFAULT 0
AllowAudioOutput            BIT DEFAULT 0

-- Override limits (NULL = use model's limit, then system default)
MaxImageInputSizeBytes      INT NULL
MaxVideoInputSizeBytes      INT NULL
MaxAudioInputSizeBytes      INT NULL
MaxImagesPerMessage         INT NULL
MaxVideosPerMessage         INT NULL
MaxAudiosPerMessage         INT NULL

-- Storage configuration
AttachmentStorageProviderID UNIQUEIDENTIFIER NULL  -- FK to File Storage Providers
AttachmentStoragePath       NVARCHAR(500) NULL     -- Root path in storage provider

-- Inline storage threshold (NULL = use system default of 1MB)
-- Files <= this size stored as base64 inline
-- Files > this size stored in MJStorage
-- Set to 0 to always use MJStorage
InlineStorageThresholdBytes INT NULL
```

### 1.3 NEW: Conversation Detail Attachment Entity

Create new table `ConversationDetailAttachment`:

```sql
CREATE TABLE [__mj].[ConversationDetailAttachment] (
    ID                      UNIQUEIDENTIFIER DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    ConversationDetailID    UNIQUEIDENTIFIER NOT NULL,  -- FK to ConversationDetail

    -- Content classification
    AttachmentType          NVARCHAR(20) NOT NULL,      -- 'Image', 'Video', 'Audio', 'Document'
    MimeType                NVARCHAR(100) NOT NULL,     -- 'image/png', 'video/mp4', etc.

    -- File metadata
    FileName                NVARCHAR(4000) NULL,        -- Long for cloud storage paths
    FileSizeBytes           INT NOT NULL,
    Width                   INT NULL,                    -- pixels (image/video)
    Height                  INT NULL,                    -- pixels (image/video)
    DurationSeconds         INT NULL,                    -- audio/video duration

    -- Storage: ONE of these will be populated
    InlineData              NVARCHAR(MAX) NULL,         -- base64 for small files
    FileID                  UNIQUEIDENTIFIER NULL,      -- FK to Files (MJStorage)

    -- Display optimization
    DisplayOrder            INT DEFAULT 0,
    ThumbnailBase64         NVARCHAR(MAX) NULL,         -- Small preview (max 200px)

    -- Constraints (CodeGen will add timestamps and indexes)
    CONSTRAINT FK_CDA_ConversationDetail
        FOREIGN KEY (ConversationDetailID) REFERENCES [__mj].[ConversationDetail](ID),
    CONSTRAINT FK_CDA_File
        FOREIGN KEY (FileID) REFERENCES [__mj].[File](ID),
    CONSTRAINT CK_CDA_StorageType
        CHECK (InlineData IS NOT NULL OR FileID IS NOT NULL)
);
```

### 1.4 System Defaults

These will be defined as constants in code and can be overridden via `mj.config.cjs`:

```javascript
// Default attachment settings
attachmentDefaults: {
    // Size limits (bytes)
    maxImageSizeBytes: 5 * 1024 * 1024,      // 5MB
    maxVideoSizeBytes: 50 * 1024 * 1024,     // 50MB
    maxAudioSizeBytes: 25 * 1024 * 1024,     // 25MB

    // Count limits per message
    maxImagesPerMessage: 10,
    maxVideosPerMessage: 3,
    maxAudiosPerMessage: 5,

    // Storage threshold (files <= this go inline as base64)
    inlineStorageThresholdBytes: 1 * 1024 * 1024,  // 1MB

    // Thumbnail settings
    thumbnailMaxDimension: 200,              // pixels
    thumbnailQuality: 0.7                    // JPEG quality
}
```

---

## Phase 2: Entity Classes and CodeGen

After running CodeGen for the new schema:

### 2.1 Generated Classes
- `ConversationDetailAttachmentEntity` - New entity for attachments
- Updated `AIModelEntity` with new capability/limit fields
- Updated `AIAgentEntity` with new input/output toggles and limits

### 2.2 Validation Rules
- `AttachmentType` must be one of: 'Image', 'Video', 'Audio', 'Document'
- Either `InlineData` OR `FileID` must be populated (not both, not neither)
- `FileSizeBytes` must be > 0

---

## Phase 3: ConversationUtility Extension

Extend `packages/AI/CorePlus/src/conversation-utility.ts` to be the central source of truth for all message content handling.

### 3.1 New Types

```typescript
/**
 * Attachment content in messages
 */
export interface AttachmentContent {
  /** Mode identifier */
  _mode: 'attachment';
  /** Attachment ID (from ConversationDetailAttachment) */
  id: string;
  /** Attachment type */
  type: 'Image' | 'Video' | 'Audio' | 'Document';
  /** MIME type */
  mimeType: string;
  /** Original filename */
  fileName?: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Width (images/video) */
  width?: number;
  /** Height (images/video) */
  height?: number;
  /** Duration in seconds (audio/video) */
  duration?: number;
  /** Thumbnail base64 for preview */
  thumbnail?: string;
}

/**
 * Extended union type for all special content
 */
export type SpecialContent = MentionContent | FormResponseContent | AttachmentContent;
```

### 3.2 New Methods

```typescript
/**
 * Create an attachment reference token
 */
public static CreateAttachmentReference(attachment: AttachmentContent): string;

/**
 * Check if message contains attachments
 */
public static ContainsAttachments(text: string): boolean;

/**
 * Get all attachment references from a message
 */
public static GetAttachmentReferences(text: string): AttachmentContent[];

/**
 * Build ChatMessageContent from ConversationDetail + Attachments
 * This is the primary method for converting stored messages to AI-ready format
 */
public static async BuildChatMessageContent(
  messageText: string,
  attachments: ConversationDetailAttachmentEntity[],
  storageProvider?: FileStorageProviderEntity
): Promise<ChatMessageContent>;

/**
 * Validate attachment against limits
 */
public static ValidateAttachment(
  attachment: { type: string; sizeBytes: number },
  currentCounts: { images: number; videos: number; audios: number },
  agent: AIAgentEntity,
  model: AIModelEntity,
  systemDefaults: AttachmentDefaults
): { allowed: boolean; reason?: string };

/**
 * Get effective limit (agent → model → system cascade)
 */
public static GetEffectiveLimit(
  limitName: string,
  agent: AIAgentEntity,
  model: AIModelEntity,
  systemDefaults: AttachmentDefaults
): number;

/**
 * Determine if attachment should be stored inline or in MJStorage
 */
public static ShouldStoreInline(
  sizeBytes: number,
  agent: AIAgentEntity,
  systemDefaults: AttachmentDefaults
): boolean;
```

### 3.3 Import Updates

Add imports for:
- `ChatMessageContent`, `ChatMessageContentBlock` from `@memberjunction/ai`
- `ConversationDetailAttachmentEntity`, `AIAgentEntity`, `AIModelEntity` from `@memberjunction/core-entities`
- Storage utilities from `@memberjunction/storage`

---

## Phase 4: Attachment Service

Create `packages/AI/CorePlus/src/attachment-service.ts`:

### 4.1 Service Class

```typescript
export class ConversationAttachmentService {
  /**
   * Process and store an attachment
   * Handles: validation, thumbnail generation, inline vs MJStorage decision
   */
  async addAttachment(
    conversationDetailId: string,
    file: { data: Buffer | string; mimeType: string; fileName?: string },
    agent: AIAgentEntity,
    model: AIModelEntity,
    contextUser: UserInfo
  ): Promise<ConversationDetailAttachmentEntity>;

  /**
   * Get attachment data (resolves from inline or MJStorage)
   */
  async getAttachmentData(
    attachment: ConversationDetailAttachmentEntity,
    contextUser: UserInfo
  ): Promise<{ data: string; mimeType: string }>;

  /**
   * Get pre-auth download URL for MJStorage attachments
   */
  async getDownloadUrl(
    attachment: ConversationDetailAttachmentEntity,
    contextUser: UserInfo
  ): Promise<string | null>;

  /**
   * Delete attachment (and underlying file if in MJStorage)
   */
  async deleteAttachment(
    attachmentId: string,
    contextUser: UserInfo
  ): Promise<boolean>;

  /**
   * Load all attachments for a conversation detail
   */
  async getAttachments(
    conversationDetailId: string,
    contextUser: UserInfo
  ): Promise<ConversationDetailAttachmentEntity[]>;

  /**
   * Generate thumbnail for image/video
   */
  private async generateThumbnail(
    data: Buffer,
    mimeType: string,
    maxDimension: number,
    quality: number
  ): Promise<string>;
}
```

---

## Phase 5: UI Components

### 5.1 MentionEditorComponent Updates

File: `packages/Angular/Generic/conversations/src/lib/components/mention/mention-editor.component.ts`

**New Features:**
- Image paste from clipboard (Ctrl+V)
- Drag & drop support
- File picker button
- Inline thumbnail display with remove button
- Click thumbnail to expand

**New Properties:**
```typescript
@Output() attachmentsChanged = new EventEmitter<PendingAttachment[]>();
@Input() maxAttachments: number = 10;
@Input() maxAttachmentSize: number = 5 * 1024 * 1024; // 5MB

private pendingAttachments: PendingAttachment[] = [];

interface PendingAttachment {
  id: string;           // Local ID for tracking
  file: File;           // Original file
  dataUrl: string;      // Base64 data URL
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
}
```

**New Methods:**
```typescript
// Handle paste event for images
private handleImagePaste(event: ClipboardEvent): void;

// Handle drag & drop
onDragOver(event: DragEvent): void;
onDrop(event: DragEvent): void;

// Handle file picker
onFileSelected(event: Event): void;

// Process added file
private async processFile(file: File): Promise<void>;

// Validate file against limits
private validateFile(file: File): { valid: boolean; error?: string };

// Insert thumbnail into editor
private insertThumbnail(attachment: PendingAttachment): void;

// Remove attachment
removeAttachment(id: string): void;

// Get all pending attachments
getPendingAttachments(): PendingAttachment[];

// Clear pending attachments
clearPendingAttachments(): void;
```

### 5.2 New ImageViewerComponent

File: `packages/Angular/Generic/conversations/src/lib/components/image-viewer/`

**Features:**
- Full-screen modal overlay
- Zoom controls (scroll wheel, buttons)
- Pan support for zoomed images
- Download button
- Close on Escape or click outside

```typescript
@Component({
  selector: 'mj-image-viewer',
  template: `...`,
  styles: [`...`]
})
export class ImageViewerComponent {
  @Input() imageUrl: string = '';
  @Input() fileName: string = '';
  @Output() closed = new EventEmitter<void>();

  zoom: number = 1;
  position: { x: number; y: number } = { x: 0, y: 0 };

  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  download(): void;
  close(): void;
}
```

### 5.3 MessageItemComponent Updates

File: `packages/Angular/Generic/conversations/src/lib/components/message/message-item.component.ts`

**New Features:**
- Display attachment thumbnails in message
- Grid layout for multiple images
- Click to expand (opens ImageViewerComponent)
- Video/audio player for those types

**New Methods:**
```typescript
// Load attachments for this message
loadAttachments(): Promise<void>;

// Get image attachments
getImageAttachments(): ConversationDetailAttachmentEntity[];

// Expand image
expandImage(attachment: ConversationDetailAttachmentEntity): void;

// Get thumbnail URL
getThumbnailUrl(attachment: ConversationDetailAttachmentEntity): string;
```

### 5.4 MessageInputComponent Updates

File: `packages/Angular/Generic/conversations/src/lib/components/message-input/message-input.component.ts`

**Changes:**
- Handle attachments from MentionEditor
- Upload attachments on send
- Link attachments to ConversationDetail

```typescript
async sendMessage(): Promise<void> {
  // Get text and attachments
  const text = this.mentionEditor.getPlainTextWithJsonMentions();
  const pendingAttachments = this.mentionEditor.getPendingAttachments();

  // Create message
  const messageDetail = await this.createMessageDetail();
  messageDetail.Message = text;
  await messageDetail.Save();

  // Upload attachments
  for (const pending of pendingAttachments) {
    await this.attachmentService.addAttachment(
      messageDetail.ID,
      pending,
      this.agent,
      this.model,
      this.currentUser
    );
  }

  // Clear and emit
  this.mentionEditor.clear();
  this.mentionEditor.clearPendingAttachments();
  this.messageSent.emit(messageDetail);
}
```

---

## Phase 6: Agent/AI Integration

### 6.1 Message Building for AI

When sending messages to AI providers, use ConversationUtility to build ChatMessageContent:

```typescript
// In agent execution
const attachments = await attachmentService.getAttachments(detail.ID, contextUser);
const content = await ConversationUtility.BuildChatMessageContent(
  detail.Message,
  attachments,
  storageProvider
);

const chatMessage: ChatMessage = {
  role: detail.Role === 'User' ? 'user' : 'assistant',
  content: content
};
```

### 6.2 Provider Compatibility

The existing provider implementations already handle ChatMessageContentBlock arrays:
- **OpenAI**: ✅ Handles `image_url` blocks
- **Anthropic**: ✅ Updated to handle `image_url` blocks with vision support
- **Gemini**: ✅ Maps to `inlineData` format
- **Mistral**: ✅ Native `image_url` support
- **Others**: Fall back to text extraction for non-vision models

---

## Implementation Checklist

### Phase 1: Database
- [ ] Create migration for AIModel new fields
- [ ] Create migration for AIAgent new fields
- [ ] Create migration for ConversationDetailAttachment table
- [ ] Run CodeGen to generate entity classes

### Phase 2: Core Types (Already Done)
- [x] Extend ChatMessageContentBlock with metadata
- [x] Add serialization utilities
- [x] Update Anthropic provider for vision

### Phase 3: ConversationUtility
- [ ] Add AttachmentContent type
- [ ] Add CreateAttachmentReference method
- [ ] Add ContainsAttachments method
- [ ] Add GetAttachmentReferences method
- [ ] Add BuildChatMessageContent method
- [ ] Add ValidateAttachment method
- [ ] Add GetEffectiveLimit method
- [ ] Add ShouldStoreInline method

### Phase 4: Attachment Service
- [ ] Create ConversationAttachmentService class
- [ ] Implement addAttachment with validation
- [ ] Implement getAttachmentData
- [ ] Implement getDownloadUrl
- [ ] Implement deleteAttachment
- [ ] Implement thumbnail generation

### Phase 5: UI Components
- [ ] Update MentionEditorComponent for image paste
- [ ] Add drag & drop support
- [ ] Add file picker button
- [ ] Create ImageViewerComponent
- [ ] Update MessageItemComponent for thumbnails
- [ ] Update MessageInputComponent for attachments
- [ ] Add CSS styles for attachment display

### Phase 6: Integration
- [ ] Update agent execution to use BuildChatMessageContent
- [ ] Test with vision-capable models
- [ ] Test storage provider integration

---

## Storage Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Adds Attachment                      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Validate Against Limits                      │
│  1. Check agent.AllowImageInput (etc.)                          │
│  2. Check model.SupportsImageInput (etc.)                       │
│  3. Check size: agent ?? model ?? system default                │
│  4. Check count: agent ?? model ?? system default               │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
            Size ≤ Threshold        Size > Threshold
                    │                       │
                    ▼                       ▼
        ┌───────────────────┐    ┌───────────────────┐
        │  Store as Base64  │    │  Upload to        │
        │  in InlineData    │    │  MJStorage        │
        │  field            │    │  Store FileID     │
        └───────────────────┘    └───────────────────┘
                    │                       │
                    └───────────┬───────────┘
                                │
                                ▼
        ┌─────────────────────────────────────────────┐
        │  Generate Thumbnail (max 200px)              │
        │  Store in ThumbnailBase64                   │
        └─────────────────────────────────────────────┘
                                │
                                ▼
        ┌─────────────────────────────────────────────┐
        │  Create ConversationDetailAttachment        │
        │  record with metadata                       │
        └─────────────────────────────────────────────┘
```

---

## Limit Cascade Logic

```
┌─────────────────────────────────────────────────────────────────┐
│                    Get Effective Limit                           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │ Agent has override?   │
                    └───────────────────────┘
                      Yes │           │ No
                          ▼           ▼
                ┌─────────────┐   ┌───────────────────────┐
                │ Use Agent   │   │ Model has setting?    │
                │ Value       │   └───────────────────────┘
                └─────────────┘     Yes │           │ No
                                        ▼           ▼
                              ┌─────────────┐   ┌─────────────┐
                              │ Use Model   │   │ Use System  │
                              │ Value       │   │ Default     │
                              └─────────────┘   └─────────────┘
```

---

## Testing Strategy

### Unit Tests
- ConversationUtility attachment methods
- Limit validation logic
- Inline vs MJStorage decision

### Integration Tests
- Upload attachment flow
- Download/preview flow
- AI message building with attachments

### E2E Tests
- Paste image in editor
- Drag & drop file
- Send message with attachments
- View message with thumbnails
- Expand image to full size

---

## Future Considerations

1. **Video thumbnails** - Generate frame captures for video previews
2. **Audio waveforms** - Visual representation of audio files
3. **Attachment search** - Search within conversation attachments
4. **Deduplication** - Detect and reuse identical files
5. **Compression** - Auto-compress images before storage
6. **CDN integration** - Serve attachments via CDN for performance

---

## Implementation Progress

### Completed
- [x] **Phase 1**: Database migration created (`V202512301826__v2.130.x_Multi_Modal_Chat_Support.sql`)
- [x] **Phase 2**: Core types extended (`chat.types.ts` - serialization utilities)
- [x] **Phase 2**: Anthropic provider updated with vision support
- [x] **Phase 3**: ConversationUtility extended with attachment methods and types
- [x] **Phase 4**: ConversationAttachmentService created
- [x] **Phase 5.1**: MentionEditorComponent updated with paste/drag-drop/file-picker
- [x] **Phase 5.2**: ImageViewerComponent created for full-size display
- [x] **Phase 5.3**: MessageItemComponent updated for attachment thumbnails
- [x] **Phase 5.4**: MessageInputBoxComponent updated for attachment flow

### In Progress
- [ ] **Phase 6**: AI agent execution integration (passing attachments to providers)

### Pending
- [ ] Run CodeGen after migration to generate entities
- [ ] E2E testing of full attachment flow
