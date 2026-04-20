# @memberjunction/ai-vector-sync

Synchronizes MemberJunction entity records with vector databases by transforming records into embeddings through a template-based pipeline. Handles batch processing, worker-based parallelism, Entity Document management, and Entity Record Document tracking.

## Architecture

```mermaid
graph TD
    subgraph SyncPkg["@memberjunction/ai-vector-sync"]
        EVS["EntityVectorSyncer"]
        EDC["EntityDocumentCache"]
        EDTP["EntityDocumentTemplateParser"]
        BW["BatchWorker"]
    end

    subgraph Pipeline["Vectorization Pipeline"]
        FETCH["Fetch Records<br/>(batched)"] --> TEMPL["Parse Templates<br/>(text from fields)"]
        TEMPL --> EMBED["Generate Embeddings<br/>(AI model)"]
        EMBED --> UPSERT["Upsert to<br/>Vector DB"]
        UPSERT --> TRACK["Create Entity<br/>Record Documents"]
    end

    subgraph MJEntities["MemberJunction Entities"]
        ED["Entity Documents"]
        EDT["Entity Document Types"]
        ERD["Entity Record Documents"]
        VDI["Vector Indexes"]
    end

    subgraph External["External Services"]
        AI["Embedding Model<br/>(OpenAI, Mistral, etc.)"]
        VDB["Vector Database<br/>(Pinecone, etc.)"]
    end

    EVS --> EDC
    EVS --> EDTP
    EVS --> BW
    EDTP --> TEMPL
    BW --> EMBED
    BW --> UPSERT
    BW --> TRACK
    EVS --> ED
    EVS --> ERD
    BW --> AI
    BW --> VDB

    style SyncPkg fill:#2d6a9f,stroke:#1a4971,color:#fff
    style Pipeline fill:#2d8659,stroke:#1a5c3a,color:#fff
    style MJEntities fill:#b8762f,stroke:#8a5722,color:#fff
    style External fill:#7c5295,stroke:#563a6b,color:#fff
```

## Installation

```bash
npm install @memberjunction/ai-vector-sync
```

## Overview

This package converts MemberJunction entity records into vector embeddings stored in a vector database. The process is driven by **Entity Documents** -- metadata records that define which entity to vectorize, how to generate text from it (via templates), which embedding model to use, and where to store the results.

Key capabilities:

- **Batch processing** with configurable sizes for fetching, embedding, and upserting
- **Template-based text generation** using Entity Document templates that reference entity fields
- **Worker architecture** for concurrent embedding and upsert operations
- **Entity Document caching** via a singleton cache to avoid repeated database lookups
- **Default Entity Document creation** for entities that lack one
- **Resume support** via `StartingOffset` for interrupted processes
- **Entity Record Document tracking** to record which records have been vectorized

## Vectorization Flow

```mermaid
sequenceDiagram
    participant Caller
    participant EVS as EntityVectorSyncer
    participant Cache as EntityDocumentCache
    participant Parser as TemplateParser
    participant Worker as BatchWorker
    participant Model as Embedding Model
    participant VDB as Vector Database
    participant DB as MJ Database

    Caller->>EVS: VectorizeEntity(params, user)
    EVS->>EVS: Config(forceRefresh, user)
    EVS->>Cache: Refresh (loads Entity Documents)
    EVS->>Cache: GetDocument(entityDocumentID)
    Cache-->>EVS: EntityDocumentEntity

    EVS->>DB: Load template for Entity Document
    EVS->>DB: Fetch entity records (batch)

    loop For each batch
        EVS->>Parser: Parse template for each record
        Parser-->>EVS: Text strings

        EVS->>Worker: VectorizeTemplates batch
        Worker->>Model: createBatchEmbedding(texts)
        Model-->>Worker: Embedding vectors

        EVS->>Worker: UpsertVectors batch
        Worker->>VDB: createRecords(vectors)
        VDB-->>Worker: Success/failure

        EVS->>Worker: Create EntityRecordDocuments
        Worker->>DB: Save tracking records
    end

    EVS-->>Caller: VectorizeEntityResponse
```

