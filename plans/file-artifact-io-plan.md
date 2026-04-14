# File-Based Artifact I/O Plan

## Status: DRAFT
## Created: 2025-03-13
## Branch: TBD (cut from `next`)

---

## Executive Summary

Enable MemberJunction agents to accept files (PDF, Excel, Word) as inputs and produce them as artifacts. The system already has significant infrastructure in place — file generation Actions (PDF Generator, Excel Writer), MJStorage with 7 cloud providers, dual inline/external storage on attachments, and a pluggable artifact viewer system. This plan bridges the gaps between these existing systems.

### What Exists Today

| Component | Status | Location |
|-----------|--------|----------|
| PDF Generator Action | Exists (pdfkit-based) | `CoreActions/src/custom/files/pdf-generator.action.ts` |
| Excel Writer Action | Exists (export-engine) | `CoreActions/src/custom/files/excel-writer.action.ts` |
| Excel Reader Action | Exists (ExcelJS) | `CoreActions/src/custom/files/excel-reader.action.ts` |
| PDF Extractor Action | Exists (pdf-parse) | `CoreActions/src/custom/files/pdf-extractor.action.ts` |
| Gamma PPT Generator | Exists (external API) | `CoreActions/src/custom/integration/gamma-generate-presentation.action.ts` |
| BaseFileHandlerAction | Exists (shared base) | `CoreActions/src/custom/utilities/base-file-handler.ts` |
| MJStorage (7 providers) | Exists | `packages/MJStorage/` |
| Dual inline/FileID storage | Exists on attachments | `ConversationDetailAttachment` entity |
| Artifact viewer plugin system | Exists (7 plugins) | `packages/Angular/Generic/artifacts/` |
| Artifact versioning + collections | Exists | `MJArtifact`, `MJArtifactVersion` entities |
| Multimodal attachment pipeline | Exists | `ConversationUtility.BuildChatMessageContent()` |

### What's Missing (Gaps to Fill)

| Gap | Description |
|-----|-------------|
| **ArtifactVersion binary storage** | `Content` is `nvarchar(MAX)` — no way to store/reference binary files |
| **AgentRunner ↔ file output bridge** | `ProcessAgentArtifacts()` only handles text payload via `JSON.stringify()` |
| **File artifact types in DB** | No PDF/Excel/Word entries in `MJ: Artifact Types` |
| **Angular file viewer plugins** | No `BaseArtifactViewerPluginComponent` implementations for PDF/Excel/Word |
| **Word document generation Action** | PDF and Excel exist, but no DOCX generation |
| **BaseFileHandlerAction MJStorage integration** | `saveToMJStorage()` and `loadFromMJStorage()` have TODOs |
| **File→agent context extraction** | No automated "parse this file and give the agent the content" flow |

---

## Phase 1: ArtifactVersion Binary Storage (Database + Entity Layer)

**Goal**: Allow `ArtifactVersion` records to reference files stored in MJStorage instead of only inline text.

### 1.1 Database Migration

Create migration: `V202503XX____v5.12.x_Artifact_Binary_Storage.sql`

```sql
-- Add binary storage fields to ArtifactVersion
ALTER TABLE ${flyway:defaultSchema}.ArtifactVersion ADD
    FileID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_ArtifactVersion_File
            FOREIGN KEY REFERENCES ${flyway:defaultSchema}.[File](ID),
    MimeType NVARCHAR(200) NULL,
    FileName NVARCHAR(500) NULL,
    ContentSizeBytes BIGINT NULL;

-- Add ContentMode to distinguish text vs file artifacts
-- 'Text' = Content column has the data (existing behavior)
-- 'File' = FileID references MJStorage file record
ALTER TABLE ${flyway:defaultSchema}.ArtifactVersion ADD
    ContentMode NVARCHAR(10) NOT NULL
        CONSTRAINT DF_ArtifactVersion_ContentMode DEFAULT 'Text'
        CONSTRAINT CK_ArtifactVersion_ContentMode CHECK (ContentMode IN ('Text', 'File'));
```

**Design decisions**:
- Uses `FileID` FK to the existing `MJ: Files` entity — same pattern as `ConversationDetailAttachment`
- `ContentMode` makes the storage mode explicit (vs. inferring from NULL checks)
- `MimeType`, `FileName`, `ContentSizeBytes` are denormalized from `File` for display without joins
- No size limits — MJStorage handles arbitrarily large files
- `Content` column remains for text artifacts (100% backward compatible)

