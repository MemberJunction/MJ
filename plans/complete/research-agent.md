# Research Agent - Product Requirements Document

**Version:** 1.0
**Date:** 2025-10-15
**Status:** Draft
**Owner:** MemberJunction Team

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Goals & Objectives](#goals--objectives)
3. [Configuration Analysis](#configuration-analysis)
4. [Architecture Overview](#architecture-overview)
5. [Payload Structure](#payload-structure)
6. [Tools & Capabilities](#tools--capabilities)
7. [Implementation Plan](#implementation-plan)
8. [Success Criteria](#success-criteria)
9. [Appendices](#appendices)

---

## Executive Summary

The **Research Agent** is an intelligent Loop-type AI agent designed to conduct comprehensive, iterative research by gathering information from multiple sources, comparing and validating data, and synthesizing findings into detailed reports. Unlike simple search agents, the Research Agent employs a systematic methodology: forming research plans, gathering data from diverse sources, comparing contradictory information, determining research completeness, and iterating until the goal is achieved.

### Key Differentiators

- **Iterative & Comparative**: Loops through research cycles, comparing sources and validating information
- **Multi-Source**: Web search, internal documents, databases, demographic data, financial markets
- **Self-Directed**: Forms its own research plans and determines when to dig deeper
- **Transparent**: Tracks all sources, comparisons, contradictions, and reasoning
- **Modular**: Leverages specialized sub-agents (Database Research) for complex tasks

### Core Capabilities

1. **Web Research**: Google Custom Search (primary), DuckDuckGo (fallback), web page content extraction
2. **Internal Document Search**: Access to configured storage providers (SharePoint, Google Drive, Dropbox, Box)
3. **Database Research**: Ad-hoc SQL querying via dedicated sub-agent with security controls
4. **Structured Data**: Census demographics, stock prices, financial data
5. **Source Validation**: Cross-reference information, identify contradictions, assess reliability

---

## Goals & Objectives

### Primary Goals

1. **Enable Comprehensive Research**: Provide a single agent capable of researching across web, internal documents, and databases
2. **Ensure Quality**: Compare sources, identify contradictions, validate information quality
3. **Maintain Transparency**: Show all work including sources, comparisons, and reasoning at each iteration
4. **Preserve Security**: Safe, read-only database access with SQL injection prevention
5. **Deliver Value**: Produce actionable, well-cited research reports

### Success Metrics

- Research queries complete successfully >95% of the time
- Multi-source research incorporates 3+ distinct source types on average
- Source contradictions identified and highlighted in reports
- Zero security incidents from database access
- User satisfaction score >4.5/5 on research quality

### Non-Goals (Out of Scope)

- Real-time monitoring or alerting
- Automated decision-making based on research
- Writing back to databases (read-only only)
- External API integrations beyond those specified
- Multi-lingual research (initial version is English-only)

---

## Configuration Analysis

### Current State: Google PR #1453

**Approach:** The PR uses a hybrid configuration approach:

```typescript
// packages/Actions/CoreActions/src/config.ts
const apiConfig = getApiIntegrationsConfig();
const apiKey = apiConfig.googleCustomSearchApiKey;  // From mj.config.cjs
// Fallback: process.env.GOOGLE_CUSTOM_SEARCH_API_KEY
```

**Pattern:**
1. First checks `mj.config.cjs` for keys stored as flat properties
2. Falls back to environment variables
3. Uses `cosmiconfig` for flexible config loading
4. Caches configuration after first load

### Comparison with MJStorage Pattern

**MJStorage approach** (in `/packages/MJStorage/src/config.ts`):

```typescript
const rawConfig = {
  storageProviders: {
    googleDrive: {
      clientID: result.config.googleDriveClientID || process.env.STORAGE_GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: result.config.googleDriveClientSecret || process.env.STORAGE_GOOGLE_DRIVE_CLIENT_SECRET,
      refreshToken: result.config.googleDriveRefreshToken || process.env.STORAGE_GOOGLE_DRIVE_REFRESH_TOKEN,
      // ... more fields
    },
    sharePoint: {
      clientID: result.config.sharePointClientID || process.env.STORAGE_SHAREPOINT_CLIENT_ID,
      // ... more fields
    }
  }
};
```

**Key Differences:**
- **Namespacing**: MJStorage uses nested structure (`storageProviders.googleDrive.clientID`)
- **Env Variables**: MJStorage uses prefixed env vars (`STORAGE_GOOGLE_DRIVE_CLIENT_ID`)
- **Organization**: Groups related credentials together

### Recommendation: Align Google PR with MJStorage Pattern

**Why:**
1. **Consistency**: MJStorage pattern is more mature and handles 7+ providers
2. **Scalability**: Nested structure prevents flat-file sprawl as APIs grow
3. **Clarity**: Prefixed env vars (`GOOGLE_CUSTOM_SEARCH_API_KEY` vs generic `API_KEY`)
4. **Maintainability**: Easier to see all API integrations in one place

**Proposed Changes to Google PR:**

```typescript
// packages/Actions/CoreActions/src/config.ts

const apiIntegrationsSchema = z.object({
  perplexityApiKey: z.string().optional(),
  gammaApiKey: z.string().optional(),

  // NEW: Nested structure for Google services
  google: z.object({
    customSearch: z.object({
      apiKey: z.string().optional(),
      cx: z.string().optional(),  // Search engine ID
    }).optional(),
  }).optional(),
});

// In getCoreActionsConfig():
const rawConfig = {
  apiIntegrations: {
    perplexityApiKey: result.config.perplexityApiKey || process.env.PERPLEXITY_API_KEY,
    gammaApiKey: result.config.gammaApiKey || process.env.GAMMA_API_KEY,
    google: {
      customSearch: {
        apiKey: result.config.googleCustomSearchApiKey || process.env.GOOGLE_CUSTOM_SEARCH_API_KEY,
        cx: result.config.googleCustomSearchCx || process.env.GOOGLE_CUSTOM_SEARCH_CX,
      },
    },
  },
};
```

**Action Usage:**
```typescript
// In google-custom-search.action.ts
const apiConfig = getApiIntegrationsConfig();
const apiKey = apiConfig.google?.customSearch?.apiKey;
const cx = apiConfig.google?.customSearch?.cx;
```

**Configuration Files:**

```javascript
// mj.config.cjs (preferred)
module.exports = {
  // Flat API keys (legacy, deprecated)
  perplexityApiKey: 'pplx-xxx',
  gammaApiKey: 'sk-gamma-xxx',

  // Nested structure (new pattern)
  google: {
    customSearch: {
      apiKey: 'AIza...',
      cx: '0123456789',
    },
  },
};
```

```bash
# .env (fallback)
PERPLEXITY_API_KEY=pplx-xxx
GAMMA_API_KEY=sk-gamma-xxx
GOOGLE_CUSTOM_SEARCH_API_KEY=AIza...
GOOGLE_CUSTOM_SEARCH_CX=0123456789
```

### Decision Required

**Option A (Recommended)**: Update PR #1453 to use nested structure before merging
- Pros: Consistency, future-proof, cleaner
- Cons: Slightly more work now

**Option B**: Merge PR as-is, refactor later in separate PR
- Pros: Faster to merge, working code
- Cons: Technical debt, inconsistency

---

## Architecture Overview

### Agent Hierarchy

```
Research Agent (Loop Agent)
├── Database Research Agent (Sub-Agent, Loop)
└── [Future] Document Analysis Agent (Sub-Agent, Loop)
```

### Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Research Agent                          │
│  - Forms research plans                                      │
│  - Orchestrates multi-source research                       │
│  - Compares and validates sources                           │
│  - Determines iteration completeness                        │
│  - Synthesizes final reports                                │
└────────────┬────────────────────────────────────────────────┘
             │
             ├── Actions
             │   ├── Google Custom Search
             │   ├── Web Search (DuckDuckGo fallback)
             │   ├── Web Page Content
             │   ├── Census Data Lookup
             │   ├── Get Stock Price
             │   └── Search Storage Providers (NEW)
             │
             └── Sub-Agents
                 └── Database Research Agent
                     ├── Explore Database Schema (Action)
                     └── Execute Research Query (Action)
```

### Data Flow

```
User Request
    ↓
Research Agent: Form initial research plan
    ↓
┌─────────────────── Iteration Loop ───────────────────┐
│                                                       │
│  1. Gather data from multiple sources                │
│     - Web search (Google/DDG)                        │
│     - Web page content                               │
│     - Storage provider search                        │
│     - Database Research (via sub-agent)              │
│     - Census data                                    │
│     - Stock prices                                   │
│                                                       │
│  2. Store raw source materials with metadata         │
│                                                       │
│  3. Compare sources                                  │
│     - Cross-reference facts                          │
│     - Identify contradictions                        │
│     - Assess source reliability                      │
│                                                       │
│  4. Summarize iteration findings                     │
│     - What was learned                               │
│     - Source citations                               │
│     - Contradictions found                           │
│                                                       │
│  5. Evaluate completeness                            │
│     - Did we achieve research goal?                  │
│     - Do we need to dig deeper?                      │
│     - New questions raised?                          │
│                                                       │
│  6. Decide: Complete or Continue                     │
│     - If incomplete: refine plan, iterate again      │
│     - If complete: synthesize final report           │
│                                                       │
└───────────────────────────────────────────────────────┘
    ↓
Final Research Report
    - Executive summary
    - Detailed findings by iteration
    - All sources with citations
    - Contradictions highlighted
    - Confidence assessments
```

---

## Payload Structure

The Research Agent maintains a comprehensive JSON payload that tracks all research activities across iterations. This payload serves as both working memory and audit trail.

### Top-Level Structure

```typescript
interface ResearchPayload {
  // Research metadata
  metadata: ResearchMetadata;

  // Research plan and goals
  plan: ResearchPlan;

  // All source materials gathered
  sources: SourceMaterial[];

  // Cross-source comparisons
  comparisons: SourceComparison[];

  // Iteration history
  iterations: ResearchIteration[];

  // Final synthesis
  synthesis: ResearchSynthesis;
}
```

### Detailed Schema

```typescript
interface ResearchMetadata {
  researchID: string;                    // Unique identifier
  researchGoal: string;                  // Original user request
  startedAt: string;                     // ISO timestamp
  lastUpdatedAt: string;                 // ISO timestamp
  status: 'planning' | 'researching' | 'analyzing' | 'complete' | 'failed';
  iterationCount: number;                // Current iteration number
  totalSourcesGathered: number;          // Total sources collected
  contradictionsFound: number;           // Number of contradictions identified
}

interface ResearchPlan {
  initialPlan: string;                   // Original research plan
  currentPlan: string;                   // Updated plan (may evolve)
  researchQuestions: string[];           // Key questions to answer
  sourcesIdentified: string[];           // Types of sources to consult
  searchTerms: string[];                 // Search queries to use
  lastModified: string;                  // When plan was last updated
}

interface SourceMaterial {
  sourceID: string;                      // Unique source identifier
  sourceType: 'web' | 'document' | 'database' | 'api' | 'census' | 'financial';
  url?: string;                          // URL if web source
  title: string;                         // Source title/name
  author?: string;                       // Author or publisher
  publishedDate?: string;                // Publication date if known
  accessedAt: string;                    // When we accessed it

  // Raw content
  content: string;                       // Full text content
  contentFormat: 'text' | 'json' | 'html' | 'markdown' | 'csv' | 'pdf';
  contentLength: number;                 // Character count

  // Extraction metadata
  extractedFacts: ExtractedFact[];       // Key facts from this source

  // Quality indicators
  reliability: 'high' | 'medium' | 'low' | 'unknown';
  reliabilityReasoning: string;          // Why we assigned this rating

  // Comparison tracking
  comparedWith: string[];                // sourceIDs of sources compared against
  contradicts: string[];                 // sourceIDs this contradicts
  corroborates: string[];                // sourceIDs this corroborates

  // Research context
  gatheringIteration: number;            // Which iteration collected this
  searchQuery?: string;                  // Query that found this (if search)
  relevanceScore?: number;               // How relevant to research goal (0-1)
}

interface ExtractedFact {
  factID: string;                        // Unique identifier
  factText: string;                      // The actual fact/claim
  factType: 'statistic' | 'quote' | 'definition' | 'claim' | 'date' | 'other';
  confidence: number;                    // Confidence in extraction (0-1)
  sourceLocation?: string;               // Location in source (page, section, etc.)
  relatedFactIDs: string[];              // Other facts related to this one
}

interface SourceComparison {
  comparisonID: string;                  // Unique identifier
  sourceA: string;                       // First source ID
  sourceB: string;                       // Second source ID
  comparedAt: string;                    // Timestamp
  comparisonType: 'corroboration' | 'contradiction' | 'complementary' | 'unrelated';

  // Details for contradictions
  contradictionDetails?: {
    factA: string;                       // Fact from source A
    factB: string;                       // Conflicting fact from source B
    severity: 'major' | 'minor' | 'clarification';
    explanation: string;                 // Why this is a contradiction
    resolution?: string;                 // How we resolved it (if we did)
  };

  // Details for corroboration
  corroborationDetails?: {
    sharedFacts: string[];               // Fact IDs both sources agree on
    strengthLevel: 'strong' | 'moderate' | 'weak';
    explanation: string;                 // How they corroborate
  };

  comparisonNotes: string;               // General notes about comparison
}

interface ResearchIteration {
  iterationNumber: number;               // 1, 2, 3, etc.
  startedAt: string;                     // Timestamp
  completedAt: string;                   // Timestamp

  // What we did this iteration
  activitiesPerformed: IterationActivity[];

  // What we learned
  learnings: IterationLearning[];

  // Iteration summary
  summary: string;                       // Natural language summary
  sourcesGathered: string[];             // Source IDs collected this iteration
  comparisonsPerformed: string[];        // Comparison IDs performed
  questionsAnswered: string[];           // Questions answered
  newQuestionsRaised: string[];          // New questions discovered

  // Decision making
  completenessAssessment: {
    isComplete: boolean;                 // Did we achieve the goal?
    completenessScore: number;           // How complete (0-1)
    reasoning: string;                   // Why we think this
    gapsIdentified: string[];            // What's still missing
    confidenceLevel: number;             // Confidence in assessment (0-1)
  };

  nextSteps: string;                     // What to do next (or "complete")
}

interface IterationActivity {
  activityID: string;                    // Unique identifier
  activityType: 'search' | 'fetch' | 'query' | 'compare' | 'analyze';
  description: string;                   // What we did
  tool: string;                          // Which action/sub-agent used
  parameters: Record<string, any>;       // Parameters passed
  startedAt: string;                     // Timestamp
  completedAt: string;                   // Timestamp
  success: boolean;                      // Did it work?
  error?: string;                        // Error message if failed
  resultSummary: string;                 // What we got back
  sourcesCreated?: string[];             // Source IDs created by this activity
}

interface IterationLearning {
  learningID: string;                    // Unique identifier
  learningType: 'fact' | 'insight' | 'pattern' | 'contradiction' | 'gap';
  description: string;                   // What we learned
  confidence: number;                    // How confident (0-1)
  supportingSources: string[];           // Source IDs that support this
  contradictingSources?: string[];       // Source IDs that contradict
  relatedLearnings: string[];            // Other learning IDs related
}

interface ResearchSynthesis {
  executiveSummary: string;              // High-level summary

  // Organized findings
  findings: Finding[];

  // All contradictions
  contradictions: ContradictionSummary[];

  // Confidence assessment
  overallConfidence: number;             // Overall confidence in findings (0-1)
  confidenceReasoning: string;           // Why this confidence level

  // Recommendations
  recommendations: string[];             // What to do with findings
  furtherResearchNeeded: string[];       // Areas needing more research

  // Report metadata
  reportGeneratedAt: string;             // Timestamp
  totalIterations: number;               // How many iterations
  totalSources: number;                  // Total sources consulted
  totalComparisons: number;              // Total comparisons performed
}

interface Finding {
  findingID: string;                     // Unique identifier
  findingType: 'answer' | 'insight' | 'recommendation' | 'warning';
  question?: string;                     // Question this answers (if applicable)
  statement: string;                     // The finding itself
  confidence: number;                    // Confidence level (0-1)
  citations: Citation[];                 // Supporting sources
  contradictions?: string[];             // Contradiction IDs if any
  firstDiscoveredIteration: number;      // When we first found this
  strengthenedByIterations: number[];    // Iterations that strengthened this
}

interface Citation {
  sourceID: string;                      // Reference to source
  specificText?: string;                 // Specific quote/text
  relevance: number;                     // How relevant (0-1)
}

interface ContradictionSummary {
  contradictionID: string;               // Unique identifier
  description: string;                   // What the contradiction is
  severity: 'major' | 'minor' | 'clarification';
  sources: string[];                     // Source IDs involved
  possibleExplanations: string[];        // Why this might exist
  resolution?: string;                   // How we resolved it
  impactOnFindings: string;              // How this affects results
}
```

### Example Payload

```json
{
  "metadata": {
    "researchID": "res_20251015_001",
    "researchGoal": "Research the current state of quantum computing commercialization",
    "startedAt": "2025-10-15T10:00:00Z",
    "lastUpdatedAt": "2025-10-15T10:15:23Z",
    "status": "complete",
    "iterationCount": 3,
    "totalSourcesGathered": 12,
    "contradictionsFound": 2
  },
  "plan": {
    "initialPlan": "Cast wide net: search web for quantum computing news, check industry reports, query database for any quantum-related projects, get stock prices for major quantum companies",
    "currentPlan": "Initial plan complete. Focus narrowed to commercialization timeline and key players.",
    "researchQuestions": [
      "Which companies are leading quantum computing commercialization?",
      "What is the timeline for practical quantum computers?",
      "What are current limitations preventing commercialization?"
    ],
    "sourcesIdentified": ["web", "financial", "database"],
    "searchTerms": [
      "quantum computing commercialization 2025",
      "quantum computer companies",
      "quantum computing timeline",
      "IBM quantum Google quantum"
    ],
    "lastModified": "2025-10-15T10:08:00Z"
  },
  "sources": [
    {
      "sourceID": "src_001",
      "sourceType": "web",
      "url": "https://www.nature.com/articles/quantum-2025",
      "title": "Quantum Computing: State of the Industry 2025",
      "author": "Nature Journal",
      "publishedDate": "2025-01-15",
      "accessedAt": "2025-10-15T10:02:00Z",
      "content": "Full article text here...",
      "contentFormat": "html",
      "contentLength": 15420,
      "extractedFacts": [
        {
          "factID": "fact_001_1",
          "factText": "IBM achieved 1000+ qubit quantum processor in Q4 2024",
          "factType": "statistic",
          "confidence": 0.95,
          "relatedFactIDs": ["fact_002_3"]
        }
      ],
      "reliability": "high",
      "reliabilityReasoning": "Peer-reviewed scientific journal with strong reputation",
      "comparedWith": ["src_002", "src_003"],
      "contradicts": [],
      "corroborates": ["src_002"],
      "gatheringIteration": 1,
      "searchQuery": "quantum computing commercialization 2025",
      "relevanceScore": 0.92
    }
  ],
  "comparisons": [
    {
      "comparisonID": "cmp_001",
      "sourceA": "src_001",
      "sourceB": "src_002",
      "comparedAt": "2025-10-15T10:05:00Z",
      "comparisonType": "corroboration",
      "corroborationDetails": {
        "sharedFacts": ["fact_001_1", "fact_002_3"],
        "strengthLevel": "strong",
        "explanation": "Both sources independently report IBM's 1000+ qubit achievement"
      },
      "comparisonNotes": "High agreement on technical milestones"
    }
  ],
  "iterations": [
    {
      "iterationNumber": 1,
      "startedAt": "2025-10-15T10:00:00Z",
      "completedAt": "2025-10-15T10:08:00Z",
      "activitiesPerformed": [
        {
          "activityID": "act_001",
          "activityType": "search",
          "description": "Broad web search for quantum computing commercialization",
          "tool": "Google Custom Search",
          "parameters": {
            "query": "quantum computing commercialization 2025",
            "maxResults": 10
          },
          "startedAt": "2025-10-15T10:00:15Z",
          "completedAt": "2025-10-15T10:00:45Z",
          "success": true,
          "resultSummary": "Found 10 results from academic, news, and industry sources",
          "sourcesCreated": ["src_001", "src_002", "src_003", "src_004"]
        }
      ],
      "learnings": [
        {
          "learningID": "learn_001",
          "learningType": "fact",
          "description": "IBM and Google are leading quantum commercialization efforts",
          "confidence": 0.9,
          "supportingSources": ["src_001", "src_002", "src_003"],
          "relatedLearnings": []
        }
      ],
      "summary": "Initial broad search identified major players (IBM, Google, IonQ, Rigetti) and recent milestones. Need to dig deeper into specific commercialization timelines and limitations.",
      "sourcesGathered": ["src_001", "src_002", "src_003", "src_004"],
      "comparisonsPerformed": ["cmp_001"],
      "questionsAnswered": ["Which companies are leading?"],
      "newQuestionsRaised": ["What specific applications are being commercialized first?"],
      "completenessAssessment": {
        "isComplete": false,
        "completenessScore": 0.4,
        "reasoning": "Have identified key players but lack detail on timelines and limitations",
        "gapsIdentified": [
          "Commercialization timeline unclear",
          "Current technical limitations not well defined",
          "Missing financial data on quantum companies"
        ],
        "confidenceLevel": 0.7
      },
      "nextSteps": "Search for timeline and limitation information; get stock prices for quantum companies; check database for any quantum projects"
    }
  ],
  "synthesis": {
    "executiveSummary": "Quantum computing commercialization is advancing rapidly with IBM, Google, and IonQ leading. Current systems have reached 1000+ qubits but practical commercial applications remain 3-5 years away due to error correction challenges. Early commercial focus is on optimization and simulation problems.",
    "findings": [
      {
        "findingID": "find_001",
        "findingType": "answer",
        "question": "Which companies are leading quantum computing commercialization?",
        "statement": "IBM, Google, and IonQ are the three leading companies in quantum computing commercialization, with IBM achieving 1000+ qubit processors in 2024.",
        "confidence": 0.95,
        "citations": [
          {
            "sourceID": "src_001",
            "specificText": "IBM achieved 1000+ qubit quantum processor in Q4 2024",
            "relevance": 0.98
          },
          {
            "sourceID": "src_002",
            "relevance": 0.92
          }
        ],
        "firstDiscoveredIteration": 1,
        "strengthenedByIterations": [2, 3]
      }
    ],
    "contradictions": [
      {
        "contradictionID": "contra_001",
        "description": "Timeline for practical quantum computers varies between sources",
        "severity": "minor",
        "sources": ["src_003", "src_007"],
        "possibleExplanations": [
          "Different definitions of 'practical'",
          "Industry optimism vs academic conservatism"
        ],
        "resolution": "Most sources agree on 3-5 year timeline when pressed for specifics",
        "impactOnFindings": "Low impact - consensus emerges around 3-5 years despite initial variation"
      }
    ],
    "overallConfidence": 0.88,
    "confidenceReasoning": "Multiple high-quality sources with strong corroboration. Minor contradictions resolved. Limited by lack of internal company data.",
    "recommendations": [
      "Monitor IBM and Google's quantum cloud services for practical applications",
      "Consider quantum-resistant cryptography preparations",
      "Track error correction breakthroughs as key indicator"
    ],
    "furtherResearchNeeded": [
      "Detailed cost analysis of quantum computing services",
      "Survey of industries most likely to adopt early",
      "Analysis of quantum computing workforce/skills gap"
    ],
    "reportGeneratedAt": "2025-10-15T10:15:23Z",
    "totalIterations": 3,
    "totalSources": 12,
    "totalComparisons": 8
  }
}
```

---

## Tools & Capabilities

### 1. Web Search Tools

#### Google Custom Search (Primary)
- **Action Name**: `Google Custom Search`
- **Status**: In PR #1453, pending merge
- **Capabilities**:
  - Structured search results with titles, URLs, snippets
  - Advanced filtering (site, date, file type, language, region)
  - Safe search controls
  - High-quality results, good rate limits (paid)
- **Configuration**: API key + CX (search engine ID)
- **Use Cases**: Primary web research, high-quality results needed

#### Web Search - DuckDuckGo (Fallback)
- **Action Name**: `Web Search`
- **Status**: Currently available
- **Capabilities**:
  - Instant Answer API + HTML scraping fallback
  - Basic search functionality
  - Free but low rate limits
- **Configuration**: None required
- **Use Cases**: Fallback when Google quota exceeded, demo/testing

#### Web Page Content
- **Action Name**: `Web Page Content`
- **Status**: Currently available
- **Capabilities**:
  - Fetch and process multiple content types (HTML, JSON, PDF, DOCX, XML, CSV)
  - Intelligent content type detection
  - Format conversion
- **Configuration**: None required
- **Use Cases**: Deep dive into specific URLs from search results

### 2. Storage Provider Search (NEW)

**Problem**: MJStorage currently has no search capability - only file listing by path.

**Current MJStorage Capabilities**:
```typescript
// Available methods in FileStorageBase
ListObjects(prefix: string, delimiter?: string): Promise<StorageListResult>
GetObjectMetadata(objectName: string): Promise<StorageObjectMetadata>
GetObject(objectName: string): Promise<Buffer>
```

**Gap**: No way to search file contents or filenames across directories.

**Solution Options**:

#### Option A: Implement Provider-Native Search (Recommended)

**New Action**: `Search Storage Provider`

**Capabilities**:
- Search SharePoint: Use Microsoft Graph Search API
- Search Google Drive: Use Drive API search with `q` parameter
- Search Dropbox: Use search_v2 API
- Search Box: Use search API
- AWS S3/Azure/Google Cloud: No native search (fall back to list + filter)

**Implementation**:
```typescript
// New method in FileStorageBase
public abstract SearchFiles(
  query: string,
  options?: SearchOptions
): Promise<SearchResult[]>;

interface SearchOptions {
  fileTypes?: string[];        // Filter by extension
  modifiedAfter?: Date;        // Filter by date
  maxResults?: number;         // Limit results
  searchContent?: boolean;     // Search file contents vs names only
}

interface SearchResult {
  path: string;                // Full path to file
  name: string;                // Filename
  excerpt?: string;            // Content excerpt with match
  relevance: number;           // Relevance score (0-1)
  metadata: StorageObjectMetadata;
}
```

**Action Parameters**:
- `ProviderID` (required): File Storage Provider entity ID
- `Query` (required): Search query
- `SearchContent` (default: true): Search file contents or just names
- `FileTypes` (optional): Filter by extensions (e.g., ["pdf", "docx", "md"])
- `MaxResults` (default: 50): Maximum results to return

**Pros**:
- Leverages provider's native search (fast, accurate)
- Searches file contents, not just names
- Consistent interface across providers

**Cons**:
- Requires implementation for each provider
- Not all providers support content search

#### Option B: List + Filter Approach (Interim)

**New Action**: `Search Storage Provider Files`

**Approach**: List all files recursively, filter by filename matching query.

**Pros**:
- Works with all existing providers immediately
- No provider-specific implementation needed

**Cons**:
- Slow for large file sets
- Only searches filenames, not content
- High API usage (many list calls)

**Recommendation**:
- Implement Option B immediately for MVP
- Plan Option A for future enhancement (flag in "Further Research Needed")

### 3. Database Research Tools (NEW)

#### Explore Database Schema
- **Action Name**: `Explore Database Schema`
- **Status**: New - to be implemented
- **Capabilities**:
  - Query INFORMATION_SCHEMA views
  - Return table structures, columns, relationships
  - Filter by schema/table patterns
  - Include indexes, constraints (optional)
- **Security**: Read-only queries on metadata
- **Use Cases**: Understanding what data is available before querying

#### Execute Research Query
- **Action Name**: `Execute Research Query`
- **Status**: New - to be implemented
- **Capabilities**:
  - Execute ad-hoc SELECT queries
  - Multiple result formats (JSON, CSV, Markdown)
  - Row limiting, timeouts
  - Query result caching
- **Security**:
  - SQL parser validation (node-sql-parser)
  - SELECT-only enforcement
  - Dedicated read-only database user
  - Audit logging
  - Injection prevention
- **Configuration**: Opt-in (disabled by default)
- **Use Cases**: Querying internal data as part of research

### 4. Structured Data Tools

#### Census Data Lookup
- **Action Name**: `Census Data Lookup`
- **Status**: Currently available
- **Capabilities**:
  - US Census demographic and economic data
  - Lookup by ZIP code or city/state
- **Configuration**: None required
- **Use Cases**: Demographic research, market analysis

#### Get Stock Price
- **Action Name**: `Get Stock Price`
- **Status**: Currently available
- **Capabilities**:
  - Current stock price and information
  - Lookup by ticker symbol
- **Configuration**: None required
- **Use Cases**: Financial research, company valuation

### 5. Sub-Agent: Database Research

- **Agent Name**: `Database Research Agent`
- **Type**: Loop Agent
- **Parent**: Research Agent (related agent)
- **Status**: New - to be implemented
- **Capabilities**:
  - Autonomous database research workflow
  - Schema exploration → query planning → execution → iteration
  - Produces markdown reports with tables and citations
- **Actions**: Explore Database Schema, Execute Research Query
- **Use Cases**: Complex multi-query database research

---

## Implementation Plan

### Phase 1: Configuration & Google Search ✅ **COMPLETE**

**Goal**: Get configuration aligned and Google Custom Search merged.

#### 1.1 Configuration Refactoring ✅
**Task**: Update PR #1453 configuration to match MJStorage pattern

**Subtasks**:
- [x] 1.1.1 Update `packages/Actions/CoreActions/src/config.ts`
  - [x] Change schema to nested structure (`google.customSearch`)
  - [x] Update env variable fallback logic
  - [x] Update JSDoc comments
- [x] 1.1.2 Update `google-custom-search.action.ts`
  - [x] Change config access to `apiConfig.google?.customSearch?.apiKey`
  - [x] Handle undefined/null gracefully
  - [x] Update error messages
- [x] 1.1.3 Test configuration loading
  - [x] Test with mj.config.cjs
  - [x] Test with environment variables
  - [x] Test with missing config (should fail gracefully)
- [x] 1.1.4 Update documentation
  - [x] Update PR description with new config format
  - [x] Add example mj.config.cjs
  - [x] Add example .env

**Deliverables**:
- ✅ Configuration follows MJStorage pattern
- ✅ Tests pass
- ✅ Documentation updated

**Completed**: 2025-10-15
**Actual Time**: ~1.5 hours

---

#### 1.2 Google Search Testing & Merge ✅
**Task**: Test Google Custom Search action and merge PR

**Subtasks**:
- [x] 1.2.1 Set up test Google Custom Search credentials
  - [x] Create/obtain API key from Google Cloud Console
  - [x] Create/configure Custom Search Engine (CX)
  - [x] Add to local mj.config.cjs (env variables)
- [x] 1.2.2 Build and test the action
  - [x] Run `npm run build` in CoreActions package
  - [x] Create test script to call action directly
  - [x] Test with various queries and parameters
  - [x] Verified working with real credentials
- [x] 1.2.3 Create action metadata
  - [x] Add entry to `/metadata/actions/.google-custom-search.json`
  - [x] Define all parameters (Query, MaxResults, SafeSearch, etc.)
  - [x] Define result codes (SUCCESS, MISSING_API_KEY, etc.)
  - [x] Created Research Agent metadata
  - [x] Created Research Agent prompt
- [x] 1.2.4 Review and merge PR
  - [ ] Approve PR #1453 (ready for merge)
  - [ ] Merge to `next` branch with squash
- [x] 1.2.5 Pull into working branch
  - [ ] Switch to `an-dev-4` (after merge)
  - [ ] Pull from `next`
  - [ ] Resolve any conflicts
  - [ ] Verify Google Search still works

**Deliverables**:
- ✅ Google Custom Search action tested and working
- ✅ Action metadata created
- ✅ Research Agent metadata and prompt created
- ⏳ PR #1453 ready for merge (pending approval)

**Completed**: 2025-10-15
**Actual Time**: ~2 hours

---

### Phase 2: Storage Provider Search (Week 2)

**Goal**: Enable searching files in configured storage providers.

#### 2.1 Assess MJStorage Search Readiness
**Task**: Determine if MJStorage needs enhancement for search

**Subtasks**:
- [ ] 2.1.1 Review current MJStorage capabilities
  - [ ] Document what each provider supports (SharePoint, Google Drive, etc.)
  - [ ] Identify which providers have native search APIs
  - [ ] Identify which providers only support listing
- [ ] 2.1.2 Prototype native search for one provider
  - [ ] Choose provider (recommend: Google Drive - simpler API)
  - [ ] Add `SearchFiles` method to GoogleDriveFileStorage
  - [ ] Test with sample queries
  - [ ] Document performance and limitations
- [ ] 2.1.3 Decision: Full search vs List+Filter
  - [ ] If native search works well: proceed with Option A
  - [ ] If native search is complex: implement Option B for MVP
  - [ ] Document decision and reasoning

**Deliverables**:
- ✅ Assessment document of MJStorage search capabilities
- ✅ Prototype search implementation for one provider
- ✅ Decision on approach (native vs list+filter)

**Owner**: TBD
**Estimate**: 4-6 hours

---

#### 2.2 Implement Storage Provider Search Action
**Task**: Create action to search files in storage providers

**Subtasks**:
- [ ] 2.2.1 Extend FileStorageBase (if Option A)
  - [ ] Add abstract `SearchFiles` method to base class
  - [ ] Define SearchOptions and SearchResult interfaces
  - [ ] Document method contract
- [ ] 2.2.2 Implement provider-specific search
  - [ ] **If Option A**: Implement for each provider
    - [ ] GoogleDriveFileStorage
    - [ ] SharePointFileStorage
    - [ ] DropboxFileStorage
    - [ ] BoxFileStorage
    - [ ] AWS/Azure/Google Cloud (list+filter fallback)
  - [ ] **If Option B**: Implement unified list+filter logic
    - [ ] Recursive listing helper
    - [ ] Filename matching logic
    - [ ] Result ranking/sorting
- [ ] 2.2.3 Create Search Storage Provider action
  - [ ] Create `packages/Actions/CoreActions/src/custom/storage/search-storage-provider.action.ts`
  - [ ] Implement parameter extraction (ProviderID, Query, etc.)
  - [ ] Load File Storage Provider entity from database
  - [ ] Instantiate appropriate storage driver
  - [ ] Execute search and format results
  - [ ] Handle errors gracefully
  - [ ] Register action in index.ts
- [ ] 2.2.4 Create action metadata
  - [ ] Add to `/metadata/actions/.actions.json`
  - [ ] Define parameters
  - [ ] Define result codes
  - [ ] Sync to database

**Deliverables**:
- ✅ FileStorageBase enhanced with search (if Option A)
- ✅ Provider-specific search implementations
- ✅ Search Storage Provider action working
- ✅ Action metadata synchronized

**Owner**: TBD
**Estimate**: 12-16 hours (Option A), 6-8 hours (Option B)

---

#### 2.3 Test Storage Provider Search
**Task**: Comprehensive testing of storage search functionality

**Subtasks**:
- [ ] 2.3.1 Set up test storage providers
  - [ ] Configure at least 2 providers (e.g., Google Drive + SharePoint)
  - [ ] Upload test files with known content
  - [ ] Document test file structure
- [ ] 2.3.2 Unit tests
  - [ ] Test parameter validation
  - [ ] Test error handling (invalid provider, missing credentials)
  - [ ] Test result formatting
- [ ] 2.3.3 Integration tests
  - [ ] Test search by filename
  - [ ] Test search by content (if supported)
  - [ ] Test with different file types
  - [ ] Test result limits and pagination
- [ ] 2.3.4 Performance testing
  - [ ] Test with large file sets (1000+ files)
  - [ ] Measure response times
  - [ ] Identify any timeouts or bottlenecks

**Deliverables**:
- ✅ Comprehensive test suite
- ✅ Test storage providers configured
- ✅ Performance benchmarks documented
- ✅ Any issues identified and resolved

**Owner**: TBD
**Estimate**: 4-6 hours

---

### Phase 3: Database Research Actions (Week 3)

**Goal**: Create safe, read-only database querying capabilities.

#### 3.1 Database Security Setup
**Task**: Create read-only database user with appropriate permissions

**Subtasks**:
- [ ] 3.1.1 Create database user
  - [ ] Write SQL migration script
  - [ ] Create user: `mj_research_readonly`
  - [ ] Set strong password (store securely)
  - [ ] Document in migration
- [ ] 3.1.2 Grant SELECT permissions
  - [ ] Grant SELECT on relevant schemas
  - [ ] Exclude sensitive tables (if any)
  - [ ] Test permissions (verify no write access)
- [ ] 3.1.3 Test permission boundaries
  - [ ] Verify SELECT works
  - [ ] Verify INSERT/UPDATE/DELETE fail
  - [ ] Verify cannot access system tables
  - [ ] Verify cannot execute stored procedures
- [ ] 3.1.4 Configure connection
  - [ ] Add to mj.config.cjs schema
  - [ ] Support environment variables
  - [ ] Default to disabled (opt-in)
  - [ ] Document configuration

**Deliverables**:
- ✅ Read-only database user created
- ✅ Permissions tested and verified
- ✅ Configuration schema updated
- ✅ Security documentation

**Owner**: TBD
**Estimate**: 3-4 hours

---

#### 3.2 Implement Explore Database Schema Action
**Task**: Create action to explore database schema

**Subtasks**:
- [ ] 3.2.1 Create action file
  - [ ] Create `packages/Actions/CoreActions/src/custom/database/explore-schema.action.ts`
  - [ ] Implement parameter extraction (SchemaFilter, TableFilter, etc.)
  - [ ] Implement result formatting
- [ ] 3.2.2 Implement schema queries
  - [ ] Query INFORMATION_SCHEMA.TABLES
  - [ ] Query INFORMATION_SCHEMA.COLUMNS
  - [ ] Query foreign key relationships
  - [ ] Query indexes (if IncludeIndexes=true)
  - [ ] Query constraints (if IncludeConstraints=true)
- [ ] 3.2.3 Implement caching
  - [ ] Cache schema results per agent run
  - [ ] Expire cache after run completes
  - [ ] Document cache behavior
- [ ] 3.2.4 Format output
  - [ ] Structure as nested JSON (schemas → tables → columns)
  - [ ] Include descriptions from extended properties
  - [ ] Include relationship information
- [ ] 3.2.5 Register action
  - [ ] Export from index.ts
  - [ ] Create metadata in `/metadata/actions/`
  - [ ] Sync to database

**Deliverables**:
- ✅ Explore Database Schema action implemented
- ✅ Schema caching working
- ✅ Action registered and synchronized
- ✅ Output format documented

**Owner**: TBD
**Estimate**: 6-8 hours

---

#### 3.3 Implement Execute Research Query Action
**Task**: Create action to safely execute read-only SQL queries

**Subtasks**:
- [ ] 3.3.1 Install and configure SQL parser
  - [ ] Add `node-sql-parser` to dependencies
  - [ ] Research parser configuration
  - [ ] Test parser with various SQL statements
- [ ] 3.3.2 Implement security validation
  - [ ] Parse SQL with node-sql-parser
  - [ ] Verify statement type is SELECT only
  - [ ] Block dynamic SQL (EXEC, sp_executesql)
  - [ ] Block CTEs with write operations
  - [ ] Block system functions (xp_cmdshell, etc.)
  - [ ] Block database-modifying operations
  - [ ] Test validation with malicious queries
- [ ] 3.3.3 Create action file
  - [ ] Create `packages/Actions/CoreActions/src/custom/database/execute-research-query.action.ts`
  - [ ] Implement parameter extraction
  - [ ] Load configuration (verify enabled)
  - [ ] Create database connection pool for read-only user
- [ ] 3.3.4 Implement query execution
  - [ ] Execute query with timeout
  - [ ] Enforce row limit (MaxRows)
  - [ ] Handle errors gracefully
  - [ ] Log query for audit trail
- [ ] 3.3.5 Format results
  - [ ] Format as JSON (default)
  - [ ] Format as CSV (if requested)
  - [ ] Format as Markdown table (if requested)
  - [ ] Include execution metadata (time, row count, etc.)
  - [ ] Include citation information (query, timestamp, agent run ID)
- [ ] 3.3.6 Register action
  - [ ] Export from index.ts
  - [ ] Create metadata in `/metadata/actions/`
  - [ ] Sync to database

**Deliverables**:
- ✅ Execute Research Query action implemented
- ✅ SQL validation working (injection-proof)
- ✅ Multiple output formats supported
- ✅ Audit logging in place
- ✅ Action registered and synchronized

**Owner**: TBD
**Estimate**: 10-12 hours

---

#### 3.4 Test Database Research Actions
**Task**: Comprehensive security and functionality testing

**Subtasks**:
- [ ] 3.4.1 Functional tests
  - [ ] Test schema exploration with various filters
  - [ ] Test simple SELECT queries
  - [ ] Test queries with JOINs
  - [ ] Test queries with WHERE/ORDER BY/GROUP BY
  - [ ] Test different output formats
  - [ ] Test row limiting
  - [ ] Test timeout handling
- [ ] 3.4.2 Security tests (SQL injection)
  - [ ] Test with SQL injection attempts ('; DROP TABLE)
  - [ ] Test with UNION-based injection
  - [ ] Test with stacked queries
  - [ ] Test with dynamic SQL attempts
  - [ ] Test with system function calls
  - [ ] Document all injection attempts and verify blocks
- [ ] 3.4.3 Security tests (permission boundaries)
  - [ ] Verify read-only user cannot INSERT
  - [ ] Verify read-only user cannot UPDATE
  - [ ] Verify read-only user cannot DELETE
  - [ ] Verify cannot access system tables
- [ ] 3.4.4 Performance tests
  - [ ] Test with large result sets
  - [ ] Test query timeout enforcement
  - [ ] Test concurrent query execution
  - [ ] Identify any bottlenecks
- [ ] 3.4.5 Security audit
  - [ ] Review all validation logic
  - [ ] Review audit logging
  - [ ] Review error messages (no info leakage)
  - [ ] Document security measures

**Deliverables**:
- ✅ Comprehensive test suite
- ✅ Security testing complete (SQL injection proof)
- ✅ Permission boundaries verified
- ✅ Performance benchmarks documented
- ✅ Security audit report

**Owner**: TBD
**Estimate**: 8-10 hours

---

### Phase 4: Database Research Agent (Week 4)

**Goal**: Create sub-agent that orchestrates database research.

#### 4.1 Create Database Research Agent Prompt
**Task**: Design prompt that guides database research workflow

**Subtasks**:
- [ ] 4.1.1 Design workflow steps
  - [ ] Step 1: Understand research objective
  - [ ] Step 2: Explore database schema (identify relevant tables)
  - [ ] Step 3: Plan initial queries
  - [ ] Step 4: Execute queries iteratively
  - [ ] Step 5: Analyze results
  - [ ] Step 6: Refine queries if needed
  - [ ] Step 7: Synthesize findings as markdown report
- [ ] 4.1.2 Create prompt file
  - [ ] Create `/metadata/prompts/database-research-agent-main.md`
  - [ ] Write detailed instructions for each step
  - [ ] Include examples of good queries
  - [ ] Define taskComplete conditions
  - [ ] Specify output format (markdown with tables)
- [ ] 4.1.3 Create examples
  - [ ] Example 1: Simple query (count records)
  - [ ] Example 2: Complex query (JOINs, aggregation)
  - [ ] Example 3: Multi-query iteration
  - [ ] Include expected outputs
- [ ] 4.1.4 Define error handling
  - [ ] What to do when query fails
  - [ ] How to refine queries based on errors
  - [ ] When to give up vs keep trying

**Deliverables**:
- ✅ Database Research Agent prompt file
- ✅ Examples included
- ✅ Error handling defined

**Owner**: TBD
**Estimate**: 4-6 hours

---

#### 4.2 Create Database Research Agent Output Schema
**Task**: Define JSON structure for agent payload

**Subtasks**:
- [ ] 4.2.1 Design payload structure
  - [ ] Section: metadata (research goal, status)
  - [ ] Section: schema_exploration (tables identified)
  - [ ] Section: queries (all queries attempted)
  - [ ] Section: results (query results)
  - [ ] Section: analysis (insights from data)
  - [ ] Section: markdown_report (final output)
- [ ] 4.2.2 Create example output file
  - [ ] Create `/metadata/prompts/output/research/database-research-output.example.json`
  - [ ] Fill with realistic example
  - [ ] Include all sections
- [ ] 4.2.3 Define validation rules
  - [ ] Required fields
  - [ ] Field types
  - [ ] Validation error messages

**Deliverables**:
- ✅ Output schema defined
- ✅ Example output file created
- ✅ Validation rules documented

**Owner**: TBD
**Estimate**: 2-3 hours

---

#### 4.3 Create Database Research Agent Metadata
**Task**: Configure agent in MJ metadata system

**Subtasks**:
- [ ] 4.3.1 Create agent metadata file
  - [ ] Create entry in `/metadata/agents/.agents.json` (or separate file)
  - [ ] Set Name: "Database Research Agent"
  - [ ] Set TypeID: Loop agent
  - [ ] Set Status: Active
  - [ ] Set ExposeAsAction: true (can be called directly)
  - [ ] Set IconClass: "fa-solid fa-database"
  - [ ] Link to prompt: "@lookup:AI Prompts.Name=Database Research Agent - Main Prompt"
- [ ] 4.3.2 Configure as sub-agent
  - [ ] Set ParentID: "@lookup:AI Agents.Name=Research Agent"
  - [ ] Define PayloadDownstreamPaths (what it receives from parent)
  - [ ] Define PayloadUpstreamPaths (what it returns to parent)
- [ ] 4.3.3 Associate actions
  - [ ] Add Explore Database Schema action
  - [ ] Add Execute Research Query action
- [ ] 4.3.4 Configure output validation
  - [ ] Set FinalPayloadValidationMode: "Warn"
  - [ ] Set FinalPayloadValidation: "@file:../prompts/output/research/database-research-output.example.json"
  - [ ] Set FinalPayloadValidationMaxRetries: 2
- [ ] 4.3.5 Sync metadata
  - [ ] Run `npx mj-sync push`
  - [ ] Verify agent appears in database
  - [ ] Verify prompt and actions linked correctly

**Deliverables**:
- ✅ Agent metadata created
- ✅ Sub-agent relationship configured
- ✅ Actions associated
- ✅ Metadata synchronized to database

**Owner**: TBD
**Estimate**: 2-3 hours

---

#### 4.4 Test Database Research Agent
**Task**: Test agent standalone and as sub-agent

**Subtasks**:
- [ ] 4.4.1 Test standalone (direct invocation)
  - [ ] Simple research task (e.g., "Count users by role")
  - [ ] Complex research task (e.g., "Analyze action execution patterns")
  - [ ] Multi-query iteration task
  - [ ] Verify schema exploration works
  - [ ] Verify query iteration works
  - [ ] Verify markdown report generated
- [ ] 4.4.2 Test as sub-agent (called by Research Agent)
  - [ ] Create test Research Agent invocation that calls DB Research
  - [ ] Verify payload passed correctly (downstream)
  - [ ] Verify payload returned correctly (upstream)
  - [ ] Verify parent agent receives DB findings
- [ ] 4.4.3 Test error handling
  - [ ] Invalid research goal
  - [ ] Database connection failure
  - [ ] Invalid query syntax
  - [ ] Query timeout
  - [ ] No results found
- [ ] 4.4.4 Review generated reports
  - [ ] Check markdown formatting
  - [ ] Check citations (query shown for each table)
  - [ ] Check analysis quality
  - [ ] Check completeness

**Deliverables**:
- ✅ Standalone tests passing
- ✅ Sub-agent integration working
- ✅ Error handling validated
- ✅ Sample reports reviewed and approved

**Owner**: TBD
**Estimate**: 6-8 hours

---

### Phase 5: Research Agent (Week 5)

**Goal**: Create main orchestrating agent with multi-source research.

#### 5.1 Design Research Agent Prompt
**Task**: Create comprehensive prompt for multi-source research

**Subtasks**:
- [ ] 5.1.1 Design core research methodology
  - [ ] Form initial research plan (broad net by default)
  - [ ] Identify relevant sources and tools
  - [ ] Gather information from multiple sources
  - [ ] Compare sources and identify contradictions
  - [ ] Assess completeness
  - [ ] Decide: iterate or complete
- [ ] 5.1.2 Create prompt file
  - [ ] Create `/metadata/prompts/research-agent-main.md`
  - [ ] Write detailed methodology instructions
  - [ ] Explain when to use each tool/sub-agent
  - [ ] Define source comparison requirements
  - [ ] Explain contradiction handling
  - [ ] Define taskComplete conditions
- [ ] 5.1.3 Tool usage guidance
  - [ ] When to use Google Search vs DuckDuckGo
  - [ ] When to use Web Page Content
  - [ ] When to delegate to Database Research Agent
  - [ ] When to use Storage Provider Search
  - [ ] When to use Census/Stock data
- [ ] 5.1.4 Create examples
  - [ ] Example 1: Web-only research
  - [ ] Example 2: Web + Database combined
  - [ ] Example 3: Multi-source with contradictions
  - [ ] Example 4: Iterative deepening

**Deliverables**:
- ✅ Research Agent prompt file
- ✅ Methodology clearly defined
- ✅ Tool usage guidance included
- ✅ Examples provided

**Owner**: TBD
**Estimate**: 6-8 hours

---

#### 5.2 Create Research Agent Output Schema
**Task**: Define comprehensive payload structure (see Payload Structure section)

**Subtasks**:
- [ ] 5.2.1 Create TypeScript interface definitions
  - [ ] Create file: `/metadata/prompts/output/research/research-payload-schema.ts`
  - [ ] Define all interfaces from Payload Structure section
  - [ ] Add JSDoc comments
  - [ ] Export all types
- [ ] 5.2.2 Create example output file
  - [ ] Create `/metadata/prompts/output/research/research-agent-output.example.json`
  - [ ] Use example from Payload Structure section
  - [ ] Ensure it validates against schema
- [ ] 5.2.3 Create validation script
  - [ ] Script to validate payload against schema
  - [ ] Used by agent for self-validation
  - [ ] Used in testing

**Deliverables**:
- ✅ TypeScript schema interfaces
- ✅ Example output file
- ✅ Validation script

**Owner**: TBD
**Estimate**: 4-5 hours

---

#### 5.3 Create Research Agent Metadata
**Task**: Configure main Research Agent

**Subtasks**:
- [ ] 5.3.1 Create agent metadata file
  - [ ] Create entry in `/metadata/agents/.agents.json`
  - [ ] Set Name: "Research Agent"
  - [ ] Set Description: (from Architecture section)
  - [ ] Set TypeID: Loop agent
  - [ ] Set Status: Active
  - [ ] Set ExposeAsAction: true
  - [ ] Set IconClass: "fa-solid fa-magnifying-glass-chart"
  - [ ] Link to prompt
- [ ] 5.3.2 Associate all actions
  - [ ] Google Custom Search
  - [ ] Web Search (DuckDuckGo)
  - [ ] Web Page Content
  - [ ] Search Storage Provider
  - [ ] Census Data Lookup
  - [ ] Get Stock Price
- [ ] 5.3.3 Link sub-agent
  - [ ] Add Database Research Agent as related agent
  - [ ] No explicit ParentID (parent-child set on DB Research Agent)
- [ ] 5.3.4 Configure output validation
  - [ ] Set FinalPayloadValidationMode: "Warn"
  - [ ] Set FinalPayloadValidation: "@file:../prompts/output/research/research-agent-output.example.json"
  - [ ] Set FinalPayloadValidationMaxRetries: 2
- [ ] 5.3.5 Sync metadata
  - [ ] Run `npx mj-sync push`
  - [ ] Verify agent in database
  - [ ] Verify all actions linked
  - [ ] Verify sub-agent relationship

**Deliverables**:
- ✅ Research Agent metadata created
- ✅ All actions associated
- ✅ Sub-agent linked
- ✅ Metadata synchronized

**Owner**: TBD
**Estimate**: 2-3 hours

---

#### 5.4 Test Research Agent - Single Source
**Task**: Test with one source type at a time

**Subtasks**:
- [ ] 5.4.1 Test web search only
  - [ ] Simple query (e.g., "What is MemberJunction?")
  - [ ] Verify Google Search used (if configured)
  - [ ] Verify web page content fetched
  - [ ] Verify iteration logic works
  - [ ] Verify sources tracked in payload
- [ ] 5.4.2 Test database only
  - [ ] Query requiring database (e.g., "How many users in the system?")
  - [ ] Verify delegation to Database Research Agent
  - [ ] Verify payload exchange
  - [ ] Verify DB findings incorporated
- [ ] 5.4.3 Test storage provider only
  - [ ] Query about internal documents (e.g., "Find policy documents")
  - [ ] Verify storage search action called
  - [ ] Verify results incorporated
- [ ] 5.4.4 Test structured data
  - [ ] Census query (e.g., "Demographics of ZIP 90210")
  - [ ] Stock query (e.g., "NVIDIA stock price")
  - [ ] Verify data incorporated

**Deliverables**:
- ✅ Single-source tests passing
- ✅ Each tool working individually
- ✅ Payload structure validated

**Owner**: TBD
**Estimate**: 4-6 hours

---

#### 5.5 Test Research Agent - Multi-Source
**Task**: Test with multiple sources combined

**Subtasks**:
- [ ] 5.5.1 Test web + database
  - [ ] Query requiring both (e.g., "Research quantum computing and check if we have any quantum projects in our database")
  - [ ] Verify both sources used
  - [ ] Verify sources compared
  - [ ] Verify integrated findings
- [ ] 5.5.2 Test web + storage provider
  - [ ] Query about topic with internal docs (e.g., "Research AI regulation and check our policy documents")
  - [ ] Verify both sources consulted
  - [ ] Verify comparison between public and internal info
- [ ] 5.5.3 Test complex multi-source
  - [ ] Query requiring 3+ sources
  - [ ] Verify all sources used appropriately
  - [ ] Verify source comparison logic
  - [ ] Verify contradiction detection
- [ ] 5.5.4 Test source validation
  - [ ] Inject contradictory information (mock sources if needed)
  - [ ] Verify agent identifies contradiction
  - [ ] Verify contradiction tracked in payload
  - [ ] Verify resolution attempted

**Deliverables**:
- ✅ Multi-source integration working
- ✅ Source comparison logic validated
- ✅ Contradiction detection working
- ✅ Payload structure handles complex scenarios

**Owner**: TBD
**Estimate**: 6-8 hours

---

#### 5.6 Test Research Agent - Iteration Logic
**Task**: Verify iterative research behavior

**Subtasks**:
- [ ] 5.6.1 Test shallow research (completes quickly)
  - [ ] Simple, well-defined query
  - [ ] Verify completes in 1-2 iterations
  - [ ] Verify completeness assessment accurate
- [ ] 5.6.2 Test deep research (multiple iterations)
  - [ ] Complex, open-ended query
  - [ ] Verify multiple iterations occur
  - [ ] Verify plan refinement across iterations
  - [ ] Verify progressive deepening
- [ ] 5.6.3 Test iteration tracking
  - [ ] Verify iteration count increments
  - [ ] Verify activities logged per iteration
  - [ ] Verify learnings accumulated
  - [ ] Verify sources not re-fetched unnecessarily
- [ ] 5.6.4 Test completeness assessment
  - [ ] Verify "isComplete" logic works
  - [ ] Verify "gapsIdentified" populated
  - [ ] Verify "nextSteps" describe what's needed
  - [ ] Verify agent stops when complete (doesn't loop forever)

**Deliverables**:
- ✅ Iteration logic working correctly
- ✅ Completeness assessment validated
- ✅ No infinite loops
- ✅ Iteration tracking complete

**Owner**: TBD
**Estimate**: 4-6 hours

---

### Phase 6: Documentation & Polish (Week 6)

**Goal**: Document, optimize, and prepare for production.

#### 6.1 Create User Documentation
**Task**: Comprehensive usage documentation

**Subtasks**:
- [ ] 6.1.1 Create main README
  - [ ] Create `/docs/research-agent/README.md`
  - [ ] Overview of Research Agent capabilities
  - [ ] When to use Research Agent
  - [ ] Architecture diagram
- [ ] 6.1.2 Configuration guide
  - [ ] Create `/docs/research-agent/configuration.md`
  - [ ] Google Custom Search setup
  - [ ] Storage provider setup
  - [ ] Database research configuration
  - [ ] Security considerations
- [ ] 6.1.3 Usage examples
  - [ ] Create `/docs/research-agent/examples.md`
  - [ ] 10+ example queries with expected outputs
  - [ ] Web-only examples
  - [ ] Database examples
  - [ ] Multi-source examples
  - [ ] Complex iteration examples
- [ ] 6.1.4 Troubleshooting guide
  - [ ] Common errors and solutions
  - [ ] Configuration issues
  - [ ] Rate limiting
  - [ ] Database access issues

**Deliverables**:
- ✅ README created
- ✅ Configuration guide complete
- ✅ Usage examples documented
- ✅ Troubleshooting guide available

**Owner**: TBD
**Estimate**: 6-8 hours

---

#### 6.2 Create Developer Documentation
**Task**: Technical documentation for developers

**Subtasks**:
- [ ] 6.2.1 Architecture documentation
  - [ ] Create `/docs/research-agent/architecture.md`
  - [ ] Agent hierarchy
  - [ ] Payload structure (detailed)
  - [ ] Data flow diagrams
  - [ ] Component interactions
- [ ] 6.2.2 Action documentation
  - [ ] Document each action's implementation
  - [ ] API contracts
  - [ ] Error handling
  - [ ] Security measures
- [ ] 6.2.3 Extension guide
  - [ ] How to add new research sources
  - [ ] How to create related sub-agents
  - [ ] How to modify payload structure
  - [ ] How to enhance iteration logic
- [ ] 6.2.4 Code comments
  - [ ] Review all code files
  - [ ] Add/improve JSDoc comments
  - [ ] Document complex logic
  - [ ] Add examples in comments

**Deliverables**:
- ✅ Architecture documentation complete
- ✅ Action documentation complete
- ✅ Extension guide created
- ✅ Code well-commented

**Owner**: TBD
**Estimate**: 8-10 hours

---

#### 6.3 Performance Optimization
**Task**: Optimize for speed and cost

**Subtasks**:
- [ ] 6.3.1 Profile agent execution
  - [ ] Measure time per iteration
  - [ ] Identify bottlenecks (slow actions, etc.)
  - [ ] Measure token usage
  - [ ] Measure API costs
- [ ] 6.3.2 Implement caching
  - [ ] Cache search results (same query within run)
  - [ ] Cache database schema (avoid repeated queries)
  - [ ] Cache web page content (same URL)
  - [ ] Document cache behavior
- [ ] 6.3.3 Optimize prompt
  - [ ] Review prompt length
  - [ ] Remove unnecessary verbosity
  - [ ] Test with shorter prompts
  - [ ] Measure token savings
- [ ] 6.3.4 Optimize payload
  - [ ] Review payload size
  - [ ] Consider truncating very long content
  - [ ] Implement payload compression (if needed)
  - [ ] Document payload limits

**Deliverables**:
- ✅ Performance profile documented
- ✅ Caching implemented
- ✅ Prompt optimized
- ✅ Payload optimization complete
- ✅ Benchmarks documented

**Owner**: TBD
**Estimate**: 8-10 hours

---

#### 6.4 Security Audit
**Task**: Comprehensive security review

**Subtasks**:
- [ ] 6.4.1 Database security review
  - [ ] Review SQL injection prevention
  - [ ] Test with OWASP SQL injection payloads
  - [ ] Review read-only user permissions
  - [ ] Review audit logging completeness
  - [ ] Document security measures
- [ ] 6.4.2 API key security review
  - [ ] Review configuration storage
  - [ ] Ensure keys not logged
  - [ ] Review error messages (no key leakage)
  - [ ] Document key management best practices
- [ ] 6.4.3 Storage provider security review
  - [ ] Review permission model
  - [ ] Ensure no write access from agent
  - [ ] Review token/credential handling
  - [ ] Document security considerations
- [ ] 6.4.4 Payload security review
  - [ ] Review for PII/sensitive data handling
  - [ ] Consider redaction options
  - [ ] Review artifact storage permissions
  - [ ] Document data privacy considerations
- [ ] 6.4.5 Penetration testing
  - [ ] Attempt to bypass SQL validation
  - [ ] Attempt to access unauthorized data
  - [ ] Attempt to execute write operations
  - [ ] Document all attempts and results

**Deliverables**:
- ✅ Security audit report
- ✅ All security measures validated
- ✅ Penetration testing complete
- ✅ Security documentation updated

**Owner**: TBD
**Estimate**: 10-12 hours

---

#### 6.5 Final Testing & QA
**Task**: End-to-end testing and quality assurance

**Subtasks**:
- [ ] 6.5.1 Regression testing
  - [ ] Re-run all previous tests
  - [ ] Verify no regressions from optimizations
  - [ ] Verify all features still work
- [ ] 6.5.2 Edge case testing
  - [ ] Empty search results
  - [ ] Very large result sets
  - [ ] Network failures
  - [ ] API rate limits hit
  - [ ] Database timeouts
  - [ ] Invalid configurations
- [ ] 6.5.3 Load testing
  - [ ] Multiple concurrent research requests
  - [ ] Long-running research (many iterations)
  - [ ] High-volume API usage
  - [ ] Database connection pool under load
- [ ] 6.5.4 User acceptance testing
  - [ ] Real-world research scenarios
  - [ ] Get feedback from actual users
  - [ ] Iterate based on feedback
- [ ] 6.5.5 Cross-browser/platform testing
  - [ ] Test in Explorer UI (Chrome, Firefox, Safari)
  - [ ] Test via API directly
  - [ ] Test on different OS (if applicable)

**Deliverables**:
- ✅ All tests passing
- ✅ Edge cases handled
- ✅ Load testing results documented
- ✅ User feedback incorporated
- ✅ Ready for production

**Owner**: TBD
**Estimate**: 12-16 hours

---

### Phase 7: Deployment & Launch (Week 7)

**Goal**: Deploy to production and launch to users.

#### 7.1 Deployment Preparation
**Task**: Prepare for production deployment

**Subtasks**:
- [ ] 7.1.1 Environment configuration
  - [ ] Set up production API keys (Google Search)
  - [ ] Set up production database user
  - [ ] Set up storage provider credentials
  - [ ] Verify all secrets stored securely
- [ ] 7.1.2 Database migrations
  - [ ] Review all migration scripts
  - [ ] Test migrations on staging
  - [ ] Prepare rollback plan
  - [ ] Document migration process
- [ ] 7.1.3 Metadata synchronization
  - [ ] Sync all agent metadata to production
  - [ ] Sync all action metadata
  - [ ] Sync all prompts
  - [ ] Verify sync successful
- [ ] 7.1.4 Monitoring setup
  - [ ] Set up logging for research agent
  - [ ] Set up error alerting
  - [ ] Set up usage tracking
  - [ ] Set up cost tracking (API usage)

**Deliverables**:
- ✅ Production environment configured
- ✅ Database migrations ready
- ✅ Metadata synchronized
- ✅ Monitoring in place

**Owner**: TBD
**Estimate**: 6-8 hours

---

#### 7.2 Staged Rollout
**Task**: Deploy in stages with monitoring

**Subtasks**:
- [ ] 7.2.1 Deploy to staging
  - [ ] Deploy code to staging environment
  - [ ] Run smoke tests
  - [ ] Run full test suite
  - [ ] Verify all features working
- [ ] 7.2.2 Limited production rollout
  - [ ] Deploy to production (feature flag: off by default)
  - [ ] Enable for beta users only
  - [ ] Monitor usage and errors
  - [ ] Gather feedback
- [ ] 7.2.3 Expand rollout
  - [ ] Enable for larger user group
  - [ ] Continue monitoring
  - [ ] Address any issues
- [ ] 7.2.4 Full rollout
  - [ ] Enable for all users
  - [ ] Announce feature
  - [ ] Monitor closely for first 48 hours

**Deliverables**:
- ✅ Staged deployment complete
- ✅ No critical issues found
- ✅ Feature fully enabled

**Owner**: TBD
**Estimate**: 8-12 hours (spread over days)

---

#### 7.3 Post-Launch
**Task**: Monitor and iterate post-launch

**Subtasks**:
- [ ] 7.3.1 Usage monitoring (Week 1)
  - [ ] Track number of research requests
  - [ ] Track success/failure rates
  - [ ] Track iteration counts
  - [ ] Track source usage patterns
  - [ ] Track API costs
- [ ] 7.3.2 User feedback collection
  - [ ] Send survey to users
  - [ ] Conduct user interviews
  - [ ] Review support tickets
  - [ ] Identify pain points
- [ ] 7.3.3 Issue triage
  - [ ] Address any critical bugs immediately
  - [ ] Prioritize non-critical bugs
  - [ ] Track feature requests
  - [ ] Create backlog items
- [ ] 7.3.4 Iteration planning
  - [ ] Review feedback and metrics
  - [ ] Plan next iteration of improvements
  - [ ] Update roadmap

**Deliverables**:
- ✅ Usage metrics tracked
- ✅ User feedback collected
- ✅ Issues triaged
- ✅ Next iteration planned

**Owner**: TBD
**Estimate**: Ongoing

---

## Success Criteria

### Functional Requirements

| Requirement | Acceptance Criteria | Priority |
|-------------|-------------------|----------|
| Multi-source research | Successfully gathers data from 3+ source types in single request | P0 |
| Source comparison | Identifies and highlights contradictions between sources | P0 |
| Iterative research | Loops through multiple iterations until goal achieved | P0 |
| Database querying | Executes ad-hoc SQL safely with read-only access | P0 |
| Storage search | Searches files in at least 2 storage providers | P1 |
| Web search | Uses Google Custom Search as primary, DuckDuckGo as fallback | P0 |
| Payload tracking | Maintains comprehensive payload with sources, comparisons, iterations | P0 |
| Report generation | Produces markdown reports with citations | P0 |
| Sub-agent delegation | Successfully delegates to Database Research Agent | P0 |
| Error handling | Gracefully handles API failures, timeouts, invalid queries | P0 |

### Non-Functional Requirements

| Requirement | Acceptance Criteria | Priority |
|-------------|-------------------|----------|
| Performance | Research completes in <5 minutes for typical queries | P1 |
| Security | Zero SQL injection vulnerabilities | P0 |
| Security | Zero unauthorized data access incidents | P0 |
| Reliability | >95% success rate for well-formed queries | P0 |
| Cost efficiency | Average research cost <$0.50 (API costs) | P1 |
| Usability | >80% of users can complete research without assistance | P1 |
| Documentation | 100% of features documented | P0 |
| Test coverage | >80% code coverage for new code | P1 |

### User Satisfaction

| Metric | Target | Priority |
|--------|--------|----------|
| User satisfaction score | >4.5/5 | P0 |
| Research quality rating | >4.0/5 | P0 |
| Would use again | >90% | P1 |
| Reports are actionable | >85% | P1 |

---

## Appendices

### Appendix A: Configuration Examples

#### mj.config.cjs (Full Example)

```javascript
module.exports = {
  // API Integrations
  perplexityApiKey: process.env.PERPLEXITY_API_KEY,
  gammaApiKey: process.env.GAMMA_API_KEY,

  google: {
    customSearch: {
      apiKey: process.env.GOOGLE_CUSTOM_SEARCH_API_KEY,
      cx: process.env.GOOGLE_CUSTOM_SEARCH_CX,
    },
  },

  // Database Research (opt-in)
  databaseSettings: {
    research: {
      enabled: false,  // Set to true to enable
      readOnlyUser: 'mj_research_readonly',
      readOnlyPassword: process.env.MJ_RESEARCH_DB_PASSWORD,
      maxQueryTimeoutSeconds: 30,
      maxResultRows: 1000,
    },
  },

  // Storage Providers
  storageProviders: {
    googleDrive: {
      clientID: process.env.STORAGE_GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: process.env.STORAGE_GOOGLE_DRIVE_CLIENT_SECRET,
      refreshToken: process.env.STORAGE_GOOGLE_DRIVE_REFRESH_TOKEN,
    },
    sharePoint: {
      clientID: process.env.STORAGE_SHAREPOINT_CLIENT_ID,
      clientSecret: process.env.STORAGE_SHAREPOINT_CLIENT_SECRET,
      tenantID: process.env.STORAGE_SHAREPOINT_TENANT_ID,
      siteID: process.env.STORAGE_SHAREPOINT_SITE_ID,
    },
  },
};
```

#### .env (Full Example)

```bash
# API Integrations
PERPLEXITY_API_KEY=pplx-xxxxxxxxxxxx
GAMMA_API_KEY=sk-gamma-xxxxxxxxxxxx
GOOGLE_CUSTOM_SEARCH_API_KEY=AIzaxxxxxxxxxxxxxxxx
GOOGLE_CUSTOM_SEARCH_CX=0123456789abcdef

# Database Research
MJ_RESEARCH_DB_PASSWORD=strong_password_here

# Google Drive
STORAGE_GOOGLE_DRIVE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
STORAGE_GOOGLE_DRIVE_CLIENT_SECRET=xxxxxxxxxxxx
STORAGE_GOOGLE_DRIVE_REFRESH_TOKEN=xxxxxxxxxxxx

# SharePoint
STORAGE_SHAREPOINT_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
STORAGE_SHAREPOINT_CLIENT_SECRET=xxxxxxxxxxxx
STORAGE_SHAREPOINT_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
STORAGE_SHAREPOINT_SITE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

---

### Appendix B: Database Migration Script

```sql
-- Migration: Create read-only research user
-- Version: v2.XX.X
-- Date: 2025-XX-XX

USE [MemberJunction];
GO

-- Create login (only if it doesn't exist)
IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = 'mj_research_readonly')
BEGIN
    CREATE LOGIN mj_research_readonly WITH PASSWORD = '${MJ_RESEARCH_DB_PASSWORD}';
END
GO

-- Create user in database
IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = 'mj_research_readonly')
BEGIN
    CREATE USER mj_research_readonly FOR LOGIN mj_research_readonly;
END
GO

-- Grant SELECT on all schemas (adjust as needed)
GRANT SELECT ON SCHEMA::dbo TO mj_research_readonly;
GO

-- Explicitly deny dangerous permissions
DENY INSERT, UPDATE, DELETE, EXECUTE ON SCHEMA::dbo TO mj_research_readonly;
DENY CREATE TABLE, CREATE PROCEDURE, CREATE FUNCTION TO mj_research_readonly;
DENY ALTER ANY DATABASE TO mj_research_readonly;
GO

-- Grant VIEW DEFINITION (allows seeing object definitions)
GRANT VIEW DEFINITION TO mj_research_readonly;
GO

PRINT 'Research user mj_research_readonly created successfully';
GO
```

---

### Appendix C: SQL Injection Test Cases

These should all be blocked by the Execute Research Query action:

```sql
-- Test 1: Classic SQL injection
SELECT * FROM Users WHERE ID = '1' OR '1'='1'; DROP TABLE Users; --'

-- Test 2: UNION-based injection
SELECT * FROM Users WHERE ID = '1' UNION SELECT * FROM SystemPasswords --'

-- Test 3: Stacked queries
SELECT * FROM Users; DELETE FROM Users WHERE 1=1;

-- Test 4: Dynamic SQL
EXEC('SELECT * FROM Users WHERE ID = ' + @UserInput)

-- Test 5: System function call
SELECT * FROM Users; EXEC xp_cmdshell 'dir';

-- Test 6: CTE with write
WITH DeletedUsers AS (DELETE FROM Users OUTPUT DELETED.*) SELECT * FROM DeletedUsers;

-- Test 7: Stored procedure execution
EXEC sp_executesql N'SELECT * FROM Users'

-- Test 8: Obfuscated injection
SELECT * FROM Users WHERE ID = CHAR(49) OR CHAR(49)=CHAR(49)
```

All of these should result in validation errors with clear messages like:
- "Only SELECT statements are allowed"
- "Dynamic SQL is not permitted"
- "System functions are not allowed"

---

### Appendix D: Open Questions & Decisions Needed

| Question | Options | Recommendation | Decision | Date |
|----------|---------|----------------|----------|------|
| Google PR config approach | A: Nested structure<br>B: Flat structure | Option A (nested) | TBD | |
| Storage search implementation | A: Native search APIs<br>B: List+filter | Option B for MVP,<br>A for future | TBD | |
| Database research default | A: Enabled by default<br>B: Opt-in (disabled) | Option B (security) | TBD | |
| Storage search scope | Which providers to support? | All 5 major ones | TBD | |
| API cost allocation | Who pays for Google Search? | Per-organization config? | TBD | |
| Payload artifact storage | Auto-save research reports? | Yes, as artifacts | TBD | |
| Iteration limit | Max iterations before stopping? | 10 iterations max | TBD | |
| Content search toggle | Search file contents or names only? | Both (configurable) | TBD | |

---

### Appendix E: Future Enhancements

These are explicitly out of scope for initial release but valuable for future:

1. **Additional Storage Providers**
   - OneDrive (separate from SharePoint)
   - Amazon S3 (if customer uses for documents)
   - Nextcloud/ownCloud
   - SMB/CIFS file shares

2. **Advanced Database Features**
   - Query result visualization (charts, graphs)
   - Query history and favorites
   - Query approval workflow for sensitive data
   - Cross-database queries (if multiple databases)

3. **Enhanced Web Research**
   - Academic search (Google Scholar, PubMed)
   - News-specific search
   - Social media search (Twitter, Reddit)
   - Patent search

4. **Source Quality Assessment**
   - Automated source credibility scoring
   - Fact-checking via external services
   - Citation analysis
   - Recency scoring

5. **Collaboration Features**
   - Share research reports
   - Collaborative research sessions
   - Research templates
   - Research history and reuse

6. **Real-Time Features**
   - Monitor topics over time
   - Alerting on new information
   - Scheduled research runs

7. **Multi-lingual Support**
   - Research in languages other than English
   - Cross-language source comparison
   - Translation integration

8. **Export Formats**
   - PDF report generation
   - PowerPoint/slides generation
   - Excel data exports
   - Integration with note-taking apps

---

### Appendix F: Risk Register

| Risk | Likelihood | Impact | Mitigation | Owner |
|------|------------|--------|------------|-------|
| SQL injection vulnerability | Low | Critical | Comprehensive validation, security testing, read-only user | Dev team |
| Google Search cost overruns | Medium | Medium | Rate limiting, cost monitoring, fallback to DuckDuckGo | PM |
| Storage provider API changes | Medium | Medium | Version pinning, abstraction layer, monitoring | Dev team |
| Poor research quality | Medium | High | Prompt engineering, user feedback, iteration | Product |
| Slow performance | Medium | Medium | Caching, optimization, async operations | Dev team |
| Database query timeouts | Medium | Low | Query timeout limits, query optimization guidance | Dev team |
| Insufficient storage search | High | Medium | Start with Option B (list+filter), plan Option A | Product |
| User confusion | Medium | Medium | Comprehensive documentation, examples, training | Product |
| API rate limiting | Medium | Medium | Backoff logic, queueing, fallbacks | Dev team |
| Security audit delays launch | Low | High | Start security review early, allocate buffer time | PM |

---

### Appendix G: Glossary

- **Agent**: AI-powered autonomous system that can use tools and make decisions
- **Loop Agent**: Agent type that iterates until task completion (vs Flow Agent with predetermined path)
- **Sub-Agent**: Agent that can be called by another agent (parent-child relationship)
- **Action**: Discrete operation an agent can perform (e.g., web search, database query)
- **Payload**: JSON structure containing agent's working memory and state
- **Iteration**: One cycle of research (gather → compare → assess → decide)
- **Source Material**: Any information gathered from external sources (web, database, etc.)
- **Contradiction**: Conflicting information between two or more sources
- **Corroboration**: Multiple sources agreeing on the same information
- **Citation**: Reference to original source supporting a finding
- **Completeness Assessment**: Agent's evaluation of whether research goal achieved
- **Storage Provider**: Configured file storage system (Google Drive, SharePoint, etc.)
- **File Storage Provider Entity**: MJ database entity storing provider configuration
- **Read-Only User**: Database user with SELECT-only permissions
- **SQL Injection**: Security vulnerability where malicious SQL is executed
- **Node-sql-parser**: Library for parsing and validating SQL statements
- **MJStorage**: MemberJunction package for file storage abstraction

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-15 | MJ Team | Initial PRD creation |

---

## Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Product Owner | | | |
| Technical Lead | | | |
| Security Lead | | | |
| Engineering Manager | | | |

---

**END OF DOCUMENT**
