import * as fs from 'fs/promises';
import * as path from 'path';
import {
  StateFile,
  createEmptyStateFile,
  SchemaState,
  TableState,
  ColumnState,
  getOrCreateSchema,
  getOrCreateTable,
  getOrCreateColumn,
  RunHistoryEntry,
  mergeFinalDescription,
} from '../types/state-file';

export interface StateManagerOptions {
  stateFilePath?: string;
}

/**
 * State file manager - handles read/write/merge of db-doc-state.json
 */
export class StateManager {
  private stateFilePath: string;
  private state?: StateFile;

  constructor(options: StateManagerOptions = {}) {
    this.stateFilePath = options.stateFilePath || path.join(process.cwd(), 'db-doc-state.json');
  }

  /**
   * Load state file (or create if doesn't exist)
   */
  async load(server?: string, database?: string): Promise<StateFile> {
    try {
      const content = await fs.readFile(this.stateFilePath, 'utf-8');
      this.state = JSON.parse(content);
      return this.state!;
    } catch (error) {
      // File doesn't exist, create new
      if (server && database) {
        this.state = createEmptyStateFile(server, database);
        await this.save();
        return this.state;
      }
      throw new Error(`State file not found at ${this.stateFilePath} and no server/database provided`);
    }
  }

  /**
   * Save state file
   */
  async save(): Promise<void> {
    if (!this.state) {
      throw new Error('No state to save');
    }

    this.state.lastModified = new Date().toISOString();
    const content = JSON.stringify(this.state, null, 2);
    await fs.writeFile(this.stateFilePath, content, 'utf-8');
  }

  /**
   * Get current state
   */
  getState(): StateFile {
    if (!this.state) {
      throw new Error('State not loaded');
    }
    return this.state;
  }

  /**
   * Update table with AI-generated documentation
   */
  updateTableAI(
    schemaName: string,
    tableName: string,
    aiDoc: {
      description: string;
      purpose?: string;
      usageNotes?: string;
      businessDomain?: string;
      confidence: number;
      model: string;
      tokensUsed?: number;
      relationships?: Array<{
        type: 'parent' | 'child';
        table: string;
        description: string;
      }>;
    }
  ): void {
    if (!this.state) throw new Error('State not loaded');

    const schema = getOrCreateSchema(this.state, schemaName);
    const table = getOrCreateTable(schema, tableName);

    table.aiGenerated = {
      description: aiDoc.description,
      purpose: aiDoc.purpose,
      usageNotes: aiDoc.usageNotes,
      businessDomain: aiDoc.businessDomain,
      confidence: aiDoc.confidence,
      generatedAt: new Date().toISOString(),
      model: aiDoc.model,
      tokensUsed: aiDoc.tokensUsed,
      relationships: aiDoc.relationships,
    };

    table.lastModified = new Date().toISOString();

    // Update final description
    table.finalDescription = mergeFinalDescription(
      table.userDescription,
      table.userNotes,
      table.aiGenerated.description
    );
  }

  /**
   * Update column with AI-generated documentation
   */
  updateColumnAI(
    schemaName: string,
    tableName: string,
    columnName: string,
    aiDoc: {
      description: string;
      purpose?: string;
      validValues?: string;
      usageNotes?: string;
      confidence: number;
      model: string;
    }
  ): void {
    if (!this.state) throw new Error('State not loaded');

    const schema = getOrCreateSchema(this.state, schemaName);
    const table = getOrCreateTable(schema, tableName);
    const column = getOrCreateColumn(table, columnName);

    column.aiGenerated = {
      description: aiDoc.description,
      purpose: aiDoc.purpose,
      validValues: aiDoc.validValues,
      usageNotes: aiDoc.usageNotes,
      confidence: aiDoc.confidence,
      generatedAt: new Date().toISOString(),
      model: aiDoc.model,
    };

    column.lastModified = new Date().toISOString();

    // Update final description
    column.finalDescription = mergeFinalDescription(
      column.userDescription,
      column.userNotes,
      column.aiGenerated.description
    );
  }

  /**
   * Mark table as user approved
   */
  approveTable(schemaName: string, tableName: string): void {
    if (!this.state) throw new Error('State not loaded');

    const schema = getOrCreateSchema(this.state, schemaName);
    const table = getOrCreateTable(schema, tableName);

    table.userApproved = true;
    table.lastModified = new Date().toISOString();
  }

  /**
   * Mark column as user approved
   */
  approveColumn(schemaName: string, tableName: string, columnName: string): void {
    if (!this.state) throw new Error('State not loaded');

    const schema = getOrCreateSchema(this.state, schemaName);
    const table = getOrCreateTable(schema, tableName);
    const column = getOrCreateColumn(table, columnName);

    column.userApproved = true;
    column.lastModified = new Date().toISOString();
  }

  /**
   * Add user notes to table
   */
  addTableNotes(schemaName: string, tableName: string, notes: string): void {
    if (!this.state) throw new Error('State not loaded');

    const schema = getOrCreateSchema(this.state, schemaName);
    const table = getOrCreateTable(schema, tableName);

    table.userNotes = notes;
    table.lastModified = new Date().toISOString();

    // Update final description
    table.finalDescription = mergeFinalDescription(
      table.userDescription,
      table.userNotes,
      table.aiGenerated?.description
    );
  }

  /**
   * Add user notes to column
   */
  addColumnNotes(schemaName: string, tableName: string, columnName: string, notes: string): void {
    if (!this.state) throw new Error('State not loaded');

    const schema = getOrCreateSchema(this.state, schemaName);
    const table = getOrCreateTable(schema, tableName);
    const column = getOrCreateColumn(table, columnName);

    column.userNotes = notes;
    column.lastModified = new Date().toISOString();

    // Update final description
    column.finalDescription = mergeFinalDescription(
      column.userDescription,
      column.userNotes,
      column.aiGenerated?.description
    );
  }

  /**
   * Add run history entry
   */
  addRunHistory(entry: RunHistoryEntry): void {
    if (!this.state) throw new Error('State not loaded');
    this.state.runHistory.push(entry);
  }

  /**
   * Get tables that need processing (no AI generation yet)
   */
  getTablesNeedingProcessing(schemaName?: string): Array<{ schema: string; table: string }> {
    if (!this.state) throw new Error('State not loaded');

    const tables: Array<{ schema: string; table: string }> = [];

    for (const [schema, schemaState] of Object.entries(this.state.schemas)) {
      if (schemaName && schema !== schemaName) continue;

      for (const [table, tableState] of Object.entries(schemaState.tables)) {
        if (!tableState.aiGenerated) {
          tables.push({ schema, table });
        }
      }
    }

    return tables;
  }

  /**
   * Get unapproved tables
   */
  getUnapprovedTables(schemaName?: string): Array<{ schema: string; table: string }> {
    if (!this.state) throw new Error('State not loaded');

    const tables: Array<{ schema: string; table: string }> = [];

    for (const [schema, schemaState] of Object.entries(this.state.schemas)) {
      if (schemaName && schema !== schemaName) continue;

      for (const [table, tableState] of Object.entries(schemaState.tables)) {
        if (tableState.aiGenerated && !tableState.userApproved) {
          tables.push({ schema, table });
        }
      }
    }

    return tables;
  }

  /**
   * Check if state file exists
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.stateFilePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reset state file
   */
  async reset(server: string, database: string): Promise<void> {
    this.state = createEmptyStateFile(server, database);
    await this.save();
  }
}