### 1.2 ArtifactType Content Category

Add `ContentCategory` to `ArtifactType` to distinguish text vs file artifact types:

```sql
ALTER TABLE ${flyway:defaultSchema}.ArtifactType ADD
    ContentCategory NVARCHAR(10) NOT NULL
        CONSTRAINT DF_ArtifactType_ContentCategory DEFAULT 'Text'
        CONSTRAINT CK_ArtifactType_ContentCategory CHECK (ContentCategory IN ('Text', 'File'));

-- Update existing types
UPDATE ${flyway:defaultSchema}.ArtifactType SET ContentCategory = 'Text'; -- All current types are text
```

### 1.3 New Artifact Type Records

Insert new file-based artifact types:

```sql
-- PDF
INSERT INTO ${flyway:defaultSchema}.ArtifactType
    (ID, Name, Description, ContentType, IsEnabled, ContentCategory, DriverClass, Icon)
VALUES
    ('A1B2C3D4-0001-0001-0001-000000000001', 'PDF',
     'PDF document files',
     'application/pdf', 1, 'File',
     'PdfArtifactViewerPlugin', 'fa-file-pdf');

-- Excel Spreadsheet
INSERT INTO ${flyway:defaultSchema}.ArtifactType
    (ID, Name, Description, ContentType, IsEnabled, ContentCategory, DriverClass, Icon)
VALUES
    ('A1B2C3D4-0001-0001-0001-000000000002', 'Excel Spreadsheet',
     'Microsoft Excel spreadsheet files (.xlsx)',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 1, 'File',
     'XlsxArtifactViewerPlugin', 'fa-file-excel');

-- Word Document
INSERT INTO ${flyway:defaultSchema}.ArtifactType
    (ID, Name, Description, ContentType, IsEnabled, ContentCategory, DriverClass, Icon)
VALUES
    ('A1B2C3D4-0001-0001-0001-000000000003', 'Word Document',
     'Microsoft Word document files (.docx)',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1, 'File',
     'DocxArtifactViewerPlugin', 'fa-file-word');
```

### 1.4 Run CodeGen

After migration, run CodeGen to:
- Update `MJArtifactVersionEntity` with new fields (`FileID`, `MimeType`, `FileName`, `ContentSizeBytes`, `ContentMode`)
- Update `MJArtifactTypeEntity` with `ContentCategory`
- Generate updated views, stored procedures, and TypeScript classes

### 1.5 Update ArtifactMetadataEngine

In `packages/MJCoreEntities/src/engines/artifacts.ts`:
- Add helper method `IsFileArtifact(version: MJArtifactVersionEntity): boolean`
- Add helper method `GetArtifactTypeByMimeType(mimeType: string): MJArtifactTypeEntity | undefined`
- These will be used by AgentRunner and viewer components

**Files to modify**:
- Migration: `migrations/v5/V202503XXHHMM__v5.12.x_Artifact_Binary_Storage.sql` (new)
- After CodeGen: `packages/MJCoreEntities/src/generated/entity_subclasses.ts` (auto-generated)
- Engine: `packages/MJCoreEntities/src/engines/artifacts.ts`

---

## Phase 2: Fix BaseFileHandlerAction MJStorage Integration

**Goal**: The existing `BaseFileHandlerAction` has TODO stubs for MJStorage read/write. Fix these to use the real `MJ: Files` entity and MJStorage drivers.

### 2.1 Fix `loadFromMJStorage()`

Currently references "Document Libraries" (wrong entity). Should:
1. Load `MJFileEntity` by ID from `MJ: Files`
2. Get the associated `FileStorageAccount` and `FileStorageProvider`
3. Use `FileStorageBase` driver to generate a download URL or stream content
4. Return the file content as a Buffer

