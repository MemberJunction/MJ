# @memberjunction/content-autotagging

A powerful AI-driven package for automatically processing, analyzing, and tagging content from various sources including RSS feeds, websites, local files, and cloud storage.

## Overview

The `@memberjunction/content-autotagging` package provides an extensible framework for ingesting content from diverse sources and leveraging AI models to extract meaningful tags, summaries, and metadata. Built on the MemberJunction platform, it helps organizations automatically organize and categorize their content for improved searchability and insights.

## Features

- **Multiple Content Sources**: Support for RSS feeds, websites, local file systems, and cloud storage (Azure Blob)
- **AI-Powered Processing**: Integrates with various AI models to generate tags, summaries, and metadata
- **Extensible Architecture**: Easy to add new content sources and processing strategies
- **Smart Content Detection**: Validates content types and filters out irrelevant content
- **Incremental Processing**: Only processes new or modified content since last run
- **File Format Support**: Handles PDFs, Office documents, HTML, and plain text
- **Chunking Strategy**: Intelligently chunks large content to fit within AI model token limits

## Installation

```bash
npm install @memberjunction/content-autotagging
```

## Dependencies

### MemberJunction Dependencies
- `@memberjunction/ai` (2.43.0) - AI model integration
- `@memberjunction/aiengine` (2.43.0) - AI processing pipeline  
- `@memberjunction/core` (2.43.0) - Core MemberJunction functionality
- `@memberjunction/core-entities` (2.43.0) - Entity models
- `@memberjunction/global` (2.43.0) - Global utilities

### External Dependencies
- `axios` - HTTP requests
- `cheerio` - HTML parsing and web scraping
- `pdf-parse` - PDF document parsing
- `officeparser` - Microsoft Office document parsing
- `rss-parser` - RSS feed parsing
- `date-fns` & `date-fns-tz` - Date manipulation and timezone handling
- `openai` - OpenAI API integration
- `xml2js` - XML parsing
- `crypto` - Checksum generation

## Architecture

The package follows a modular architecture with these key components:

### Core Classes

1. **AutotagBase** - Abstract base class defining the autotagging interface
2. **AutotagBaseEngine** - Central processing engine handling AI interactions and content processing
3. **Content Source Implementations**:
   - `AutotagRSSFeed` - RSS feed processing
   - `AutotagWebsite` - Website crawling and processing
   - `AutotagLocalFileSystem` - Local file processing
   - `AutotagAzureBlob` - Azure Blob Storage integration

## Usage

### RSS Feed Processing

```typescript
import { AutotagRSSFeed } from '@memberjunction/content-autotagging';
import { UserInfo } from '@memberjunction/core';

const rssTagger = new AutotagRSSFeed();
const userContext: UserInfo = { /* your user context */ };

// Process all configured RSS feeds
await rssTagger.Autotag(userContext);
```

### Website Content Processing

```typescript
import { AutotagWebsite } from '@memberjunction/content-autotagging';
import { UserInfo } from '@memberjunction/core';

const websiteTagger = new AutotagWebsite();
const userContext: UserInfo = { /* your user context */ };

// Process all configured websites with crawling options
await websiteTagger.Autotag(userContext);
```

### Local File System Processing

```typescript
import { AutotagLocalFileSystem } from '@memberjunction/content-autotagging';
import { UserInfo } from '@memberjunction/core';

const fileTagger = new AutotagLocalFileSystem();
const userContext: UserInfo = { /* your user context */ };

// Process files from configured local directories
await fileTagger.Autotag(userContext);
```

### Azure Blob Storage Processing

```typescript
import { AutotagAzureBlob } from '@memberjunction/content-autotagging';
import { UserInfo } from '@memberjunction/core';

const blobTagger = new AutotagAzureBlob(
  process.env.AZURE_STORAGE_CONNECTION_STRING,
  'your-container-name'
);

await blobTagger.Authenticate();
await blobTagger.Autotag(userContext);
```

### Direct Engine Usage

For more control over the processing pipeline:

```typescript
import { AutotagBaseEngine } from '@memberjunction/content-autotagging';
import { ContentItemEntity } from '@memberjunction/core-entities';

const engine = AutotagBaseEngine.Instance;

// Process specific content items
const contentItems: ContentItemEntity[] = [ /* your content items */ ];
await engine.ExtractTextAndProcessWithLLM(contentItems, userContext);
```

## Content Processing Pipeline

1. **Content Source Discovery**: Retrieves configured content sources from the database
2. **Content Acquisition**: Fetches content from each source (RSS, web, files, etc.)
3. **Change Detection**: Compares checksums to identify new or modified content
4. **Text Extraction**: Extracts text from various formats (HTML, PDF, Office docs)
5. **AI Processing**: 
   - Chunks content to fit model token limits
   - Validates content type
   - Generates title, summary, and keywords
   - Extracts custom attributes based on content type
