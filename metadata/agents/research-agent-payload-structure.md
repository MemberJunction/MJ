# Research Agent Payload Structure

**Version:** 1.0
**Date:** 2025-10-15
**Purpose:** Define the JSON payload structure for tracking Research Agent state across iterations

---

## Overview

The Research Agent payload tracks all research activities, sources, comparisons, contradictions, and findings across multiple iterations. This structure enables:
- Full audit trail of research process
- Source tracking and validation
- Contradiction detection and resolution
- Iterative refinement tracking
- Final synthesis generation

---

## Complete TypeScript Interfaces

```typescript
/**
 * Main payload structure for Research Agent
 */
interface ResearchAgentPayload {
  metadata: ResearchMetadata;
  plan: ResearchPlan;
  sources: SourceRecord[];
  comparisons: Comparison[];
  contradictions: ContradictionRecord[];
  iterations: IterationRecord[];
  synthesis: ResearchSynthesis;
}

/**
 * High-level metadata about the research session
 */
interface ResearchMetadata {
  researchID: string;                      // Unique identifier (e.g., "res_20251015_001")
  researchGoal: string;                    // User's original research question
  startedAt: string;                       // ISO 8601 timestamp
  lastUpdatedAt: string;                   // ISO 8601 timestamp (updates each iteration)
  status: 'in_progress' | 'complete' | 'failed' | 'cancelled';
  iterationCount: number;                  // Current iteration number
  totalSourcesGathered: number;            // Count across all iterations
  contradictionsFound: number;             // Total contradictions identified
  completenessScore: number;               // 0.0-1.0, overall research completeness
}

/**
 * The agent's research plan, evolving through iterations
 */
interface ResearchPlan {
  initialPlan: string;                     // First plan formulated
  currentPlan: string;                     // Latest refined plan
  researchQuestions: string[];             // Key questions to answer
  sourcesIdentified: SourceType[];         // Types of sources to consult
  searchTerms: string[];                   // Search queries to use
  strategicApproach: string;               // Current research strategy
  lastModified: string;                    // ISO 8601 timestamp
}

/**
 * Types of sources the agent can use
 */
type SourceType =
  | 'web'                  // Google Custom Search
  | 'storage'              // File storage providers
  | 'database'             // SQL queries
  | 'structured_data'      // Census, stock prices, etc.
  | 'sub_agent';           // Delegated to another agent

/**
 * A single source of information gathered
 */
interface SourceRecord {
  sourceID: string;                        // Unique identifier (e.g., "src_001")
  sourceType: SourceType;

  // Web-specific fields
  url?: string;                            // For web sources
  title?: string;                          // Document/page title
  author?: string;                         // Author/publisher
  publishedDate?: string;                  // ISO 8601 date

  // Storage-specific fields
  storageProvider?: string;                // Provider name
  filePath?: string;                       // Path to file
  fileType?: string;                       // MIME type or extension

  // Database-specific fields
  databaseQuery?: string;                  // SQL query used
  databaseName?: string;                   // Database queried
  resultCount?: number;                    // Number of rows returned

  // Common fields
  accessedAt: string;                      // ISO 8601 timestamp
  content: string;                         // Full text content
  contentFormat: 'text' | 'html' | 'json' | 'csv' | 'markdown';
  contentLength: number;                   // Character count
  extractedFacts: ExtractedFact[];         // Key facts from this source

  // Metadata
  reliability: 'high' | 'medium' | 'low' | 'unknown';
  reliabilityReasoning: string;            // Why this reliability rating
  comparedWith: string[];                  // Source IDs compared against
  contradicts: string[];                   // Source IDs that contradict this
  corroborates: string[];                  // Source IDs that agree
  gatheringIteration: number;              // Which iteration found this
  searchQuery?: string;                    // Query that found this source
  relevanceScore: number;                  // 0.0-1.0, how relevant to research goal
}

/**
 * A fact extracted from a source
 */
interface ExtractedFact {
  factID: string;                          // Unique identifier
  factText: string;                        // The actual fact/claim
  factType: 'statistic' | 'quote' | 'claim' | 'date' | 'definition' | 'relationship' | 'other';
  confidence: number;                      // 0.0-1.0, confidence in extraction
  relatedFactIDs: string[];                // Other facts that relate to this one
  supportingEvidence?: string;             // Additional context
  contextSnippet?: string;                 // Surrounding text for context
}

/**
 * A comparison between two sources
 */
interface Comparison {
  comparisonID: string;                    // Unique identifier
  sourceA: string;                         // Source ID
  sourceB: string;                         // Source ID
  comparedAt: string;                      // ISO 8601 timestamp
  comparisonType: 'corroboration' | 'contradiction' | 'complementary' | 'independent';

  // Corroboration details (if applicable)
  corroborationDetails?: {
    sharedFacts: string[];                 // Fact IDs that agree
    strengthLevel: 'strong' | 'moderate' | 'weak';
    explanation: string;                   // How they corroborate
  };

  // Contradiction details (if applicable)
  contradictionDetails?: {
    contradictionID: string;               // Links to ContradictionRecord
    conflictingFactIDs: string[];          // Facts that conflict
    severityLevel: 'major' | 'minor' | 'clarification';
  };

  comparisonNotes: string;                 // General observations
}

/**
 * A detected contradiction requiring resolution
 */
interface ContradictionRecord {
  contradictionID: string;                 // Unique identifier
  description: string;                     // What contradicts
  severity: 'major' | 'minor' | 'clarification';
  sourcesInvolved: string[];               // Source IDs
  conflictingFacts: string[];              // Fact IDs that conflict
  possibleExplanations: string[];          // Hypotheses for the contradiction
  resolution?: string;                     // How it was resolved (if resolved)
  resolutionIteration?: number;            // When it was resolved
  impactOnFindings: string;                // How this affects conclusions
  status: 'open' | 'resolved' | 'acknowledged';
}

/**
 * A single research iteration
 */
interface IterationRecord {
  iterationNumber: number;
  startedAt: string;                       // ISO 8601 timestamp
  completedAt: string;                     // ISO 8601 timestamp
  durationSeconds: number;                 // Calculated duration

  activitiesPerformed: Activity[];         // All activities in this iteration
  learnings: Learning[];                   // What was learned
  sourcesGathered: string[];               // Source IDs gathered this iteration
  comparisonsPerformed: string[];          // Comparison IDs performed
  questionsAnswered: string[];             // Questions resolved
  newQuestionsRaised: string[];            // New questions discovered

  completenessAssessment: CompletenessAssessment;
  nextSteps: string;                       // What to do in next iteration
  summary: string;                         // Iteration summary
}

/**
 * An activity performed during an iteration
 */
interface Activity {
  activityID: string;                      // Unique identifier
  activityType: 'search' | 'storage_search' | 'database_query' | 'comparison' | 'analysis' | 'synthesis';
  description: string;                     // Human-readable description
  tool: string;                            // Action name used
  parameters: Record<string, any>;         // Tool parameters
  startedAt: string;                       // ISO 8601 timestamp
  completedAt: string;                     // ISO 8601 timestamp
  success: boolean;
  resultSummary: string;                   // Brief summary of results
  sourcesCreated?: string[];               // Source IDs created by this activity
  errorMessage?: string;                   // If success=false
}

/**
 * Something learned during research
 */
interface Learning {
  learningID: string;                      // Unique identifier
  learningType: 'fact' | 'pattern' | 'contradiction' | 'gap' | 'validation' | 'insight';
  description: string;                     // What was learned
  confidence: number;                      // 0.0-1.0
  supportingSources: string[];             // Source IDs that support this
  relatedLearnings: string[];              // Learning IDs that relate
  iterationDiscovered: number;             // When this was learned
}

/**
 * Assessment of research completeness
 */
interface CompletenessAssessment {
  isComplete: boolean;                     // Can we stop now?
  completenessScore: number;               // 0.0-1.0
  reasoning: string;                       // Why this score?
  gapsIdentified: string[];                // What's still missing
  confidenceLevel: number;                 // 0.0-1.0, confidence in completeness
  criteriaEvaluated: CompletnessCriteria;  // Detailed criteria scores
}

/**
 * Specific criteria for completeness
 */
interface CompletnessCriteria {
  questionsAnswered: number;               // 0.0-1.0, % of questions answered
  sourceDiversity: number;                 // 0.0-1.0, variety of source types
  sourceQuantity: number;                  // 0.0-1.0, sufficient sources
  contradictionsResolved: number;          // 0.0-1.0, % resolved
  factCorroboration: number;               // 0.0-1.0, facts verified by multiple sources
  confidenceInFindings: number;            // 0.0-1.0, overall confidence
}

/**
 * Final synthesis of research findings
 */
interface ResearchSynthesis {
  executiveSummary: string;                // 2-3 paragraph overview
  findings: Finding[];                     // Key findings
  contradictions: ContradictionSummary[];  // Unresolved contradictions
  confidenceAssessment: string;            // Overall confidence statement
  limitations: string[];                   // Research limitations
  recommendations: string[];               // Suggested actions
  keyTakeaways: string[];                  // Main points (3-5 bullets)
  bibliography: Citation[];                // All sources cited
  generatedAt: string;                     // ISO 8601 timestamp
}

/**
 * A key finding from the research
 */
interface Finding {
  findingID: string;                       // Unique identifier
  title: string;                           // Finding headline
  description: string;                     // Detailed explanation
  category: string;                        // Topic category
  importance: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;                      // 0.0-1.0
  supportingSources: Citation[];           // Sources that support this
  relatedFindings: string[];               // Finding IDs that relate
  contradictoryEvidence?: string;          // If there's conflicting info
}

/**
 * A source citation for bibliography
 */
interface Citation {
  sourceID: string;                        // Reference to SourceRecord
  specificText?: string;                   // Specific quote/text
  relevance: number;                       // 0.0-1.0
  citationFormat?: string;                 // Formatted citation (APA, MLA, etc.)
}

/**
 * Summary of a contradiction for final report
 */
interface ContradictionSummary {
  contradictionID: string;                 // Reference to ContradictionRecord
  description: string;                     // What contradicts
  severity: 'major' | 'minor' | 'clarification';
  sources: string[];                       // Source IDs involved
  possibleExplanations: string[];          // Hypotheses
  resolution?: string;                     // If resolved
  impactOnFindings: string;                // How this affects conclusions
}
```

