# @memberjunction/ai-recommendations-rex

## Overview

The **@memberjunction/ai-recommendations-rex** package provides a recommendation provider implementation for the MemberJunction framework that integrates with the [rasa.io Rex recommendation engine](https://rasa.io). This provider enables AI-powered content recommendations based on vector similarity searches, delivering personalized content suggestions based on user preferences and behavior patterns.

## Purpose and Functionality

This package implements the `RecommendationProviderBase` interface to:
- Connect to the rasa.io Rex recommendation service via REST API
- Generate personalized content recommendations using vector similarity searches
- Process recommendation requests in configurable batch sizes
- Convert Rex recommendations into MemberJunction recommendation entities
- Handle error logging and reporting through the MemberJunction list system

## Installation

```bash
npm install @memberjunction/ai-recommendations-rex
```

## Configuration

The package requires the following environment variables:

```bash
# Rex API Configuration
REX_API_HOST=https://api.rex.rasa.io          # Rex API host URL
REX_RECOMMEND_HOST=https://recommend.rex.rasa.io  # Rex recommendation endpoint
REX_USERNAME=your_username                      # Rex account username
REX_PASSWORD=your_password                      # Rex account password
REX_API_KEY=your_api_key                       # Rex API key

# Optional Configuration
REX_BATCH_SIZE=200                             # Number of recommendations per batch (default: 200)
```

## Usage

### Important Note

This package is designed to be used through the [MemberJunction Recommendation Engine](https://github.com/MemberJunction/MJ/tree/next/packages/AI/Recommendations/Engine) and should not be instantiated directly in most cases.

### Basic Example

```typescript
import { RexRecommendationsProvider } from '@memberjunction/ai-recommendations-rex';
import { RecommendationRequest, RecommendationResult } from '@memberjunction/ai-recommendations';
import { UserInfo } from '@memberjunction/core';

// The provider is typically instantiated by the MJ framework
const provider = new RexRecommendationsProvider();

// Create a recommendation request
const request: RecommendationRequest<RecommendContextData> = {
    RunID: 'run-123',
    Recommendations: recommendationEntities, // Array of RecommendationEntity objects
    ErrorListID: 'error-list-id',
    CurrentUser: currentUser,
    Options: {
        EntityDocumentID: 'doc-123',
        TypeMap: {
            'course': 'Contents',
            'course_part': 'Course Parts',
            'person': 'Contributors'
        },
        type: 'article',
        filters: [
            { type: 'course', max_results: 10 }
        ]
    }
};

// Generate recommendations
const result: RecommendationResult = await provider.Recommend(request);

if (result.Success) {
    console.log('Recommendations generated successfully');
} else {
    console.error('Errors:', result.Errors);
    console.warn('Warnings:', result.Warnings);
}
```

## API Documentation

### Classes

#### `RexRecommendationsProvider`

The main provider class that implements the Rex recommendation integration.

**Methods:**

- `Recommend(request: RecommendationRequest<RecommendContextData>): Promise<RecommendationResult>`
  - Processes recommendation requests by communicating with the Rex API
  - Handles batch processing based on configured batch size
  - Returns a `RecommendationResult` with success status and any errors/warnings

### Type Definitions

#### `RecommendContextData`

```typescript
type RecommendContextData = {
    EntityDocumentID: string;          // Required: ID of the entity document
    TypeMap: Record<string, string>;   // Mapping of Rex types to MJ entity names
    type: string;                      // Content type for recommendations
    filters: {                         // Filtering options for recommendations
        type: string;
        max_results: number;
    }[];
};
```

#### `RecommendationResponse`

```typescript
type RecommendationResponse = {
    engine: string;      // Rex engine identifier
    version: string;     // API version
    id: string;         // Recommendation ID
    model: string;      // Model used for recommendation
    score: number;      // Similarity score (0-1)
    source: string;     // Data source
    type: string;       // Content type
    vector_id: string;  // Vector database ID
};
```

## Prerequisites

1. **rasa.io Rex Account**: Valid Rex credentials and API key
2. **MemberJunction Framework**: Properly configured MJ installation
3. **Vector Database**: Configured vector storage with indexed content
4. **Entity Record Documents**: Source records must have associated vector embeddings

## Integration with MemberJunction

This provider integrates with several MemberJunction packages:

- **@memberjunction/ai-recommendations**: Base recommendation framework
- **@memberjunction/core**: Core MJ functionality and entities
- **@memberjunction/core-entities**: Entity definitions for recommendations
- **@memberjunction/global**: Global utilities and class registration

### Workflow

1. The MJ Recommendation Engine creates recommendation requests
2. Rex provider fetches entity record documents with vector IDs
3. Rex API performs similarity searches in the vector database
4. Results are converted to MemberJunction recommendation items
5. Recommendations are saved to the database for retrieval

## Error Handling

The provider implements comprehensive error handling:

- API errors are logged with full details
- Failed recommendations are recorded in the specified error list
- Batch processing continues even if individual recommendations fail
- All errors and warnings are aggregated in the result object

## Performance Considerations

- **Batch Processing**: Recommendations are processed in configurable batches (default: 200)
- **Parallel Processing**: Each batch processes recommendations in parallel
- **Token Management**: Access tokens are obtained and managed automatically
- **Score Clamping**: Probability scores are normalized to 0-1 range

## Build and Development

```bash
# Build the package
npm run build

# Run in development mode
npm start

# Run tests (when available)
npm test
```

## Dependencies

- **axios**: HTTP client for Rex API communication
- **openai**: OpenAI SDK (for potential future enhancements)
- **dotenv**: Environment variable management
- **@memberjunction/ai**: Core AI functionality
- **@memberjunction/ai-recommendations**: Recommendation framework
- **@memberjunction/global**: MJ global utilities

## License

ISC License - See LICENSE file for details

## Support

For issues and questions:
- GitHub Issues: [MemberJunction/MJ](https://github.com/MemberJunction/MJ/issues)
- Documentation: [docs.memberjunction.org](https://docs.memberjunction.org/)

## Version

Current version: 2.43.0
