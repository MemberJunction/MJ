import fs from 'fs';
import path from 'path';
import { attemptDeleteFile } from './util';
import { dbType } from '../Config/config';

/**
 * Utility class for managing temporary batch SQL files during CodeGen execution.
 * These files contain SQL statements in proper dependency order (matching the CodeGen run log)
 * and are used for actual execution, while _all_entities.sql remains alphabetical for clean git diffs.
 */
export class TempBatchFile {
    private static tempFilePaths: Map<string, string> = new Map(); // schema -> file path
    private static isInitialized: boolean = false;

    /**
     * Initialize temp batch files for each schema in this CodeGen run
     */
    public static initialize(outputDirectory: string, schemas: string[]): void {
        this.cleanup(); // Clean up any previous files

        const timestamp = Date.now();

        for (const schema of schemas) {
            const filename = `_temp_batch_execution_${timestamp}_${schema}.sql`;
            const schemaDir = path.join(outputDirectory, schema);
            const filePath = path.join(schemaDir, filename);

            // Ensure directory exists
            if (!fs.existsSync(schemaDir)) {
                fs.mkdirSync(schemaDir, { recursive: true });
            }

            // Initialize empty file
            fs.writeFileSync(filePath, '');
            this.tempFilePaths.set(schema, filePath);
        }

        this.isInitialized = true;
    }

    /**
     * Append SQL to the temp batch file for the given schema
     */
    public static appendToTempBatchFile(sql: string, schema: string): void {
        if (!this.isInitialized) return;

        const filePath = this.tempFilePaths.get(schema);
        if (!filePath) return;

        // SQL Server uses GO as a batch separator; PostgreSQL doesn't need it
        const separator = dbType() === 'postgresql' ? '\n\n' : '\nGO\n\n';
        fs.appendFileSync(filePath, sql + separator);
    }

    /**
     * Get all temp file paths for execution
     */
    public static getTempFilePaths(): string[] {
        return Array.from(this.tempFilePaths.values());
    }

    /**
     * Get temp file path for a specific schema
     */
    public static getTempFilePathForSchema(schema: string): string | undefined {
        return this.tempFilePaths.get(schema);
    }

    /**
     * Check if temp files have been initialized and have content
     */
    public static hasContent(): boolean {
        if (!this.isInitialized || this.tempFilePaths.size === 0) return false;

        // Check if at least one file has content
        for (const filePath of this.tempFilePaths.values()) {
            if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * Clean up temp files and reset state
     */
    public static cleanup(): void {
        for (const filePath of this.tempFilePaths.values()) {
            if (fs.existsSync(filePath)) {
                attemptDeleteFile(filePath, 3, 1000);
            }
        }

        this.tempFilePaths.clear();
        this.isInitialized = false;
    }
}
