/**
 * Types for the Index Advisor plugin's options and its section of the state file.
 */

import type { AutoDocIndex } from '../../types/driver.js';

/** Where a proposal came from. */
export type IndexProposalSource = 'FKCoverage' | 'SoftPrimaryKey' | 'LLM';

/** A proposed new index. */
export interface IndexProposal {
  SchemaName: string;
  TableName: string;
  /** Key columns, in index order. */
  Columns: string[];
  /** Non-key covering columns (SQL Server / PostgreSQL INCLUDE). */
  IncludeColumns: string[];
  Source: IndexProposalSource;
  Reason: string;
  /** 1 (low) – 100 (high); larger tables score higher. */
  Priority: number;
  Evidence: IndexProposalEvidence;
}

export interface IndexProposalEvidence {
  RowCount: number;
  /** Distinct values of the leading column, when column statistics are available. */
  LeadingColumnDistinctCount?: number;
  /** `schema.table.column` the foreign key points at (FK coverage proposals). */
  References?: string;
  /** Confidence of the discovered key that motivated the proposal (0–100). */
  KeyConfidence?: number;
  /** Whether the motivating key is declared in the database or was discovered. */
  KeyOrigin?: 'declared' | 'discovered';
}

/** An existing index whose job another index already does. Reported only; never dropped. */
export interface RedundantIndex {
  SchemaName: string;
  TableName: string;
  IndexName: string;
  CoveredBy: string;
  Reason: string;
}

/** Index Advisor options from the config file (`plugins[].Options`). */
export interface IndexAdvisorOptions {
  /** Tables with fewer rows get no proposals. Default 1000. */
  MinRowCount: number;
  /** Also index discovered (not just declared) foreign keys. Default true. */
  IncludeDiscoveredFKs: boolean;
  /** Minimum confidence for a discovered key to be used. Default 90. */
  KeyMinConfidence: number;
  /** Run the LLM review layer. Default true. */
  LLMReview: boolean;
  /** Most tables the LLM review looks at (largest first). Default 40. */
  MaxLLMTables: number;
  /** PostgreSQL: emit CREATE INDEX CONCURRENTLY (no write lock while building; runs outside a transaction). Default true. */
  Concurrently: boolean;
}

/** The plugin's section of the state file (`state.plugins.IndexAdvisor.Data`). */
export interface IndexAdvisorData {
  AnalyzedAt: string;
  Options: IndexAdvisorOptions;
  Existing: AutoDocIndex[];
  Proposed: IndexProposal[];
  Redundant: RedundantIndex[];
  /** Schemas whose existing indexes could not be read (proposals for them are skipped). */
  SkippedSchemas: { SchemaName: string; Error: string }[];
  /** What the LLM review did. Absent when the review was off. */
  LLMReview?: IndexLLMReviewSummary;
}

/** Outcome of the LLM review layer. */
export interface IndexLLMReviewSummary {
  Model: string;
  TablesReviewed: number;
  TokensUsed: number;
  /** Rule-based proposals the review removed, with its reason. */
  Dropped: { Proposal: IndexProposal; Reason: string }[];
  /** LLM suggestions that failed validation and were not applied. */
  Rejected: { TableName: string; Columns: string[]; Why: string }[];
  /** Tables whose review call failed; their rule-based proposals were kept unchanged. */
  Errors: { TableName: string; Error: string }[];
}

/** One proposal decision the LLM returns. `Proposal` is the 1-based number shown in the prompt. */
export interface IndexReviewDecision {
  Proposal: number;
  Action: 'keep' | 'drop' | 'modify';
  Columns?: string[];
  IncludeColumns?: string[];
  Reason: string;
}

/** A new index the LLM suggests. */
export interface IndexReviewAddition {
  Columns: string[];
  IncludeColumns?: string[];
  Reason: string;
}

/** The LLM's full response for one table. */
export interface IndexReviewResponse {
  Decisions: IndexReviewDecision[];
  Additions: IndexReviewAddition[];
}
