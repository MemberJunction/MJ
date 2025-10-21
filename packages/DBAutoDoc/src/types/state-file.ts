/**
 * State file type definitions for SQL Server Documentation Generator
 * This file is persisted as db-doc-state.json and tracks all documentation state
 */

/**
 * AI-generated documentation with metadata
 */
export interface AIGenerated {
  description: string;
  confidence: number;
  generatedAt: string;
  model: string;
  tokensUsed?: number;
}

/**
 * Column state in the documentation
 */
export interface ColumnState {
  // User-provided
  userNotes?: string;
  userDescription?: string;
  userApproved?: boolean;

  // AI-generated
  aiGenerated?: AIGenerated & {
    purpose?: string;
    validValues?: string;
    usageNotes?: string;
  };

  // Final merged description (used for SQL export)
  finalDescription?: string;

  // Metadata
  lastModified?: string;
}

/**
 * Table state in the documentation
 */
export interface TableState {
  // User-provided
  userNotes?: string;
  userDescription?: string;
  userApproved?: boolean;
  userBusinessDomain?: string;

  // AI-generated
  aiGenerated?: AIGenerated & {
    purpose?: string;
    usageNotes?: string;
    businessDomain?: string;
    relationships?: Array<{
      type: 'parent' | 'child';
      table: string;
      description: string;
    }>;
  };

  // Final merged description
  finalDescription?: string;

  // Columns
  columns: Record<string, ColumnState>;

  // Metadata
  lastModified?: string;
  lastAnalyzed?: string;
}

/**
 * Schema state in the documentation
 */
export interface SchemaState {
  description?: string;
  businessDomain?: string;
  userNotes?: string;

  // Tables in this schema
  tables: Record<string, TableState>;
}

/**
 * Seed context provided by user
 */
export interface SeedContext {
  overallPurpose?: string;
  businessDomains?: string[];
  customInstructions?: string;
  industryContext?: string;
}

/**
 * Run history entry
 */
export interface RunHistoryEntry {
  timestamp: string;
  phase: 'analyze' | 'review' | 'export';
  tablesProcessed?: number;
  schemasProcessed?: number;
  tokensUsed?: number;
  cost?: number;
  duration?: number; // milliseconds
  errors?: string[];
}

/**
 * Database connection info (no credentials - those go in .env)
 */
export interface DatabaseInfo {
  server: string;
  database: string;
  lastConnected?: string;
}

/**
 * Complete state file structure
 */
export interface StateFile {
  version: string;
  database: DatabaseInfo;
  seedContext?: SeedContext;
  schemas: Record<string, SchemaState>;
  runHistory: RunHistoryEntry[];

  // Metadata
  createdAt: string;
  lastModified: string;
}

/**
 * Default empty state file
 */
export function createEmptyStateFile(server: string, database: string): StateFile {
  const now = new Date().toISOString();

  return {
    version: '1.0',
    database: {
      server,
      database,
      lastConnected: now,
    },
    schemas: {},
    runHistory: [],
    createdAt: now,
    lastModified: now,
  };
}

/**
 * Helper to get or create schema state
 */
export function getOrCreateSchema(state: StateFile, schemaName: string): SchemaState {
  if (!state.schemas[schemaName]) {
    state.schemas[schemaName] = {
      tables: {},
    };
  }
  return state.schemas[schemaName];
}

/**
 * Helper to get or create table state
 */
export function getOrCreateTable(schema: SchemaState, tableName: string): TableState {
  if (!schema.tables[tableName]) {
    schema.tables[tableName] = {
      columns: {},
    };
  }
  return schema.tables[tableName];
}

/**
 * Helper to get or create column state
 */
export function getOrCreateColumn(table: TableState, columnName: string): ColumnState {
  if (!table.columns[columnName]) {
    table.columns[columnName] = {};
  }
  return table.columns[columnName];
}

/**
 * Merge AI-generated description with user input to create final description
 */
export function mergeFinalDescription(
  userDescription?: string,
  userNotes?: string,
  aiDescription?: string
): string | undefined {
  // Priority: user description > AI description
  if (userDescription) {
    return userDescription;
  }

  if (aiDescription) {
    // If user notes exist, prepend them
    if (userNotes) {
      return `${userNotes}. ${aiDescription}`;
    }
    return aiDescription;
  }

  return undefined;
}
