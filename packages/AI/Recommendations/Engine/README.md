# @memberjunction/ai-recommendations

A provider-based recommendation engine for MemberJunction. Manages recommendation runs, delegates to pluggable providers via the class factory, and tracks results through Recommendation, Recommendation Run, and Recommendation Item entities.

## Architecture

```mermaid
graph TD
    subgraph Engine["@memberjunction/ai-recommendations"]
        REB["RecommendationEngineBase<br/>(singleton BaseEngine)"]
        RPB["RecommendationProviderBase<br/>(abstract)"]
        RR["RecommendationRequest&lt;T&gt;"]
        RRES["RecommendationResult"]
    end

    subgraph Providers["Registered Providers"]
        P1["Provider A"]
        P2["Provider B"]
    end

    subgraph MJEntities["MemberJunction Entities"]
        RP["Recommendation Providers"]
        RUN["Recommendation Runs"]
        REC["Recommendations"]
        RI["Recommendation Items"]
        LIST["Lists / List Details"]
    end

    subgraph MJCore["MemberJunction Core"]
        BE["BaseEngine"]
        CF["ClassFactory"]
        MD["Metadata"]
    end

    REB -->|extends| BE
    REB -->|discovers| CF
    CF -->|creates| P1
    CF -->|creates| P2
    P1 -->|extends| RPB
    P2 -->|extends| RPB
    REB --> RP
    REB --> RUN
    RPB --> REC
    RPB --> RI
    REB --> LIST

    style Engine fill:#2d6a9f,stroke:#1a4971,color:#fff
    style Providers fill:#2d8659,stroke:#1a5c3a,color:#fff
    style MJEntities fill:#b8762f,stroke:#8a5722,color:#fff
    style MJCore fill:#7c5295,stroke:#563a6b,color:#fff
```

## Installation

```bash
npm install @memberjunction/ai-recommendations
```

## Overview

This package provides the framework for running recommendations in MemberJunction. It follows the engine/provider pattern used throughout the platform:

1. **RecommendationEngineBase** -- a singleton engine (extending `BaseEngine`) that loads provider metadata, selects a provider, creates Recommendation Run tracking records, and delegates the actual recommendation logic
2. **RecommendationProviderBase** -- an abstract class that concrete providers implement to generate recommendations for each source record
3. **RecommendationRequest/RecommendationResult** -- typed request and response objects that flow through the pipeline

Providers are discovered at runtime through MemberJunction's `ClassFactory` using `@RegisterClass(RecommendationProviderBase, 'ProviderName')`.

## Recommendation Flow

```mermaid
sequenceDiagram
    participant Caller
    participant Engine as RecommendationEngineBase
    participant CF as ClassFactory
    participant Provider as RecommendationProvider
    participant DB as MJ Database

    Caller->>Engine: Recommend(request)
    Engine->>Engine: TryThrowIfNotLoaded()

    alt Provider specified
        Engine->>Engine: Use request.Provider
    else No provider
        Engine->>Engine: Use first available
    end

    Engine->>Engine: GetRecommendationEntities(request)

    alt From List
        Engine->>DB: Load List + List Details
        Engine->>DB: Load entity records by IDs
    else From EntityAndRecordsInfo
        Engine->>DB: Load records by entity name + IDs
    else Pre-built
        Engine->>Engine: Validate Recommendations array
    end

    Engine->>DB: Create Recommendation Run (Status: In Progress)

    opt CreateErrorList = true
        Engine->>DB: Create error tracking List
    end

    Engine->>CF: CreateInstance(provider.Name)
    CF-->>Engine: Provider instance

    Engine->>Provider: Recommend(request)

    loop For each recommendation
        Provider->>Provider: Call external API
        Provider->>DB: SaveRecommendation + Items
    end

    Provider-->>Engine: RecommendationResult

    Engine->>DB: Update Run (Completed/Error)
    Engine-->>Caller: RecommendationResult
```