```typescript
// Pseudocode for the fix
private async loadFromMJStorage(fileId: string, params: RunActionParams): Promise<FileContent> {
    const rv = new RunView();
    const fileResult = await rv.RunView<MJFileEntity>({
        EntityName: 'MJ: Files',
        ExtraFilter: `ID = '${fileId}'`,
        ResultType: 'entity_object'
    }, params.ContextUser);

    if (!fileResult.Success || fileResult.Results.length === 0)
        throw new Error(`File not found: ${fileId}`);

    const file = fileResult.Results[0];
    const engine = FileStorageEngine.Instance;
    const accountWithProvider = engine.GetAccountWithProvider(file.ProviderID);

    // Initialize driver and download
    const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(
        FileStorageBase, accountWithProvider.provider.ServerDriverKey
    );
    await initializeDriverWithAccountCredentials(driver, accountWithProvider, params.ContextUser);

    const content = await driver.getObject(file.ProviderKey);
    return {
        content: Buffer.from(content),
        fileName: file.Name,
        mimeType: file.ContentType,
        source: 'storage'
    };
}
```

### 2.2 Fix `saveToMJStorage()`

Currently creates a "Document Libraries" record (wrong). Should:
1. Determine the target `FileStorageAccount` (from config or params)
2. Initialize the storage driver
3. Upload the file content, get back a `ProviderKey`
4. Create an `MJ: Files` entity record with the metadata
5. Return the File ID

```typescript
// Pseudocode for the fix
protected async saveToMJStorage(
    content: Buffer,
    fileName: string,
    mimeType: string,
    params: RunActionParams
): Promise<string> {
    // Get default storage account (from config or first active)
    const engine = FileStorageEngine.Instance;
    await engine.Config(false, params.ContextUser);
    const account = this.getDefaultStorageAccount(engine);

    // Initialize driver
    const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(
        FileStorageBase, account.provider.ServerDriverKey
    );
    await initializeDriverWithAccountCredentials(driver, account, params.ContextUser);

    // Upload file
    const storagePath = `artifacts/${new Date().toISOString().slice(0,10)}/${uuidv4()}/${fileName}`;
    await driver.putObject(storagePath, content, mimeType);

    // Create File entity record
    const md = new Metadata();
    const fileEntity = await md.GetEntityObject<MJFileEntity>('MJ: Files', params.ContextUser);
    fileEntity.Name = fileName;
    fileEntity.ContentType = mimeType;
    fileEntity.ProviderID = account.provider.ID;
    fileEntity.ProviderKey = storagePath;
    fileEntity.Status = 'Uploaded';

    const saved = await fileEntity.Save();
    if (!saved) throw new Error('Failed to save file record');

    return fileEntity.ID;
}
```

**Files to modify**:
- `packages/Actions/CoreActions/src/custom/utilities/base-file-handler.ts`

---

## Phase 3: AgentRunner File Output Bridge

**Goal**: When an agent produces a file (via Action tool call), `AgentRunner` should create a file-backed artifact with proper MJStorage integration.

### 3.1 Extend `ExecuteAgentResult`

In `packages/AI/CorePlus/src/agent-types.ts` (or wherever `ExecuteAgentResult` is defined):

```typescript
export interface FileOutput {
    /** Display name for the file */
    FileName: string;
    /** MIME type (e.g., 'application/pdf') */
    MimeType: string;
    /** The binary file content */
    Data: Buffer;
    /** Optional: override artifact type (otherwise inferred from MimeType) */
    ArtifactTypeID?: string;
    /** Agent's description of the file */
    Description?: string;
}

export type ExecuteAgentResult<P = any> = {
    success: boolean;
    payload?: P;
    agentRun: MJAIAgentRunEntityExtended;
    payloadArtifactTypeID?: string;
    responseForm?: AgentResponseForm;
    actionableCommands?: ActionableCommand[];
    automaticCommands?: AutomaticCommand[];
    memoryContext?: { notes: unknown[]; examples: unknown[] };
    mediaOutputs?: MediaOutput[];
    /** NEW: File outputs to be saved as file-backed artifacts */
    fileOutputs?: FileOutput[];
};
```

### 3.2 Extend `AgentRunner.ProcessAgentArtifacts()`

In `packages/AI/Agents/src/AgentRunner.ts`, add a new method `ProcessFileArtifacts()` called after `ProcessAgentArtifacts()`:

