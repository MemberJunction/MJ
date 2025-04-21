# MemberJunction Content Autotagging

A powerful package for automatically processing and tagging content from various sources using AI models.

## Overview

The `@memberjunction/content-autotagging` package is designed to automate the process of ingesting, analyzing, and tagging content from diverse sources such as RSS feeds, websites, local files, and cloud storage. It leverages AI capabilities to extract meaningful tags, summaries, and metadata from content, helping organizations better organize and retrieve information.

## Installation

```bash
npm install @memberjunction/content-autotagging
```

## Dependencies

This package is part of the MemberJunction ecosystem and relies on several core MemberJunction packages:

- `@memberjunction/ai` - For AI model integration
- `@memberjunction/aiengine` - For AI processing pipeline
- `@memberjunction/core` - For MemberJunction core functionality
- `@memberjunction/core-entities` - For entity models
- `@memberjunction/global` - For global utilities and configurations

External dependencies include:
- `axios` - For HTTP requests
- `cheerio` - For HTML parsing
- `pdf-parse` - For PDF document parsing
- `officeparser` - For Microsoft Office document parsing
- `rss-parser` - For RSS feed parsing
- `date-fns` - For date manipulation

## Architecture

The package follows a modular, extensible architecture with several key components:

1. **Content Sources** - Adapters for different content types (RSS, web, files)
2. **Content Processors** - Logic for processing content based on its type
3. **Tag Generators** - AI-powered systems for generating tags from content
4. **Storage Adapters** - For persisting processed content to the MemberJunction database

## Usage

### Basic Example

```typescript
import { ContentAutotaggingProcessor } from '@memberjunction/content-autotagging';

// Initialize the processor
const processor = new ContentAutotaggingProcessor();

// Process content from various sources
async function processContent() {
  // Process RSS feeds
  await processor.processRSSFeeds();
  
  // Process web content
  await processor.processWebContent('https://example.com/article');
  
  // Process local documents
  await processor.processLocalDocument('/path/to/document.pdf');
}

processContent();
```

### Cloud Storage Integration

```typescript
import { 
  ContentAutotaggingProcessor, 
  AzureBlobStorageAdapter 
} from '@memberjunction/content-autotagging';

// Create storage adapter
const storageAdapter = new AzureBlobStorageAdapter({
  connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
  containerName: 'content'
});

// Initialize processor with storage adapter
const processor = new ContentAutotaggingProcessor({ storageAdapter });

// Process documents from cloud storage
async function processCloudDocuments() {
  await processor.processCloudDocuments();
}

processCloudDocuments();
```

## Content Processing Flow

1. **Content Acquisition** - Content is retrieved from the source (RSS feed, web page, file system, cloud storage)
2. **Parsing & Extraction** - Raw content is parsed based on its type (HTML, PDF, Office document, etc.)
3. **AI Processing** - Extracted text is sent to AI models for analysis, generating tags, summaries, and metadata
4. **Storage** - Processed content with its AI-generated tags is stored in the MemberJunction database
5. **Notification** - Optional notifications are sent upon completion (if configured)

## Extending the Package

### Adding Custom Content Sources

You can extend the package by creating custom content source adapters:

```typescript
import { BaseContentSource, ContentItem } from '@memberjunction/content-autotagging';

export class MyCustomSource extends BaseContentSource {
  async getContentItems(): Promise<ContentItem[]> {
    // Implementation for retrieving content items from your source
    return [
      {
        id: 'unique-id',
        title: 'Content Title',
        content: 'Content text...',
        url: 'https://source.url',
        publishDate: new Date(),
        author: 'Author Name',
        sourceType: 'custom'
      }
    ];
  }
}
```

## Configuration

The package supports configuration through environment variables or a configuration object:

```typescript
const processor = new ContentAutotaggingProcessor({
  aiModel: 'gpt-4',
  maxContentLength: 10000,
  taggingPrompt: 'Extract relevant tags from the following content:',
  batchSize: 5,
  storageAdapter: customStorageAdapter
});
```

## License

ISC