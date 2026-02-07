# @memberjunction/content-autotagging

AI-powered content ingestion and autotagging engine for MemberJunction. Scans content from multiple sources (local files, websites, RSS feeds, cloud storage), extracts text from documents, and uses LLMs to generate tags, summaries, and metadata attributes.

## Overview

The `@memberjunction/content-autotagging` package provides an extensible framework for ingesting content from diverse sources and leveraging AI models to extract meaningful tags, summaries, and metadata. Built on the MemberJunction platform, it helps organizations automatically organize and categorize their content.

```mermaid
graph TD
    A["AutotagBaseEngine<br/>(Orchestrator)"] --> B["Content Sources"]
    B --> C["Local File System"]
    B --> D["Websites"]
    B --> E["RSS Feeds"]
    B --> F["Cloud Storage<br/>(Azure Blob)"]

    A --> G["Text Extraction"]
    G --> H["PDF Parser"]
    G --> I["Office Parser"]
    G --> J["HTML Parser<br/>(Cheerio)"]

    A --> K["LLM Processing"]
    K --> L["Tag Generation"]
    K --> M["Attribute Extraction"]

    A --> N["Content Items<br/>(Database)"]
    A --> O["Content Item Attributes<br/>(Database)"]

    style A fill:#2d6a9f,stroke:#1a4971,color:#fff
    style B fill:#7c5295,stroke:#563a6b,color:#fff
    style C fill:#2d8659,stroke:#1a5c3a,color:#fff
    style D fill:#2d8659,stroke:#1a5c3a,color:#fff
    style E fill:#2d8659,stroke:#1a5c3a,color:#fff
    style F fill:#2d8659,stroke:#1a5c3a,color:#fff
    style G fill:#b8762f,stroke:#8a5722,color:#fff
    style K fill:#7c5295,stroke:#563a6b,color:#fff
    style N fill:#2d6a9f,stroke:#1a4971,color:#fff
    style O fill:#2d6a9f,stroke:#1a4971,color:#fff
```

## Installation

```bash
npm install @memberjunction/content-autotagging
```

## Content Processing Pipeline

```mermaid
sequenceDiagram
    participant Source as Content Source
    participant Engine as AutotagBaseEngine
    participant Extract as Text Extractor
    participant AI as LLM
    participant DB as Database

    Source->>Engine: Provide content items
    Engine->>Engine: Change detection (checksum)
    Engine->>Extract: Extract text (PDF/Office/HTML)
    Extract-->>Engine: Raw text
    Engine->>Engine: Chunk text for token limits
    Engine->>AI: Generate tags and attributes
    AI-->>Engine: Structured metadata
    Engine->>DB: Save ContentItem + Attributes
    Engine->>DB: Create ProcessRun record
```

## Content Sources

| Source | Class | Description |
|--------|-------|-------------|
| Local Files | `AutotagLocalFileSystem` | Scans local directories for documents |
| Websites | `AutotagWebsite` | Crawls web pages and extracts content |
| RSS Feeds | `AutotagRSSFeed` | Parses RSS/Atom feeds for articles |
| Azure Blob | `AutotagAzureBlob` | Processes files from Azure Blob Storage |

All sources extend `AutotagBase`, which provides the common interface for content discovery and ingestion.

## Supported File Formats

| Format | Library | Extensions |
|--------|---------|------------|
| PDF | `pdf-parse` | .pdf |
| Office Documents | `officeparser` | .docx, .xlsx, .pptx |
| HTML/Web Pages | `cheerio` | .html, .htm |
| Plain Text | Native | .txt, .md, .csv |

## Usage

### RSS Feed Processing

```typescript
import { AutotagRSSFeed } from '@memberjunction/content-autotagging';

const rssTagger = new AutotagRSSFeed();
await rssTagger.Autotag(contextUser);
```

### Website Content Processing

```typescript
import { AutotagWebsite } from '@memberjunction/content-autotagging';

const websiteTagger = new AutotagWebsite();
await websiteTagger.Autotag(contextUser);
```

### Local File System Processing

```typescript
import { AutotagLocalFileSystem } from '@memberjunction/content-autotagging';

const fileTagger = new AutotagLocalFileSystem();
await fileTagger.Autotag(contextUser);
```

### Azure Blob Storage Processing

```typescript
import { AutotagAzureBlob } from '@memberjunction/content-autotagging';

const blobTagger = new AutotagAzureBlob(
  process.env.AZURE_STORAGE_CONNECTION_STRING,
  'your-container-name'
);
await blobTagger.Authenticate();
await blobTagger.Autotag(contextUser);
```

### Direct Engine Usage

```typescript
import { AutotagBaseEngine } from '@memberjunction/content-autotagging';

const engine = AutotagBaseEngine.Instance;
await engine.ExtractTextAndProcessWithLLM(contentItems, contextUser);
```

## Creating a Custom Content Source

```typescript
import { AutotagBase } from '@memberjunction/content-autotagging';
import { RegisterClass } from '@memberjunction/global';

@RegisterClass(AutotagBase, 'AutotagCustomSource')
export class AutotagCustomSource extends AutotagBase {
  public async SetContentItemsToProcess(contentSources) {
    // Fetch and create content items from your custom source
    return contentItems;
  }

  public async Autotag(contextUser) {
    const contentSourceTypeID = await this.engine.setSubclassContentSourceType(
      'Custom Source', contextUser
    );
    const contentSources = await this.engine.getAllContentSources(
      contextUser, contentSourceTypeID
    );
    const contentItems = await this.SetContentItemsToProcess(contentSources);
    await this.engine.ExtractTextAndProcessWithLLM(contentItems, contextUser);
  }
}
```

## Database Entities

| Entity | Purpose |
|--------|---------|
| Content Sources | Configuration for each content source |
| Content Items | Individual pieces of content with extracted text |
| Content Item Tags | AI-generated tags |
| Content Item Attributes | Additional extracted metadata |
| Content Process Runs | Processing history and audit trail |
| Content Types | Content categorization definitions |
| Content Source Types | Source type definitions |
| Content File Types | Supported file format definitions |

## Dependencies

| Package | Purpose |
|---------|---------|
| `@memberjunction/core` | Entity system and metadata |
| `@memberjunction/global` | Class registration |
| `@memberjunction/core-entities` | Content entity types |
| `@memberjunction/ai` | LLM integration |
| `@memberjunction/aiengine` | AI Engine base class |
| `pdf-parse` | PDF text extraction |
| `officeparser` | Office document parsing |
| `cheerio` | HTML parsing |
| `axios` | HTTP requests for web content |
| `rss-parser` | RSS feed parsing |

## License

ISC