```typescript
protected async ProcessFileArtifacts(
    result: ExecuteAgentResult,
    conversationDetailId: string,
    contextUser: UserInfo
): Promise<void> {
    if (!result.fileOutputs?.length) return;

    const md = new Metadata();
    const artifactEngine = ArtifactMetadataEngine.Instance;

    for (const fileOutput of result.fileOutputs) {
        // 1. Resolve artifact type from MimeType
        const artifactType = fileOutput.ArtifactTypeID
            ? artifactEngine.FindArtifactByID(fileOutput.ArtifactTypeID)
            : artifactEngine.GetArtifactTypeByMimeType(fileOutput.MimeType);

        if (!artifactType) {
            LogError(`No artifact type found for MIME type: ${fileOutput.MimeType}`);
            continue;
        }

        // 2. Upload to MJStorage → get FileID
        const fileId = await this.uploadToMJStorage(
            fileOutput.Data,
            fileOutput.FileName,
            fileOutput.MimeType,
            contextUser
        );

        // 3. Create Artifact header
        const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', contextUser);
        artifact.Name = fileOutput.FileName;
        artifact.Description = fileOutput.Description || `Generated ${artifactType.Name}`;
        artifact.TypeID = artifactType.ID;
        artifact.UserID = contextUser.ID;
        artifact.Visibility = this.getArtifactVisibility(result);
        if (!await artifact.Save()) {
            LogError(`Failed to save artifact for file: ${fileOutput.FileName}`);
            continue;
        }

        // 4. Create ArtifactVersion with FileID (not Content)
        const version = await md.GetEntityObject<MJArtifactVersionEntity>(
            'MJ: Artifact Versions', contextUser
        );
        version.ArtifactID = artifact.ID;
        version.VersionNumber = 1;
        version.ContentMode = 'File';
        version.FileID = fileId;
        version.MimeType = fileOutput.MimeType;
        version.FileName = fileOutput.FileName;
        version.ContentSizeBytes = fileOutput.Data.length;
        version.UserID = contextUser.ID;
        if (!await version.Save()) {
            LogError(`Failed to save artifact version for file: ${fileOutput.FileName}`);
            continue;
        }

        // 5. Link to conversation detail
        const link = await md.GetEntityObject<MJConversationDetailArtifactEntity>(
            'MJ: Conversation Detail Artifacts', contextUser
        );
        link.ConversationDetailID = conversationDetailId;
        link.ArtifactVersionID = version.ID;
        link.Direction = 'Output';
        await link.Save();
    }
}
```

### 3.3 Update Agent Action Execution to Capture File Outputs

When an agent calls a file-generation Action (like "PDF Generator" or "Excel Writer"), the Action returns base64 data or a FileID as output params. The agent execution loop needs to:

1. Detect when an Action produced file output (check for `PDFData`, `ExcelData`, `GeneratedFileID` output params)
2. Convert these to `FileOutput` objects on the `ExecuteAgentResult`
3. This can be done in the agent's post-Action processing or in a new utility

**Option A** (recommended): Add a convention where Actions set a standardized output param:

```typescript
// Actions that produce files should set these standard output params:
params.Params.push({ Name: '__FileOutput', Type: 'Output', Value: {
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    data: base64Data,  // base64 string
    description: 'Generated PDF report'
}});
```

**Option B**: The agent itself constructs `fileOutputs` from Action results before returning.

Recommend Option A for discoverability — any Action can produce file output without the agent needing special knowledge.

**Files to modify**:
- `packages/AI/CorePlus/src/` — wherever `ExecuteAgentResult` is defined
- `packages/AI/Agents/src/AgentRunner.ts` — add `ProcessFileArtifacts()`
- Existing file Actions — add standardized `__FileOutput` param convention

---

## Phase 4: Word Document Generation Action

**Goal**: Add a "Word Document Generator" Action to complement the existing PDF Generator and Excel Writer.

### 4.1 New Action: `word-generator.action.ts`

Location: `packages/Actions/CoreActions/src/custom/files/word-generator.action.ts`

**Library**: `docx` npm package (programmatic DOCX generation with full formatting)

**Input Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `Sections` | JSON array | Array of document sections, each with headings, paragraphs, tables, lists |
| `Content` | string | Alternative: raw Markdown/HTML to convert |
| `ContentType` | string | `'markdown'` \| `'html'` \| `'structured'` (default: `'structured'`) |
| `FileName` | string | Output filename (default: `'document.docx'`) |
| `Options` | JSON | Page size, margins, orientation, fonts, headers/footers |
| `OutputFileID` | string | Optional MJStorage file ID to save to |

