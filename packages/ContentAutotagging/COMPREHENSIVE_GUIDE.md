# ContentAutotagging Package - Comprehensive Developer Guide

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Intelligent Processing Flow](#intelligent-processing-flow)
4. [Storage Providers](#storage-providers)
5. [Vision Processing System](#vision-processing-system)
6. [Getting Started](#getting-started)
7. [Configuration](#configuration)
8. [API Reference](#api-reference)
9. [Advanced Usage](#advanced-usage)
10. [Testing](#testing)
11. [Troubleshooting](#troubleshooting)
12. [Development Guidelines](#development-guidelines)

## Overview

The ContentAutotagging package is a sophisticated AI-powered system that automatically extracts metadata, tags, and structured information from various document types including PDFs, DOCX, XLSX, HTML, and RSS feeds. It uses a combination of traditional text parsing and advanced vision processing to handle both digital and scanned documents with high accuracy.

### Key Features

- **Intelligent Quality Analysis**: Automatically determines when vision processing is needed
- **Multi-Format Support**: PDF, DOCX, XLSX, HTML, RSS feeds
- **Storage Provider Flexibility**: Local filesystem, Azure Blob Storage, Entity-based, Website crawling
- **Vision Processing**: Advanced image-based analysis for scanned documents
- **PDF Orientation Correction**: Automatic detection and correction of rotated documents
- **AI Agent Integration**: Can be triggered via MemberJunction AI Agents
- **Extensible Architecture**: Easy to add new storage providers and file formats

## Architecture

### Core Components

```
ContentAutotagging/
├── src/
│   ├── Core/generic/           # Abstract base classes
│   ├── Engine/generic/         # Core processing engine
│   ├── CloudStorage/           # Cloud storage providers
│   ├── LocalFileSystem/        # Local file system provider
│   ├── Entity/                 # Database entity provider
│   ├── Website/                # Web crawling provider
│   ├── RSSFeed/                # RSS feed provider
│   └── Actions/                # AI Agent integration
```

### Class Hierarchy

```
AutotagBase (Abstract)
├── AutotagLocalFileSystem
├── AutotagAzureBlob
├── AutotagEntity
├── AutotagWebsite
└── AutotagRSSFeed

AutotagBaseEngine
└── Provides processing capabilities to all providers
```

## Intelligent Processing Flow

The system follows a sophisticated two-stage approach that prioritizes accuracy over speed:

### Stage 1: Regular Text Extraction

Every document first attempts regular text extraction using appropriate parsers:

```typescript
// 1. Load file and determine type
const dataBuffer = await fs.promises.readFile(filePath);
const fileExtension = contentFileType.FileExtension.toLowerCase();

// 2. Apply format-specific parsing
switch (fileExtension) {
    case '.pdf':
        // Orientation correction + PDF parsing
        const correctedPdfBuffer = await this.preprocessPDFOrientation(dataBuffer);
        extractedText = await this.parsePDF(correctedPdfBuffer);
        break;
    case '.docx':
        extractedText = await this.parseDOCX(dataBuffer);
        break;
    case '.xlsx':
        extractedText = await this.parseXLSXWithContext(dataBuffer, sourceParams);
        break;
}
```

### Stage 2: Quality Analysis & Vision Decision

```typescript
// 3. Analyze extraction quality automatically
const qualityAnalysis = await this.analyzeTextQuality(extractedText, dataBuffer, contentFileType.Name);

// 4. Set ProcessWithVision flag based on analysis
contentItem.ProcessWithVision = qualityAnalysis.needsVisionProcessing;

// 5. Route to appropriate processing
if (contentItem.ProcessWithVision) {
    await this.processContentItemWithVision(contentItem, processingParams, contextUser, protectedFields);
} else {
    await this.ProcessContentItemText(processingParams, contextUser, protectedFields);
}
```

### Quality Analysis Algorithm

The system uses **meaningful character density** analysis:

```typescript
private async analyzeTextQuality(extractedText: string, dataBuffer: Buffer, fileTypeName: string): Promise<QualityAnalysis> {
    // Calculate meaningful characters (letters, numbers, common punctuation)
    const meaningfulChars = (extractedText.match(/[a-zA-Z0-9.,;:!?()[\]{}"'-]/g) || []).length;
    const totalLength = extractedText.length;
    
    // Dynamic thresholds based on file characteristics
    const estimatedPages = await this.estimatePageCount(dataBuffer, fileTypeName);
    const baseThreshold = 0.3; // 30% meaningful characters
    const adjustedThreshold = Math.max(0.15, baseThreshold - (estimatedPages - 1) * 0.02);
    
    const meaningfulRatio = totalLength > 0 ? meaningfulChars / totalLength : 0;
    
    return {
        needsVisionProcessing: meaningfulRatio < adjustedThreshold,
        meaningfulRatio,
        threshold: adjustedThreshold,
        reasoning: meaningfulRatio < adjustedThreshold 
            ? "Text extraction quality insufficient - likely scanned or rotated document"
            : "Text extraction quality acceptable for direct processing"
    };
}
```

## Storage Providers

### AutotagLocalFileSystem

Processes files from the local file system.

```typescript
import { AutotagLocalFileSystem } from '@memberjunction/content-autotagging';

const autotag = new AutotagLocalFileSystem();
await autotag.Autotag(contextUser);
```

**Configuration Parameters:**
- `directoryPath`: Root directory to scan
- `fileExtensions`: Comma-separated list (e.g., "pdf,docx,xlsx")
- `recursive`: Whether to scan subdirectories

### AutotagAzureBlob

Processes files from Azure Blob Storage with automatic blob path normalization.

```typescript
import { AutotagAzureBlob } from '@memberjunction/content-autotagging';

const autotag = new AutotagAzureBlob();
await autotag.Autotag(contextUser);
```

**Configuration Parameters:**
- `containerName`: Azure container name
- `blobPrefix`: Optional prefix filter
- `connectionString`: Azure Storage connection string

**Key Features:**
- Automatic blob path normalization (backslashes → forward slashes)
- Container prefix removal for clean file paths
- Efficient blob metadata reading

### AutotagWebsite

Crawls websites and extracts content from web pages.

```typescript
import { AutotagWebsite } from '@memberjunction/content-autotagging';

const autotag = new AutotagWebsite();
await autotag.Autotag(contextUser);
```

**Configuration Parameters:**
- `baseUrl`: Starting URL for crawling
- `maxDepth`: Maximum crawl depth
- `followExternalLinks`: Whether to crawl external domains

### AutotagRSSFeed

Processes RSS feeds and individual articles.

```typescript
import { AutotagRSSFeed } from '@memberjunction/content-autotagging';

const autotag = new AutotagRSSFeed();
await autotag.Autotag(contextUser);
```

### AutotagEntity

Processes content stored in database entities.

```typescript
import { AutotagEntity } from '@memberjunction/content-autotagging';

const autotag = new AutotagEntity();
await autotag.Autotag(contextUser);
```

## Vision Processing System

The vision processing system handles documents that can't be reliably processed with traditional text extraction.

### PDF Orientation Detection

Before any processing, PDFs undergo intelligent orientation correction:

```typescript
public async preprocessPDFOrientation(dataBuffer: Buffer): Promise<Buffer> {
    // 1. Test all 4 orientations (0°, 90°, 180°, 270°)
    const requiredRotation = await this.detectPDFOrientation(dataBuffer);
    
    // 2. Apply correction if needed
    if (requiredRotation === 0) {
        return dataBuffer; // Already correctly oriented
    }
    
    // 3. Rotate PDF using PDF-lib
    return await this.correctPDFOrientation(dataBuffer, requiredRotation);
}
```

### Vision Model Processing

When `ProcessWithVision` is set to true:

```typescript
private async processContentItemWithVision(contentItem: ContentItemEntity, ...): Promise<void> {
    // 1. Load the file
    const filePath = contentItem.URL;
    const dataBuffer = await fs.promises.readFile(filePath);
    
    if (fileExtension === '.pdf') {
        // 2. Use orientation-corrected buffer
        const correctedPdfBuffer = await this.preprocessPDFOrientation(dataBuffer);
        
        // 3. Convert to high-quality images
        const images = await this.convertPDFToImages(correctedPdfBuffer);
        
        // 4. Process with vision model
        visionResults = await this.processWithVisionModel(correctedPdfBuffer, processingParams, contextUser);
    }
    
    // 5. Save results
    await this.saveLLMResults(visionResults, contextUser, protectedFields);
}
```

### Image Optimization for Vision Models

The system converts PDFs to optimized images for maximum OCR accuracy:

```typescript
// OCR OPTIMIZATIONS APPLIED:
// - PNG format (lossless compression preserves text clarity)
// - 300 DPI resolution for crisp text
// - Grayscale conversion (removes color distractions) 
// - High contrast enhancement (2.0x contrast boost)
// - Threshold conversion to pure black/white text
const convertOptions = {
    format: 'png',
    out_dir: tempDir,
    out_name: `page`,
    page: null, // Convert all pages
    size: '2481x3508' // 300 DPI for 8.5x11 inch page
};
```

## Getting Started

### Prerequisites

1. **MemberJunction Framework**: This package is part of the MemberJunction ecosystem
2. **Node.js**: Version 18+ recommended
3. **Database**: SQL Server database with MemberJunction schema
4. **AI Models**: Configured AI models for text and vision processing
5. **ImageMagick**: Required for PDF orientation detection

### Installation

```bash
# Install the package
npm install @memberjunction/content-autotagging

# Install peer dependencies
npm install @memberjunction/core
npm install @memberjunction/ai-engine-base
```

### Basic Setup

```typescript
import { AutotagLocalFileSystem } from '@memberjunction/content-autotagging';
import { UserInfo } from '@memberjunction/core';

// 1. Set up user context
const contextUser = new UserInfo(); // Configure with appropriate user

// 2. Create autotagger instance
const autotagger = new AutotagLocalFileSystem();

// 3. Process content
await autotagger.Autotag(contextUser);
```

### Advanced Setup with Custom Engine

```typescript
import { AutotagBaseEngine, AutotagLocalFileSystem } from '@memberjunction/content-autotagging';

// 1. Create custom engine if needed
const engine = new AutotagBaseEngine();

// 2. Create autotagger with custom engine
const autotagger = new AutotagLocalFileSystem();

// 3. Process specific content item
await autotagger.TagSingleContentItem(contentItem, contextUser);
```

## Configuration

### Content Source Configuration

Each storage provider is configured through the MemberJunction `Content Sources` entity:

```typescript
// Example configuration parameters for Local FileSystem
const sourceParams = new Map<string, any>([
    ['directoryPath', '/path/to/documents'],
    ['fileExtensions', 'pdf,docx,xlsx'],
    ['recursive', true]
]);
```

### AI Model Configuration

Configure AI models through the MemberJunction AI framework:

```typescript
// Text processing model
{
    modelID: 'gpt-4o-mini',
    inputTokenLimit: 128000,
    outputTokenLimit: 16000
}

// Vision processing model  
{
    modelID: 'gpt-4o',
    supportsVision: true,
    inputTokenLimit: 128000
}
```

### Content Type Configuration

Define what information to extract:

```typescript
// Example: Extract salary information from HR documents
{
    contentTypeName: 'Salary Schedules',
    systemPrompt: 'Extract salary ranges, positions, and effective dates...',
    minTags: 3,
    maxTags: 10
}
```

## API Reference

### Core Classes

#### AutotagBaseEngine

The main processing engine that handles document parsing and AI processing.

**Key Methods:**

```typescript
// Parse content and set ProcessWithVision flag automatically
public async parseContentItem(contentItem: ContentItemEntity, contextUser: UserInfo): Promise<string>

// Process multiple content items
public async ExtractTextAndProcessWithLLM(
    contentItems: ContentItemEntity[], 
    contextUser: UserInfo, 
    protectedFields?: string[]
): Promise<void>

// Parse specific file types
public async parsePDF(dataBuffer: Buffer): Promise<string>
public async parseDOCX(dataBuffer: Buffer): Promise<string>
public async parseXLSXWithContext(dataBuffer: Buffer, sourceParams: Map<string, any>): Promise<string>
public async parseHTML(data: string): Promise<string>

// Vision processing
public async processWithVisionModel(pdfBuffer: Buffer, params: ContentItemProcessParams, contextUser: UserInfo): Promise<JsonObject>
public async preprocessPDFOrientation(dataBuffer: Buffer): Promise<Buffer>
```

#### AutotagBase

Abstract base class for all storage providers.

**Key Methods:**

```typescript
// Main processing method
public async Autotag(contextUser: UserInfo, protectedFields?: string[]): Promise<void>

// Process single content item
public async TagSingleContentItem(
    contentItem: ContentItemEntity, 
    contextUser: UserInfo,
    protectedFields?: string[]
): Promise<void>

// Abstract methods to implement
protected abstract DiscoverContentItems(contextUser: UserInfo): Promise<ContentDiscoveryResult[]>
protected abstract SetSingleContentItem(discoveryItem: ContentDiscoveryResult, contextUser: UserInfo): Promise<ContentItemEntity>
```

### AI Agent Integration

The system can be triggered via AI Agents using the `RunAutotagAction`:

```typescript
// Agent payload example
{
    "endpoint": "http://localhost:4000/api/autotag",
    "payload": {
        "contentSourceId": "12345",
        "forceReprocess": false
    }
}
```

## Advanced Usage

### Custom Storage Providers

Create custom providers by extending `AutotagBase`:

```typescript
import { AutotagBase } from '@memberjunction/content-autotagging';

export class AutotagCustomProvider extends AutotagBase {
    protected async DiscoverContentItems(contextUser: UserInfo): Promise<ContentDiscoveryResult[]> {
        // Implement your discovery logic
        return discoveryResults;
    }
    
    protected async SetSingleContentItem(
        discoveryItem: ContentDiscoveryResult, 
        contextUser: UserInfo
    ): Promise<ContentItemEntity> {
        // Implement your content loading logic
        return contentItem;
    }
}
```

### Batch Processing with Quality Analysis

```typescript
const contentItems = await this.loadContentItems();

// Process in batches with automatic quality analysis
for (const batch of this.chunkArray(contentItems, 10)) {
    await this.engine.ExtractTextAndProcessWithLLM(batch, contextUser);
    
    // Check which items were flagged for vision processing
    const visionItems = batch.filter(item => item.ProcessWithVision);
    console.log(`${visionItems.length}/${batch.length} items flagged for vision processing`);
}
```

### Custom Quality Analysis

Extend the quality analysis for specific use cases:

```typescript
// Override in custom engine
protected async analyzeTextQuality(extractedText: string, dataBuffer: Buffer, fileTypeName: string): Promise<QualityAnalysis> {
    const baseAnalysis = await super.analyzeTextQuality(extractedText, dataBuffer, fileTypeName);
    
    // Add custom logic for specific document types
    if (fileTypeName.includes('Financial')) {
        // Financial documents need higher quality standards
        baseAnalysis.threshold *= 1.5;
        baseAnalysis.needsVisionProcessing = baseAnalysis.meaningfulRatio < baseAnalysis.threshold;
    }
    
    return baseAnalysis;
}
```

## Testing

### Unit Tests

```typescript
describe('ContentAutotagging', () => {
    test('should correctly analyze text quality', async () => {
        const engine = new AutotagBaseEngine();
        const analysis = await engine.analyzeTextQuality(
            'This is clear, readable text with good formatting.',
            Buffer.from('test'),
            'PDF'
        );
        
        expect(analysis.needsVisionProcessing).toBe(false);
        expect(analysis.meaningfulRatio).toBeGreaterThan(0.3);
    });
    
    test('should detect poor quality scanned text', async () => {
        const engine = new AutotagBaseEngine();
        const analysis = await engine.analyzeTextQuality(
            'Th!s !s p00r qua||ty SC@nn3d t3xt w!th m@ny 3rr0rs',
            Buffer.from('test'),
            'PDF'
        );
        
        expect(analysis.needsVisionProcessing).toBe(true);
    });
});
```

### Integration Tests

```typescript
describe('Integration Tests', () => {
    test('should process PDF with vision when needed', async () => {
        const autotagger = new AutotagLocalFileSystem();
        const contentItem = await createTestContentItem('scanned-document.pdf');
        
        await autotagger.TagSingleContentItem(contentItem, contextUser);
        
        expect(contentItem.ProcessWithVision).toBe(true);
        expect(contentItem.Text).toBeDefined();
    });
});
```

## Troubleshooting

### Common Issues

#### 1. "BlobNotFound" errors in Azure Blob Storage

**Cause**: Blob paths with backslashes or incorrect container prefixes

**Solution**: The system automatically normalizes paths, but verify your blob names:

```typescript
// The system converts:
// "container\\folder\\file.pdf" → "folder/file.pdf"
// "container/folder/file.pdf" → "folder/file.pdf"
```

#### 2. Vision processing not triggering

**Cause**: Text quality analysis threshold too low

**Debug**:
```typescript
// Enable debug logging
console.log('Quality Analysis:', await engine.analyzeTextQuality(text, buffer, fileType));
```

**Solution**: Adjust thresholds or check document quality

#### 3. PDF orientation issues

**Cause**: ImageMagick not installed or configured

**Solution**: Install ImageMagick and ensure it's in PATH:
```bash
# Ubuntu/Debian
sudo apt-get install imagemagick

# macOS
brew install imagemagick

# Windows
# Download from: https://imagemagick.org/script/download.php#windows
```

#### 4. Out of memory errors on large documents

**Cause**: Processing very large PDFs or batches

**Solution**: Implement chunking:
```typescript
// Process in smaller batches
const BATCH_SIZE = 5;
for (const batch of this.chunkArray(contentItems, BATCH_SIZE)) {
    await this.engine.ExtractTextAndProcessWithLLM(batch, contextUser);
    
    // Optional: Add delay between batches
    await new Promise(resolve => setTimeout(resolve, 1000));
}
```

### Debug Mode

Enable detailed logging for troubleshooting:

```typescript
// Set environment variable
process.env.DEBUG_AUTOTAGGING = 'true';

// The system will log:
// - Quality analysis details
// - Vision processing decisions  
// - File processing steps
// - AI model responses
```

## Development Guidelines

### Code Organization

- **Engine**: Core processing logic in `AutotagBaseEngine`
- **Providers**: Storage-specific implementations extending `AutotagBase`
- **Types**: Shared interfaces in `process.types.ts`
- **Actions**: AI Agent integration in separate action classes

### Performance Best Practices

1. **Batch Processing**: Process multiple items together
2. **Memory Management**: Clean up large buffers after processing
3. **Caching**: Cache parsed results when possible
4. **Parallel Processing**: Use Promise.all for independent operations

### Error Handling

Always implement comprehensive error handling:

```typescript
public async processContent(contentItem: ContentItemEntity): Promise<void> {
    try {
        // Processing logic
        await this.engine.parseContentItem(contentItem, contextUser);
    } catch (error) {
        console.error(`Failed to process ${contentItem.Name}:`, error.message);
        
        // Implement fallback logic
        contentItem.ProcessingStatus = 'Failed';
        contentItem.ErrorMessage = error.message;
        await contentItem.Save();
        
        // Don't rethrow unless critical
    }
}
```

### Testing Guidelines

1. **Unit Tests**: Test individual methods with mock data
2. **Integration Tests**: Test complete workflows with real documents
3. **Performance Tests**: Test with large document sets
4. **Edge Cases**: Test with corrupted, rotated, or unusual documents

### Extending the System

When adding new features:

1. **Follow the existing patterns** (quality analysis → routing → processing)
2. **Maintain backward compatibility** 
3. **Add comprehensive logging**
4. **Include error handling and fallbacks**
5. **Update this documentation**

## Conclusion

The ContentAutotagging package provides a robust, intelligent document processing system that automatically adapts to document quality and type. Its modular architecture makes it easy to extend while the built-in quality analysis ensures optimal processing for both digital and scanned documents.

Key architectural decisions:
- **Quality-first approach**: Accuracy over speed
- **Automatic decision making**: No manual configuration needed
- **Extensible design**: Easy to add new providers and formats
- **Comprehensive error handling**: Graceful degradation when issues occur

For questions or issues, refer to the troubleshooting section or check the test files for usage examples.