6. **Storage**: Saves results to MemberJunction entities:
   - Content Items
   - Content Item Tags
   - Content Item Attributes

## Configuration

### Content Source Configuration

Content sources are configured in the MemberJunction database with these key fields:
- `Name`: Display name
- `URL`: Source location (RSS URL, website URL, file path, etc.)
- `ContentTypeID`: Type of content (article, blog post, etc.)
- `ContentSourceTypeID`: Source type (RSS Feed, Website, etc.)
- `ContentFileTypeID`: Expected file format

### AI Model Configuration

The package uses AI models configured in MemberJunction. Key parameters:
- `modelID`: Specific AI model to use
- `minTags`: Minimum number of tags to generate
- `maxTags`: Maximum number of tags to generate
- Token limits are automatically handled based on model configuration

### Website Crawling Options

For website sources, these parameters can be configured:
- `CrawlOtherSitesInTopLevelDomain`: Whether to crawl other subdomains
- `CrawlSitesInLowerLevelDomain`: Whether to crawl child paths
- `MaxDepth`: Maximum crawl depth
- `RootURL`: Base URL for crawling
- `URLPattern`: Regex pattern for URL filtering

## Extending the Package

### Creating a Custom Content Source

```typescript
import { AutotagBase } from '@memberjunction/content-autotagging';
import { RegisterClass } from '@memberjunction/global';
import { ContentSourceEntity, ContentItemEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';

@RegisterClass(AutotagBase, 'AutotagCustomSource')
export class AutotagCustomSource extends AutotagBase {
  public async SetContentItemsToProcess(
    contentSources: ContentSourceEntity[]
  ): Promise<ContentItemEntity[]> {
    // Implement logic to fetch and create content items
    const contentItems: ContentItemEntity[] = [];
    
    // Your custom source logic here
    
    return contentItems;
  }

  public async Autotag(contextUser: UserInfo): Promise<void> {
    // Set up content source type
    const contentSourceTypeID = await this.engine.setSubclassContentSourceType(
      'Custom Source', 
      contextUser
    );
    
    // Get configured sources
    const contentSources = await this.engine.getAllContentSources(
      contextUser, 
      contentSourceTypeID
    );
    
    // Process content
    const contentItems = await this.SetContentItemsToProcess(contentSources);
    await this.engine.ExtractTextAndProcessWithLLM(contentItems, contextUser);
  }
}
```

### Custom Content Type Attributes

Add custom prompts for specific content types by creating Content Type Attributes in the database. These will be automatically included in the AI processing prompts.

## API Reference

### AutotagBase (Abstract)

```typescript
abstract class AutotagBase {
  abstract SetContentItemsToProcess(
    contentSources: ContentSourceEntity[]
  ): Promise<ContentItemEntity[]>;
  
  abstract Autotag(contextUser: UserInfo): Promise<void>;
}
```

### AutotagBaseEngine

```typescript
class AutotagBaseEngine extends AIEngine {
  // Process content items with AI
  async ExtractTextAndProcessWithLLM(
    contentItems: ContentItemEntity[], 
    contextUser: UserInfo
  ): Promise<void>;
  
  // Process individual content item text
  async ProcessContentItemText(
    params: ContentItemProcessParams, 
    contextUser: UserInfo
  ): Promise<void>;
  
  // Get all content sources for a type
  async getAllContentSources(
    contextUser: UserInfo, 
    contentSourceTypeID: string
  ): Promise<ContentSourceEntity[]>;
}
```

## Environment Variables

```bash
# For Azure Blob Storage
AZURE_STORAGE_CONNECTION_STRING=your_connection_string

# AI Model API Keys (handled by @memberjunction/ai)
OPENAI_API_KEY=your_openai_key
# Other AI provider keys as needed
```

## Error Handling

The package includes comprehensive error handling:
- Invalid content detection with automatic cleanup
- Checksum-based duplicate detection
- Graceful handling of parsing failures
- Token limit management with automatic chunking
- Network retry logic for external sources

## Performance Considerations

- **Incremental Processing**: Only new/modified content is processed
- **Parallel Processing**: Content items can be processed in parallel
- **Chunking**: Large documents are automatically chunked for AI processing
- **Caching**: Processed content checksums prevent reprocessing

## Database Schema

The package works with these MemberJunction entities:
- `Content Sources` - Configuration for each source
- `Content Items` - Individual pieces of content
- `Content Item Tags` - Generated tags
- `Content Item Attributes` - Additional extracted metadata
- `Content Process Runs` - Processing history
- `Content Types` - Content categorization
- `Content Source Types` - Source type definitions

## License

ISC