**Structured input format** (what the LLM generates):

```json
{
  "sections": [
    {
      "heading": "Quarterly Report",
      "level": 1,
      "content": [
        { "type": "paragraph", "text": "This report covers Q1 2025 performance." },
        { "type": "table", "headers": ["Metric", "Value", "Change"],
          "rows": [["Revenue", "$1.2M", "+12%"], ["Users", "45,000", "+8%"]] },
        { "type": "list", "items": ["Key finding 1", "Key finding 2"], "ordered": false },
        { "type": "image", "url": "data:image/png;base64,...", "width": 400, "caption": "Chart" }
      ]
    }
  ]
}
```

**Output Parameters**: `DocxData` (base64), `GeneratedFileID` (if saved to storage)

### 4.2 Enhance Existing PDF Generator

The current PDF Generator uses `pdfkit` with a simplistic HTML parser (regex-based). Enhance it:

1. **Option A**: Replace pdfkit with Puppeteer for high-fidelity HTML→PDF
   - Pro: Perfect rendering of complex HTML/CSS
   - Con: Puppeteer is a heavy dependency (~300MB Chromium)

2. **Option B** (recommended for now): Improve the pdfkit approach with a proper HTML parser
   - Use `htmlparser2` for proper HTML parsing (lightweight)
   - Support tables, images (base64), and basic CSS
   - Keep pdfkit for lighter server footprint
   - Add Puppeteer as an optional "high fidelity" mode if the dependency is present

### 4.3 Add npm Dependencies

```json
// packages/Actions/CoreActions/package.json
{
  "dependencies": {
    "docx": "^9.x",           // Word document generation
    "htmlparser2": "^9.x"     // Better HTML parsing for PDF generator
  }
}
```

**Files to create/modify**:
- `packages/Actions/CoreActions/src/custom/files/word-generator.action.ts` (new)
- `packages/Actions/CoreActions/src/custom/files/pdf-generator.action.ts` (enhance)
- `packages/Actions/CoreActions/package.json` (add deps)
- `packages/Actions/CoreActions/src/custom/files/index.ts` (export new action)

---

## Phase 5: Angular File Viewer Plugins

**Goal**: Build `BaseArtifactViewerPluginComponent` implementations for PDF, Excel, and Word files.

### 5.1 Shared Infrastructure

**New service: `ArtifactFileService`**

Needed by all file viewers to load binary content from MJStorage:

```typescript
@Injectable()
export class ArtifactFileService {
    /**
     * Given an artifact version with ContentMode='File', loads the file content.
     * Returns a Blob URL suitable for <iframe>, <a download>, etc.
     */
    async GetFileBlobUrl(version: MJArtifactVersionEntity): Promise<string> {
        // 1. Get FileID from version
        // 2. Call GraphQL to get pre-authenticated download URL
        // 3. Fetch the file content
        // 4. Create and return a Blob URL
    }

    async GetFileBuffer(version: MJArtifactVersionEntity): Promise<ArrayBuffer> {
        // Same as above but returns raw buffer (for libraries that need it)
    }

    async DownloadFile(version: MJArtifactVersionEntity): void {
        // Trigger browser download of the file
    }
}
```

**New GraphQL resolver** (or extend existing FileResolver):

```graphql
query GetArtifactFileDownloadUrl($artifactVersionId: String!) {
    GetArtifactFileDownloadUrl(ArtifactVersionID: $artifactVersionId) {
        DownloadUrl
        FileName
        MimeType
        ContentSizeBytes
    }
}
```

This resolver:
1. Loads the `ArtifactVersion` by ID
2. Gets the associated `File` entity via `FileID`
3. Uses MJStorage to generate a pre-authenticated download URL
4. Returns the URL (client fetches directly from storage provider)

### 5.2 PDF Viewer Plugin