## Core Components

### EntityVectorSyncer

The main class that orchestrates the entire vectorization process. Extends `VectorBase` from `@memberjunction/ai-vectors`.

**Key methods:**

| Method | Description |
|---|---|
| `Config(forceRefresh, contextUser)` | Initializes engines and caches; must be called before vectorization |
| `VectorizeEntity(params, contextUser)` | Runs the full vectorization pipeline for an entity |
| `GetEntityDocument(id)` | Retrieves an Entity Document by ID |
| `GetEntityDocumentByName(name, user)` | Retrieves an Entity Document by name |
| `GetActiveEntityDocuments(entityNames?)` | Gets all active Entity Documents, optionally filtered |
| `CreateDefaultEntityDocument(entityID, vectorDB, aiModel)` | Creates a default Entity Document when one does not exist |

### EntityDocumentCache

A singleton cache that loads all Entity Document and Entity Document Type records into memory for fast lookup.

```mermaid
classDiagram
    class EntityDocumentCache {
        -_instance : EntityDocumentCache
        -_cache : Record~string, EntityDocumentEntity~
        -_typeCache : Record~string, EntityDocumentTypeEntity~
        +Instance : EntityDocumentCache
        +IsLoaded : boolean
        +GetDocument(id) EntityDocumentEntity
        +GetDocumentByName(name) EntityDocumentEntity
        +GetDocumentType(id) EntityDocumentTypeEntity
        +GetDocumentTypeByName(name) EntityDocumentTypeEntity
        +GetFirstActiveDocumentForEntityByID(entityID) EntityDocumentEntity
        +GetFirstActiveDocumentForEntityByName(name) EntityDocumentEntity
        +Refresh(forceRefresh, user) void
        +SetCurrentUser(user) void
    }

    style EntityDocumentCache fill:#2d6a9f,stroke:#1a4971,color:#fff
```

### EntityDocumentTemplateParser

Converts entity records into text strings by evaluating Entity Document templates. Templates use `${FieldName}` syntax to reference entity field values.

```typescript
// Template example: "${FirstName} ${LastName} works at ${Company} as ${Title}"
// With record { FirstName: 'Jane', LastName: 'Doe', Company: 'Acme', Title: 'Engineer' }
// Result: "Jane Doe works at Acme as Engineer"
```

### BatchWorker

Handles the parallel execution of embedding generation, vector database upserts, and Entity Record Document creation. Configurable batch sizes allow tuning for memory and API rate limits.

## Usage

### Basic Vectorization

```typescript
import { EntityVectorSyncer } from '@memberjunction/ai-vector-sync';
import { UserInfo } from '@memberjunction/core';

const syncer = new EntityVectorSyncer();

// Initialize (required once)
await syncer.Config(false, contextUser);

// Vectorize all records for an entity
await syncer.VectorizeEntity({
    entityID: 'entity-uuid',
    entityDocumentID: 'doc-uuid',
    listBatchCount: 50,
    VectorizeBatchCount: 50,
    UpsertBatchCount: 50
}, contextUser);
```

### Vectorize a Specific List

```typescript
await syncer.VectorizeEntity({
    entityID: 'entity-uuid',
    entityDocumentID: 'doc-uuid',
    listID: 'list-uuid'     // Only records in this list
}, contextUser);
```

### Resume Interrupted Processing

```typescript
await syncer.VectorizeEntity({
    entityID: 'entity-uuid',
    entityDocumentID: 'doc-uuid',
    StartingOffset: 5000     // Skip first 5000 records
}, contextUser);
```

### Manage Entity Documents