## Core Components

### RecommendationEngineBase

A singleton engine that manages the recommendation lifecycle.

```typescript
import { RecommendationEngineBase } from '@memberjunction/ai-recommendations';

// Access the singleton
const engine = RecommendationEngineBase.Instance;

// Initialize (loads Recommendation Providers metadata)
await engine.Config(false, contextUser);

// Run recommendations
const result = await engine.Recommend(request);
```

**Key properties and methods:**

| Member | Description |
|---|---|
| `Instance` | Static getter for the singleton instance |
| `RecommendationProviders` | Array of `RecommendationProviderEntity` loaded from metadata |
| `Config(forceRefresh?, contextUser?, provider?)` | Loads provider metadata into cache |
| `Recommend<T>(request)` | Runs the full recommendation pipeline |

### RecommendationProviderBase

Abstract base class for implementing recommendation providers.

```mermaid
classDiagram
    class RecommendationProviderBase {
        <<abstract>>
        -_md : Metadata
        -_ContextUser : UserInfo
        +ContextUser : UserInfo
        +Recommend(request)* RecommendationResult
        #SaveRecommendation(rec, runID, items) boolean
    }

    class ConcreteProvider {
        +Recommend(request) RecommendationResult
    }

    RecommendationProviderBase <|-- ConcreteProvider

    style RecommendationProviderBase fill:#2d6a9f,stroke:#1a4971,color:#fff
    style ConcreteProvider fill:#2d8659,stroke:#1a5c3a,color:#fff
```

The `SaveRecommendation` helper method handles:
1. Setting the `RecommendationRunID` on the recommendation entity
2. Saving the recommendation record
3. Linking and saving all `RecommendationItemEntity` records

### RecommendationRequest\<T\>

The request object supports three ways to specify source records:

```mermaid
graph TD
    RR["RecommendationRequest"]
    OPT1["Recommendations[]<br/>Pre-built entities"]
    OPT2["EntityAndRecordsInfo<br/>Entity name + Record IDs"]
    OPT3["ListID<br/>MJ List reference"]

    RR --> OPT1
    RR --> OPT2
    RR --> OPT3

    style RR fill:#2d6a9f,stroke:#1a4971,color:#fff
    style OPT1 fill:#2d8659,stroke:#1a5c3a,color:#fff
    style OPT2 fill:#2d8659,stroke:#1a5c3a,color:#fff
    style OPT3 fill:#2d8659,stroke:#1a5c3a,color:#fff
```

| Field | Type | Description |
|---|---|---|
| `Recommendations` | `RecommendationEntity[]` | Pre-built unsaved recommendation entities |
| `EntityAndRecordsInfo` | `{ EntityName, RecordIDs }` | Entity name and array of record IDs to process |
| `ListID` | `string` | ID of a MJ List whose details become the source records |
| `Provider` | `RecommendationProviderEntity` | Specific provider to use (defaults to first available) |
| `CurrentUser` | `UserInfo` | User context |
| `Options` | `T` | Generic additional options passed to the provider |
| `CreateErrorList` | `boolean` | Whether to create an error tracking list |
| `RunID` | `string` | Set automatically by the engine |
| `ErrorListID` | `string` | Set automatically if error list is created |

### RecommendationResult

```typescript
class RecommendationResult {
    Request: RecommendationRequest;
    RecommendationRun?: RecommendationRunEntity;
    RecommendationItems?: RecommendationItemEntity[];
    Success: boolean;
    ErrorMessage: string;

    AppendWarning(message: string): void;   // Adds warning without setting Success=false
    AppendError(message: string): void;     // Adds error and sets Success=false
    GetErrorMessages(): string[];           // Splits ErrorMessage into array
}
```

## Usage

### Running Recommendations from a List