---

## Example Payload: Quantum Computing Research

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
    "contradictionsFound": 2,
    "completenessScore": 0.85
  },

  "plan": {
    "initialPlan": "Cast wide net: search web for quantum computing news, check industry reports, query database for quantum-related projects, get stock prices for major quantum companies",
    "currentPlan": "Initial plan complete. Focus narrowed to commercialization timeline and key players.",
    "researchQuestions": [
      "Which companies are leading quantum computing commercialization?",
      "What is the timeline for practical quantum computers?",
      "What are current limitations preventing commercialization?"
    ],
    "sourcesIdentified": ["web", "storage", "structured_data"],
    "searchTerms": [
      "quantum computing commercialization 2025",
      "quantum computer companies",
      "quantum computing timeline",
      "IBM quantum Google quantum"
    ],
    "strategicApproach": "Multi-source validation: gather from web, internal reports, and financial data. Cross-reference all major claims.",
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
      "content": "Full article text here... IBM achieved 1000+ qubit quantum processor in Q4 2024...",
      "contentFormat": "html",
      "contentLength": 15420,
      "extractedFacts": [
        {
          "factID": "fact_001_1",
          "factText": "IBM achieved 1000+ qubit quantum processor in Q4 2024",
          "factType": "statistic",
          "confidence": 0.95,
          "relatedFactIDs": ["fact_002_3"],
          "contextSnippet": "...breakthrough came when IBM achieved its 1000+ qubit quantum processor goal in Q4 2024, marking a significant milestone..."
        },
        {
          "factID": "fact_001_2",
          "factText": "Error correction remains primary barrier to commercialization",
          "factType": "claim",
          "confidence": 0.90,
          "relatedFactIDs": ["fact_005_1"],
          "contextSnippet": "Despite hardware advances, error correction remains the primary barrier to commercial quantum computing..."
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
    },
    {
      "sourceID": "src_007",
      "sourceType": "storage",
      "storageProvider": "SharePoint - Research",
      "filePath": "reports/technology/quantum-computing-analysis-2024.pdf",
      "fileType": "application/pdf",
      "title": "Internal Quantum Computing Market Analysis 2024",
      "accessedAt": "2025-10-15T10:06:15Z",
      "content": "Extracted PDF text... Our analysis suggests commercialization timeline is 3-5 years...",
      "contentFormat": "text",
      "contentLength": 8750,
      "extractedFacts": [
        {
          "factID": "fact_007_1",
          "factText": "Estimated 3-5 year timeline for commercial quantum systems",
          "factType": "claim",
          "confidence": 0.85,
          "relatedFactIDs": ["fact_001_2", "fact_008_1"]
        }
      ],
      "reliability": "high",
      "reliabilityReasoning": "Internal research team report with cited sources",
      "comparedWith": ["src_001", "src_002"],
      "contradicts": ["src_008"],
      "corroborates": ["src_001"],
      "gatheringIteration": 2,
      "searchQuery": "quantum computing commercial",
      "relevanceScore": 0.88
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
        "explanation": "Both sources independently report IBM's 1000+ qubit achievement with same timeline and technical details"
      },
      "comparisonNotes": "High agreement on technical milestones. Nature article provides more detail on error rates."
    },
    {
      "comparisonID": "cmp_005",
      "sourceA": "src_007",
      "sourceB": "src_008",
      "comparedAt": "2025-10-15T10:12:00Z",
      "comparisonType": "contradiction",
      "contradictionDetails": {
        "contradictionID": "con_001",
        "conflictingFactIDs": ["fact_007_1", "fact_008_1"],
        "severityLevel": "minor"
      },
      "comparisonNotes": "Discrepancy in commercialization timeline: internal report says 3-5 years, analyst report says 5-10 years. Likely due to different definitions of 'commercial viability'."
    }
  ],

  "contradictions": [
    {
      "contradictionID": "con_001",
      "description": "Conflicting timelines for quantum computing commercialization",
      "severity": "minor",
      "sourcesInvolved": ["src_007", "src_008"],
      "conflictingFacts": ["fact_007_1", "fact_008_1"],
      "possibleExplanations": [
        "Different definitions of 'commercial viability' (prototype vs. mass production)",
        "Internal report more optimistic based on proprietary insights",
        "Analyst report more conservative for investor guidance"
      ],
      "resolution": "Both timelines valid depending on definition. 3-5 years for early commercial prototypes, 5-10 years for widespread commercial availability.",
      "resolutionIteration": 3,
      "impactOnFindings": "Clarifies that commercialization is gradual process, not single event",
      "status": "resolved"
    }
  ],

  "iterations": [
    {
      "iterationNumber": 1,
      "startedAt": "2025-10-15T10:00:00Z",
      "completedAt": "2025-10-15T10:08:00Z",
      "durationSeconds": 480,
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
        },
        {
          "activityID": "act_002",
          "activityType": "search",
          "description": "Get stock prices for major quantum computing companies",
          "tool": "Get Stock Price",
          "parameters": {
            "symbols": ["IBM", "GOOGL", "IONQ"]
          },
          "startedAt": "2025-10-15T10:03:00Z",
          "completedAt": "2025-10-15T10:03:15Z",
          "success": true,
          "resultSummary": "Retrieved current stock prices and market caps",
          "sourcesCreated": ["src_005"]
        }
      ],
      "learnings": [
        {
          "learningID": "learn_001",
          "learningType": "fact",
          "description": "IBM and Google are leading quantum commercialization efforts",
          "confidence": 0.9,
          "supportingSources": ["src_001", "src_002", "src_003"],
          "relatedLearnings": [],
          "iterationDiscovered": 1
        },
        {
          "learningID": "learn_002",
          "learningType": "gap",
          "description": "Need more information on specific commercialization timelines and technical limitations",
          "confidence": 0.95,
          "supportingSources": [],
          "relatedLearnings": [],
          "iterationDiscovered": 1
        }
      ],
      "sourcesGathered": ["src_001", "src_002", "src_003", "src_004", "src_005"],
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
        "confidenceLevel": 0.7,
        "criteriaEvaluated": {
          "questionsAnswered": 0.33,
          "sourceDiversity": 0.6,
          "sourceQuantity": 0.5,
          "contradictionsResolved": 1.0,
          "factCorroboration": 0.4,
          "confidenceInFindings": 0.7
        }
      },
      "nextSteps": "Search for timeline and limitation information; check internal storage for quantum reports; compare all major claims",
      "summary": "Initial broad search identified major players (IBM, Google, IonQ, Rigetti) and recent milestones. Current systems have reached 1000+ qubits but practical commercial applications remain unclear. Need to dig deeper into specific timelines and limitations."
    }
  ],

  "synthesis": {
    "executiveSummary": "Quantum computing commercialization is advancing rapidly with IBM, Google, and IonQ leading the charge. Current systems have achieved significant hardware milestones (1000+ qubits) but practical commercial applications remain 3-10 years away depending on use case. Error correction remains the primary technical barrier. Early commercial focus is on optimization and simulation problems for specialized industries. Investment in the sector is strong with several public companies, though profitability timelines are uncertain.",
    "findings": [
      {
        "findingID": "finding_001",
        "title": "Major Tech Companies Leading Commercialization",
        "description": "IBM, Google, and IonQ are the clear leaders in quantum computing commercialization efforts, with IBM achieving 1000+ qubit processors in 2024 and Google demonstrating quantum advantage in specific tasks.",
        "category": "Market Leaders",
        "importance": "critical",
        "confidence": 0.95,
        "supportingSources": [
          { "sourceID": "src_001", "relevance": 0.95 },
          { "sourceID": "src_002", "relevance": 0.90 },
          { "sourceID": "src_003", "relevance": 0.85 }
        ],
        "relatedFindings": ["finding_002"]
      },
      {
        "findingID": "finding_002",
        "title": "Timeline: 3-10 Years to Commercial Viability",
        "description": "Commercialization timeline varies by definition and use case. Early commercial prototypes expected in 3-5 years for optimization problems. Widespread commercial availability likely 5-10 years. Enterprise applications focusing on drug discovery, financial modeling, and logistics optimization.",
        "category": "Timeline",
        "importance": "high",
        "confidence": 0.80,
        "supportingSources": [
          { "sourceID": "src_007", "relevance": 0.90 },
          { "sourceID": "src_008", "relevance": 0.85 }
        ],
        "relatedFindings": ["finding_003"],
        "contradictoryEvidence": "Two sources provided different timelines (3-5 vs 5-10 years), resolved by clarifying commercial prototype vs. mass production"
      }
    ],
    "contradictions": [
      {
        "contradictionID": "con_001",
        "description": "Conflicting timelines for quantum computing commercialization",
        "severity": "minor",
        "sources": ["src_007", "src_008"],
        "possibleExplanations": [
          "Different definitions of 'commercial viability'",
          "Internal vs. external perspectives on timeline"
        ],
        "resolution": "Both timelines valid depending on definition",
        "impactOnFindings": "Clarifies that commercialization is gradual process"
      }
    ],
    "confidenceAssessment": "High confidence (85%) in major findings based on multiple corroborating sources including peer-reviewed journals, industry analysis, and internal research. Timeline estimates have moderate confidence (75%) due to inherent uncertainty in technology development. All contradictions were resolved satisfactorily.",
    "limitations": [
      "Limited access to proprietary company roadmaps",
      "Rapidly evolving field means information quickly becomes outdated",
      "Technical complexity makes some claims difficult to independently verify",
      "Focus primarily on hardware; quantum software ecosystem less researched"
    ],
    "recommendations": [
      "Monitor IBM and Google announcements for commercial quantum system releases",
      "Consider pilot projects in optimization and simulation domains",
      "Maintain awareness of error correction breakthroughs as key milestone",
      "Evaluate partnerships with quantum computing cloud providers (IBM Quantum, AWS Braket)"
    ],
    "keyTakeaways": [
      "Quantum computing is transitioning from research to early commercialization with 3-10 year timeline",
      "IBM and Google are market leaders; several startups (IonQ, Rigetti) also showing progress",
      "Error correction remains the critical technical barrier to overcome",
      "Early commercial applications focus on optimization, simulation, and cryptography",
      "Significant investment flowing into sector despite uncertain profitability timeline"
    ],
    "bibliography": [
      {
        "sourceID": "src_001",
        "citationFormat": "Nature Journal. (2025, January 15). Quantum Computing: State of the Industry 2025. Nature. https://www.nature.com/articles/quantum-2025",
        "relevance": 0.92
      },
      {
        "sourceID": "src_007",
        "citationFormat": "Internal Research Team. (2024). Internal Quantum Computing Market Analysis 2024. SharePoint Research Repository.",
        "relevance": 0.88
      }
    ],
    "generatedAt": "2025-10-15T10:15:23Z"
  }
}
```

---

## Payload Management Strategy

### PayloadDownstreamPaths
The Research Agent should configure these paths to pass relevant data to sub-agents:
- `sources` → For Database Research Agent to understand context
- `plan.researchQuestions` → For sub-agents to focus efforts
- `metadata.researchGoal` → For context awareness

### PayloadUpstreamPaths
Sub-agents should return:
- New `SourceRecord` objects
- `Activity` records of their actions
- `Learning` objects from their analysis

### Size Management
To keep payload manageable:
- Limit `content` field to 10,000 characters per source
- Store full content in separate storage if needed
- Reference via `sourceID` and retrieve on demand
- Archive old iterations after synthesis complete

---

## Key Design Decisions

1. **Source-Centric**: Everything ties back to sources for full traceability
2. **Iteration Tracking**: Complete audit trail of research process
3. **Comparison-Driven**: Explicit comparison records enable validation
4. **Contradiction Management**: First-class handling of conflicting information
5. **Completeness Assessment**: Systematic evaluation at each iteration
6. **Flexible Source Types**: Supports web, storage, database, structured data
7. **Learning Accumulation**: Knowledge builds across iterations
8. **Rich Metadata**: Timestamps, IDs, and relationships throughout

This structure enables the Research Agent to:
- ✅ Conduct systematic, iterative research
- ✅ Track all sources and validate information
- ✅ Detect and resolve contradictions
- ✅ Build confidence through corroboration
- ✅ Determine when research is complete
- ✅ Generate comprehensive final reports