```typescript
// Look up by name
const doc = await syncer.GetEntityDocumentByName('Contacts Vectorization', contextUser);

// Get all active documents
const activeDocs = await syncer.GetActiveEntityDocuments();

// Get active documents for specific entities only
const filtered = await syncer.GetActiveEntityDocuments(['Contacts', 'Companies']);

// Create a default document when none exists
const newDoc = await syncer.CreateDefaultEntityDocument(
    entityID, vectorDatabase, aiModel
);
```

## Configuration Types

### VectorizeEntityParams

```typescript
type VectorizeEntityParams = {
    entityID: string;               // Entity to vectorize
    entityDocumentID?: string;      // Entity Document configuration
    listID?: string;                // Optional: vectorize only this list
    listBatchCount?: number;        // Records per fetch batch (default: 50)
    VectorizeBatchCount?: number;   // Embedding batch size (default: 50)
    UpsertBatchCount?: number;      // DB upsert batch size (default: 50)
    StartingOffset?: number;        // Skip records for resume
    CurrentUser?: UserInfo;         // User context
};
```

### EntitySyncConfig

```typescript
type EntitySyncConfig = {
    EntityDocumentID: string;
    Interval: number;               // Seconds between syncs
    RunViewParams: RunViewParams;
    IncludeInSync: boolean;
    LastRunDate: string;
    VectorIndexID: number;
    VectorID: number;
};
```

## Entity Document Templates

Templates define how entity records are transformed into text for embedding generation.

```mermaid
graph LR
    ED["Entity Document"] --> TMPL["Template<br/>${Field} syntax"]
    TMPL --> PARSER["Template Parser"]
    REC["Entity Record"] --> PARSER
    PARSER --> TEXT["Plain Text"]
    TEXT --> EMBED["Embedding Model"]
    EMBED --> VEC["Vector"]

    style ED fill:#2d6a9f,stroke:#1a4971,color:#fff
    style TMPL fill:#2d8659,stroke:#1a5c3a,color:#fff
    style PARSER fill:#b8762f,stroke:#8a5722,color:#fff
    style EMBED fill:#7c5295,stroke:#563a6b,color:#fff
    style REC fill:#2d8659,stroke:#1a5c3a,color:#fff
    style TEXT fill:#b8762f,stroke:#8a5722,color:#fff
    style VEC fill:#7c5295,stroke:#563a6b,color:#fff
```

## Environment Variables

```env
# Database
DB_HOST=your-sql-server
DB_PORT=1433
DB_USERNAME=your-username
DB_PASSWORD=your-password
DB_DATABASE=your-database

# AI Models
OPENAI_API_KEY=your-openai-key
MISTRAL_API_KEY=your-mistral-key

# Vector Database
PINECONE_API_KEY=your-pinecone-key
PINECONE_HOST=your-pinecone-host
PINECONE_DEFAULT_INDEX=your-default-index

# User Context
CURRENT_USER_EMAIL=user@example.com
```

## Dependencies

| Package | Purpose |
|---|---|
| `@memberjunction/ai` | `BaseEmbeddings`, `GetAIAPIKey`, `EmbedTextsResult` |
| `@memberjunction/ai-vectordb` | `VectorDBBase`, `VectorRecord` |
| `@memberjunction/ai-vectors` | `VectorBase` base class |
| `@memberjunction/aiengine` | `AIEngine` singleton |
| `@memberjunction/core` | `Metadata`, `RunView`, `BaseEntity`, `UserInfo` |
| `@memberjunction/core-entities` | Entity type definitions |
| `@memberjunction/global` | MJGlobal class factory |
| `@memberjunction/templates` | Template engine for text generation |

## Performance Considerations

- **Batch sizes**: Adjust `listBatchCount`, `VectorizeBatchCount`, and `UpsertBatchCount` based on available memory and API rate limits
- **Long-running**: Full vectorization of large entities can take hours; use `StartingOffset` to resume
- **Worker concurrency**: The BatchWorker processes embedding and upsert operations concurrently within each batch
- **Caching**: `EntityDocumentCache` reduces database lookups for document metadata

## Development

```bash
# Build
npm run build

# Development mode
npm run start
```

## License

ISC