```typescript
import { RecommendationEngineBase } from '@memberjunction/ai-recommendations';
import { RecommendationRequest } from '@memberjunction/ai-recommendations';

const engine = RecommendationEngineBase.Instance;
await engine.Config(false, contextUser);

const request = new RecommendationRequest();
request.ListID = 'list-uuid';
request.CurrentUser = contextUser;
request.CreateErrorList = true;

const result = await engine.Recommend(request);

if (result.Success) {
    console.log(`Generated ${result.RecommendationItems?.length ?? 0} items`);
} else {
    console.error(result.ErrorMessage);
}
```

### Running Recommendations by Entity and Record IDs

```typescript
const request = new RecommendationRequest();
request.EntityAndRecordsInfo = {
    EntityName: 'Products',
    RecordIDs: ['id-1', 'id-2', 'id-3']
};
request.CurrentUser = contextUser;

const result = await engine.Recommend(request);
```

### Implementing a Provider

```typescript
import { RecommendationProviderBase } from '@memberjunction/ai-recommendations';
import { RecommendationRequest, RecommendationResult } from '@memberjunction/ai-recommendations';
import { RegisterClass } from '@memberjunction/global';
import { Metadata } from '@memberjunction/core';
import { RecommendationItemEntity } from '@memberjunction/core-entities';

@RegisterClass(RecommendationProviderBase, 'My Recommendation Provider')
export class MyProvider extends RecommendationProviderBase {
    async Recommend(request: RecommendationRequest): Promise<RecommendationResult> {
        const result = new RecommendationResult(request);
        const md = new Metadata();

        for (const rec of request.Recommendations) {
            // Call your recommendation API/algorithm
            const suggestions = await this.getSuggestions(rec.SourceEntityRecordID);

            const items: RecommendationItemEntity[] = [];
            for (const suggestion of suggestions) {
                const item = await md.GetEntityObject<RecommendationItemEntity>(
                    'Recommendation Items', request.CurrentUser
                );
                item.NewRecord();
                item.DestinationEntityID = suggestion.entityID;
                item.DestinationEntityRecordID = suggestion.recordID;
                item.MatchProbability = suggestion.score;
                items.push(item);
            }

            await this.SaveRecommendation(rec, request.RunID, items);
        }

        return result;
    }

    private async getSuggestions(recordID: string): Promise<Suggestion[]> {
        // Your recommendation logic here
        return [];
    }
}
```

## Database Entities

```mermaid
erDiagram
    RECOMMENDATION_PROVIDERS {
        string ID PK
        string Name
        string Description
    }

    RECOMMENDATION_RUNS {
        string ID PK
        string RecommendationProviderID FK
        string RunByUserID FK
        datetime StartDate
        string Status
        string Description
    }

    RECOMMENDATIONS {
        string ID PK
        string RecommendationRunID FK
        string SourceEntityID FK
        string SourceEntityRecordID
    }

    RECOMMENDATION_ITEMS {
        string ID PK
        string RecommendationID FK
        string DestinationEntityID FK
        string DestinationEntityRecordID
        float MatchProbability
    }

    LISTS {
        string ID PK
        string Name
        string EntityID FK
        string UserID FK
    }

    RECOMMENDATION_PROVIDERS ||--o{ RECOMMENDATION_RUNS : has
    RECOMMENDATION_RUNS ||--o{ RECOMMENDATIONS : contains
    RECOMMENDATIONS ||--o{ RECOMMENDATION_ITEMS : produces
```

## Dependencies

| Package | Purpose |
|---|---|
| `@memberjunction/core` | `BaseEngine`, `Metadata`, `RunView`, `UserInfo`, `LogStatus` |
| `@memberjunction/core-entities` | `RecommendationEntity`, `RecommendationRunEntity`, `RecommendationItemEntity`, `RecommendationProviderEntity`, `ListEntity` |
| `@memberjunction/global` | `MJGlobal` class factory for provider discovery |

## Development

```bash
# Build
npm run build

# Development mode
npm run start
```

## License

ISC