**Library**: `pdfjs-dist` (Mozilla's PDF.js — renders PDF in canvas/SVG, no iframe needed)

**Component**: `PdfArtifactViewerComponent`

```
┌─────────────────────────────────────────┐
│ PDF Viewer                    [⬇] [🖨]  │
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ │         PDF Page Rendering          │ │
│ │         (pdf.js canvas)             │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│ ◄  Page 3 of 15  ►     [−] 100% [+]    │
└─────────────────────────────────────────┘
```

Features:
- Page navigation (prev/next, jump to page)
- Zoom controls
- Print button
- Download button (via `ArtifactFileService.DownloadFile()`)
- Text selection/search (pdf.js supports this)
- `hasDisplayContent = true` (renders in Display tab)
- `parentShouldShowRawContent = false` (no JSON tab for binary)
- Additional tab: "Info" (page count, file size, metadata)

### 5.3 Excel Viewer Plugin

**Library**: `xlsx` (SheetJS) for parsing, then render with AG Grid or Kendo Grid

**Component**: `XlsxArtifactViewerComponent`

```
┌─────────────────────────────────────────┐
│ Excel Viewer                  [⬇] [🖨]  │
│ ┌─────────┬────────┬──────────────────┐ │
│ │ Sheet1  │ Sheet2 │ Summary          │ │
│ ├─────────┴────────┴──────────────────┤ │
│ │ A        │ B       │ C       │ D    │ │
│ │ Region   │ Revenue │ Growth  │ ...  │ │
│ │ North Am │ $1.2M   │ 12%     │      │ │
│ │ Europe   │ $890K   │ 8%      │      │ │
│ │ APAC     │ $670K   │ 23%     │      │ │
│ └──────────┴─────────┴─────────┴──────┘ │
│ 3 sheets · 450 rows · 12 columns        │
└─────────────────────────────────────────┘
```

Features:
- Sheet tabs (multiple worksheets)
- Sortable/filterable grid (reuse AG Grid already in the project)
- Cell formatting preserved where possible
- Download button
- `hasDisplayContent = true`
- `parentShouldShowRawContent = false`
- Additional tabs: one per worksheet

### 5.4 Word Viewer Plugin

**Library**: `mammoth` (DOCX→HTML) for rendering

**Component**: `DocxArtifactViewerComponent`

```
┌─────────────────────────────────────────┐
│ Word Document Viewer          [⬇] [🖨]  │
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ │   Quarterly Report                  │ │
│ │                                     │ │
│ │   This report covers Q1 2025...     │ │
│ │                                     │ │
│ │   ┌────────┬─────────┬────────┐     │ │
│ │   │ Metric │ Value   │ Change │     │ │
│ │   ├────────┼─────────┼────────┤     │ │
│ │   │ Rev    │ $1.2M   │ +12%   │     │ │
│ │   └────────┴─────────┴────────┘     │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

Features:
- HTML rendering of DOCX content (mammoth handles the conversion)
- Rendered in sandboxed container (similar to existing HtmlArtifactViewerPlugin pattern)
- Download button
- Print button
- `hasDisplayContent = true`
- `parentShouldShowRawContent = false`

### 5.5 Shared Download/Print Toolbar

All file viewers need download and print. Rather than duplicating, extend `ArtifactViewerPanelComponent` to recognize file artifacts and show a download button in the standard toolbar.

In `artifact-viewer-panel.component.ts`:
```typescript
get IsFileArtifact(): boolean {
    return this.currentVersion?.ContentMode === 'File';
}

async DownloadFile(): Promise<void> {
    await this.artifactFileService.DownloadFile(this.currentVersion);
}
```

### 5.6 npm Dependencies (Angular package)

```json
// packages/Angular/Generic/artifacts/package.json
{
  "dependencies": {
    "pdfjs-dist": "^4.x",     // PDF rendering
    "xlsx": "^0.20.x",        // Excel parsing (SheetJS)
    "mammoth": "^1.x"         // DOCX → HTML conversion
  }
}
```

**Files to create/modify**:
- `packages/Angular/Generic/artifacts/src/lib/services/artifact-file.service.ts` (new)
- `packages/Angular/Generic/artifacts/src/lib/components/plugins/pdf-artifact-viewer.component.ts` (new)
- `packages/Angular/Generic/artifacts/src/lib/components/plugins/xlsx-artifact-viewer.component.ts` (new)
- `packages/Angular/Generic/artifacts/src/lib/components/plugins/docx-artifact-viewer.component.ts` (new)
- `packages/Angular/Generic/artifacts/src/lib/artifacts.module.ts` (register new plugins)
- `packages/Angular/Generic/artifacts/src/lib/components/artifact-viewer-panel.component.ts` (download button)
- `packages/MJServer/src/resolvers/FileResolver.ts` (new GraphQL query for artifact file URLs)

---

## Phase 6: File Input Enhancement

**Goal**: Make it seamless for agents to consume files provided by users, and for users to feed existing artifacts back as inputs.

### 6.1 Enhanced File Content Extraction for Agent Context

When a user attaches a PDF/Excel/Word file to a conversation, the agent should receive structured text content (not just raw binary). Create a pre-processing step:

**New utility**: `FileContentExtractor` (in `@memberjunction/ai-core-plus` or similar)

```typescript
export class FileContentExtractor {
    /**
     * Given a file attachment, extract text/structured content suitable for LLM context.
     */
    static async Extract(attachment: AttachmentData): Promise<string> {
        switch (attachment.mimeType) {
            case 'application/pdf':
                return await this.extractPdf(attachment);
            case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                return await this.extractExcel(attachment);
            case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                return await this.extractDocx(attachment);
            default:
                // For images and other types, fall through to multimodal path
                return '';
        }
    }

    private static async extractPdf(attachment: AttachmentData): Promise<string> {
        // Use pdf-parse to extract text
        const buffer = Buffer.from(attachment.content, 'base64');
        const data = await pdfParse(buffer);
        return `[PDF: ${attachment.fileName}, ${data.numpages} pages]\n\n${data.text}`;
    }

    private static async extractExcel(attachment: AttachmentData): Promise<string> {
        // Use SheetJS to convert to markdown tables
        const buffer = Buffer.from(attachment.content, 'base64');
        const workbook = XLSX.read(buffer);
        let result = `[Excel: ${attachment.fileName}, ${workbook.SheetNames.length} sheets]\n\n`;
        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            result += `## Sheet: ${sheetName}\n\n`;
            result += XLSX.utils.sheet_to_csv(sheet) + '\n\n';
        }
        return result;
    }

    private static async extractDocx(attachment: AttachmentData): Promise<string> {
        // Use mammoth to convert to markdown
        const buffer = Buffer.from(attachment.content, 'base64');
        const result = await mammoth.extractRawText({ buffer });
        return `[Word: ${attachment.fileName}]\n\n${result.value}`;
    }
}
```

### 6.2 Integration Point: ConversationUtility

In `ConversationUtility.BuildChatMessageContent()`, when processing document-type attachments:

1. **Current behavior**: Documents go through as `file_url` content blocks (requires model support)
2. **Enhanced behavior**: Also extract text content and include as a `text` block alongside the file block

This gives the LLM both:
- The raw file (if the model supports it natively, like Claude with PDFs)
- Extracted text (as a fallback, and for models that don't support file inputs)

### 6.3 "Attach Artifact as Input" UI Flow

Allow users to reference an existing artifact from their collections as input to a new conversation turn:

**UI**: Add an "Attach Artifact" button in the message input area (alongside the existing file attachment button)

**Flow**:
1. User clicks "Attach Artifact"
2. Modal shows user's recent artifacts and collections
3. User selects an artifact + version
4. System creates a `ConversationDetailArtifact` with `Direction='Input'`
5. If it's a file artifact, the file content is extracted and included in the LLM context
6. If it's a text artifact, the `Content` is included directly

This creates a feedback loop: agent generates file → user saves to collection → user feeds it back to another agent conversation.

**Files to create/modify**:
- `packages/AI/CorePlus/src/file-content-extractor.ts` (new)
- `packages/AI/CorePlus/src/conversation-utility.ts` (enhance document handling)
- `packages/Angular/Generic/conversations/src/lib/components/message-input.component.ts` (attach artifact button)
- `packages/Angular/Generic/conversations/src/lib/components/artifact-picker-modal.component.ts` (new)

---

## Phase 7: Agent Tool Registration for File Actions

**Goal**: Ensure agents can discover and use file generation Actions as tools during execution.

### 7.1 Register File Actions with Agent Tool System

The existing file Actions (PDF Generator, Excel Writer, new Word Generator) need to be:
1. Registered as available tools for agents
2. Have clear parameter descriptions so the LLM knows how to call them
3. Return results in a format that flows through to `fileOutputs`

### 7.2 Standardized File Output Convention

All file-producing Actions should follow a standard output pattern:

```typescript
// Standard output params for file-producing Actions
interface FileActionOutput {
    /** The generated file as base64 */
    FileData: string;
    /** MIME type of the generated file */
    FileMimeType: string;
    /** Suggested filename */
    FileName: string;
    /** File size in bytes */
    FileSizeBytes: number;
    /** Optional: MJStorage File ID if saved */
    GeneratedFileID?: string;
}
```

Update existing Actions to include these standardized params alongside their current output params (backward compatible).

### 7.3 Agent Post-Action Hook

In the agent execution loop, after an Action returns:
1. Check if the Action result contains `FileData` output param
2. If yes, convert to a `FileOutput` and add to the result's `fileOutputs`
3. This bridges the gap automatically without agents needing custom code

**Files to modify**:
- `packages/AI/Agents/src/base-agent.ts` (post-Action file output detection)
- `packages/Actions/CoreActions/src/custom/files/pdf-generator.action.ts` (standardized params)
- `packages/Actions/CoreActions/src/custom/files/excel-writer.action.ts` (standardized params)
- `packages/Actions/CoreActions/src/custom/files/word-generator.action.ts` (standardized params)

---

## Implementation Order & Dependencies

```
Phase 1 (DB + Entity)
  │
  ├──► Phase 2 (Fix BaseFileHandlerAction)
  │       │
  │       └──► Phase 4 (Word Generator Action)
  │
  ├──► Phase 3 (AgentRunner bridge)
  │       │
  │       └──► Phase 7 (Agent tool registration)
  │
  └──► Phase 5 (Angular viewers)
          │
          └──► Phase 6 (Input enhancement)
