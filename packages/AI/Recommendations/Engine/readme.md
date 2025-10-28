# @memberjunction/ai-recommendations

The MemberJunction Recommendations Engine provides a flexible and extensible framework for integrating with AI-powered recommendation systems. It handles the orchestration of recommendation requests, provider management, and the storage of recommendation results within the MemberJunction ecosystem.

## Features

- **Extensible Provider Framework**: Support for multiple recommendation providers through a unified API
- **Built-in Tracking**: Automatic tracking of recommendation runs and results
- **Entity Integration**: Seamless integration with MemberJunction entities and records
- **List Support**: Generate recommendations for records in a list
- **Error Handling**: Comprehensive error tracking and reporting
- **Batch Processing**: Process multiple recommendation requests efficiently
- **Metadata Management**: Automatic management of recommendation metadata

## Installation

```bash
npm install @memberjunction/ai-recommendations
```

## Core Components

### RecommendationEngineBase

The main engine class that coordinates recommendation requests:

```typescript
import { RecommendationEngineBase, RecommendationRequest } from '@memberjunction/ai-recommendations';

// Initialize and load the engine
await RecommendationEngineBase.Instance.Config();

// Create a recommendation request
const request = new RecommendationRequest();

// Configure the request
request.EntityAndRecordsInfo = {
  EntityName: 'Customers',
  RecordIDs: ['CUST001', 'CUST002']
};

// Execute the recommendation
const result = await RecommendationEngineBase.Instance.Recommend(request);
```

### RecommendationProviderBase

Abstract base class for implementing recommendation providers:

```typescript
import { RecommendationProviderBase, RecommendationRequest, RecommendationResult } from '@memberjunction/ai-recommendations';
import { UserInfo } from '@memberjunction/core';
import { RecommendationItemEntity } from '@memberjunction/core-entities';

export class MyRecommendationProvider extends RecommendationProviderBase {
  constructor(contextUser: UserInfo) {
    super(contextUser);
  }

  public async Recommend(request: RecommendationRequest): Promise<RecommendationResult> {
    const result = new RecommendationResult(request);
    
    try {
      // Process each recommendation
      for (const recommendation of request.Recommendations) {
        // Generate items for this recommendation
        const items: RecommendationItemEntity[] = [];
        
        // Your recommendation logic here
        // ...
        
        // Save the recommendation and its items
        await this.SaveRecommendation(recommendation, request.RunID, items);
      }
    } catch (error) {
      result.AppendError(error.message);
    }
    
    return result;
  }
}
```

## Usage Examples

### Generate Recommendations for Specific Records

```typescript
import { RecommendationEngineBase, RecommendationRequest } from '@memberjunction/ai-recommendations';

async function getCustomerRecommendations(customerIds: string[]) {
  // Ensure the engine is configured
  await RecommendationEngineBase.Instance.Config();
  
  // Create a request for specific customer records
  const request = new RecommendationRequest();
  request.EntityAndRecordsInfo = {
    EntityName: 'Customers',
    RecordIDs: customerIds
  };
  
  // Optionally specify a provider
  // request.Provider = RecommendationEngineBase.Instance.RecommendationProviders.find(p => p.Name === 'MyProvider');
  
  // Execute the recommendation
  const result = await RecommendationEngineBase.Instance.Recommend(request);
  
  if (result.Success) {
    console.log('Recommendations generated successfully!');
    return result.RecommendationItems;
  } else {
    console.error('Error generating recommendations:', result.ErrorMessage);
    return null;
  }
}
```

### Generate Recommendations from a List

```typescript
import { RecommendationEngineBase, RecommendationRequest } from '@memberjunction/ai-recommendations';

async function getRecommendationsFromList(listId: string) {
  await RecommendationEngineBase.Instance.Config();
  
  // Create a request for records in a list
  const request = new RecommendationRequest();
  request.ListID = listId;
  request.CreateErrorList = true; // Create a list to track errors
  
  // Execute the recommendation
  const result = await RecommendationEngineBase.Instance.Recommend(request);
  
  if (result.Success) {
    console.log('Recommendations generated successfully!');
    console.log('Error list ID (if needed):', result.Request.ErrorListID);
    return result.RecommendationItems;
  } else {
    console.error('Error generating recommendations:', result.ErrorMessage);
    return null;
  }
}
```

### Using Advanced Options

```typescript
import { RecommendationEngineBase, RecommendationRequest } from '@memberjunction/ai-recommendations';

// Define a custom options interface for your provider
interface MyProviderOptions {
  similarityThreshold: number;
  maxRecommendations: number;
  includeRatings: boolean;
}

async function getCustomizedRecommendations(customerId: string) {
  await RecommendationEngineBase.Instance.Config();
  
  // Create a request with custom options
  const request = new RecommendationRequest<MyProviderOptions>();
  request.EntityAndRecordsInfo = {
    EntityName: 'Customers',
    RecordIDs: [customerId]
  };
  
  // Add provider-specific options
  request.Options = {
    similarityThreshold: 0.75,
    maxRecommendations: 5,
    includeRatings: true
  };
  
  // Execute the recommendation
  return await RecommendationEngineBase.Instance.Recommend(request);
}
```

## Recommendation Flow

The recommendation process follows these steps:

1. **Request Creation**: A `RecommendationRequest` is created with entity records or a list
2. **Run Tracking**: A `RecommendationRun` entity is created to track the process
3. **Provider Selection**: The appropriate recommendation provider is selected
4. **Recommendation Generation**: The provider generates recommendations for each requested record
5. **Result Storage**: Recommendations and items are saved to the database
6. **Status Update**: The run status is updated (completed or error)
7. **Result Return**: The `RecommendationResult` is returned to the caller

## Data Model

The recommendation engine works with these key entities:

- **RecommendationProviderEntity**: Configuration for recommendation providers
- **RecommendationRunEntity**: Tracks each recommendation execution
- **RecommendationEntity**: Represents a recommendation for a source record
- **RecommendationItemEntity**: Individual recommendation items (products, content, etc.)

## Provider Implementation

To create a custom recommendation provider:

1. Create a class that extends `RecommendationProviderBase`
2. Implement the `Recommend` method to generate recommendations
3. Register your provider implementation:

```typescript
// Register your provider with MemberJunction's class factory
import { MJGlobal } from '@memberjunction/global';
import { RecommendationProviderBase } from '@memberjunction/ai-recommendations';

MJGlobal.Instance.ClassFactory.RegisterClass(
  RecommendationProviderBase,
  'MyRecommendationProvider',
  MyRecommendationProvider
);
```

## Integration with MemberJunction

This package integrates with the MemberJunction ecosystem:

- Uses MemberJunction entities for data storage and retrieval
- Works with MemberJunction lists for batch processing
- Leverages MemberJunction's metadata system

## Dependencies

- `@memberjunction/global`: MemberJunction global utilities
- `@memberjunction/core`: MemberJunction core library
- `@memberjunction/core-entities`: MemberJunction entity definitions
- `@memberjunction/ai`: MemberJunction AI abstractions

## License

ISC