```

**Phases 1, 2, and 3** are the critical path — they enable the core flow.
**Phase 4** (Word Action) can start after Phase 2 (needs working MJStorage).
**Phase 5** (viewers) can start after Phase 1 (needs new entity fields).
**Phase 6** (inputs) is the most independent and can be done in parallel with Phase 5.
**Phase 7** ties everything together at the agent level.

### Estimated Complexity

| Phase | Scope | Key Risk |
|-------|-------|----------|
| 1 | Migration + CodeGen + engine helper | Low — straightforward schema addition |
| 2 | Fix BaseFileHandlerAction | Medium — MJStorage driver initialization |
| 3 | AgentRunner extension | Medium — integration with existing artifact flow |
| 4 | Word Generator Action | Low — docx library is well-documented |
| 5 | Angular viewer plugins | Medium-High — pdf.js integration, SheetJS parsing |
| 6 | File input extraction | Medium — extraction quality varies by format |
| 7 | Agent tool registration | Low — convention-based bridging |

---

## Open Questions

1. **Default storage account**: Should there be a system-level "default artifact storage account" configuration, or should we use the first active `FileStorageAccount`? Recommend: config setting in `mj.config.cjs` with fallback to first active.

2. **Inline threshold for small files**: Should very small files (< 100KB?) be stored inline in `Content` as base64 instead of going through MJStorage? The dual pattern exists on attachments. Recommend: always use MJStorage for file artifacts to keep the logic simple — inline is only for text artifacts.

3. **PDF.js bundle size**: `pdfjs-dist` adds ~1.5MB to the Angular bundle. Is this acceptable, or should we lazy-load it only when a PDF artifact is opened? Recommend: lazy-load via dynamic `import()`.

4. **Excel viewer library**: SheetJS community edition vs. paid. The community `xlsx` package has limitations. AG Grid is already in the project for data display. Recommend: SheetJS community for parsing + AG Grid for rendering.

5. **Presentation files (PPTX)**: The Gamma integration generates presentations via external API. Should we also add a local PPTX generation Action (via `pptxgenjs`)? Recommend: defer to Phase 8, focus on PDF/Excel/Word first.

6. **File content extraction quality**: pdf-parse and mammoth produce varying quality text. Should we offer an AI-powered extraction path (send the file to Claude/GPT-4 with "extract the content")? Recommend: start with library-based extraction, add AI extraction as an optional enhancement later.
