/**
 * Validation types and interfaces for MetadataSync
 */

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    summary: ValidationSummary;
}

export interface ValidationError {
    type: 'entity' | 'field' | 'value' | 'reference' | 'dependency' | 'circular' | 'validation';
    severity: 'error';
    entity?: string;
    field?: string;
    file: string;
    message: string;
    suggestion?: string;
    details?: any;
}

export interface ValidationWarning {
    type: 'nesting' | 'naming' | 'bestpractice' | 'performance' | 'validation';
    severity: 'warning';
    entity?: string;
    field?: string;
    file: string;
    message: string;
    suggestion?: string;
    details?: any;
}

export interface ValidationSummary {
    totalFiles: number;
    totalEntities: number;
    totalErrors: number;
    totalWarnings: number;
    fileResults: Map<string, FileValidationResult>;
}

/**
 * Custom error class for validation errors
 */
export class ValidationErrorClass extends Error {
    public readonly type: ValidationError['type'];
    public readonly severity: ValidationError['severity'];
    public readonly file: string;
    public readonly entity?: string;
    public readonly field?: string;
    public readonly suggestion?: string;
    public readonly line?: number;
    public readonly column?: number;
    
    constructor(error: ValidationError) {
        super(error.message);
        this.name = 'ValidationError';
        this.type = error.type;
        this.severity = error.severity;
        this.file = error.file;
        this.entity = error.entity;
        this.field = error.field;
        this.suggestion = error.suggestion;
        
        // Try to extract line/column from error message if present
        const lineMatch = error.message.match(/line (\d+)/i);
        const colMatch = error.message.match(/column (\d+)/i);
        this.line = lineMatch ? parseInt(lineMatch[1]) : undefined;
        this.column = colMatch ? parseInt(colMatch[1]) : undefined;
        
        // Ensure proper prototype chain
        Object.setPrototypeOf(this, ValidationErrorClass.prototype);
    }
    
    /**
     * Get formatted error message with location info
     */
    getFormattedMessage(): string {
        let msg = this.message;
        if (this.line) {
            msg += ` (line ${this.line}`;
            if (this.column) {
                msg += `, column ${this.column}`;
            }
            msg += ')';
        }
        return msg;
    }
}

/**
 * Custom warning class for validation warnings
 */
export class ValidationWarningClass extends Error {
    public readonly type: ValidationWarning['type'];
    public readonly severity: ValidationWarning['severity'];
    public readonly file: string;
    public readonly entity?: string;
    public readonly field?: string;
    public readonly suggestion?: string;
    public readonly line?: number;
    public readonly column?: number;
    
    constructor(warning: ValidationWarning) {
        super(warning.message);
        this.name = 'ValidationWarning';
        this.type = warning.type;
        this.severity = warning.severity;
        this.file = warning.file;
        this.entity = warning.entity;
        this.field = warning.field;
        this.suggestion = warning.suggestion;
        
        // Try to extract line/column from warning message if present
        const lineMatch = warning.message.match(/line (\d+)/i);
        const colMatch = warning.message.match(/column (\d+)/i);
        this.line = lineMatch ? parseInt(lineMatch[1]) : undefined;
        this.column = colMatch ? parseInt(colMatch[1]) : undefined;
        
        // Ensure proper prototype chain
        Object.setPrototypeOf(this, ValidationWarningClass.prototype);
    }
    
    /**
     * Get formatted warning message with location info
     */
    getFormattedMessage(): string {
        let msg = this.message;
        if (this.line) {
            msg += ` (line ${this.line}`;
            if (this.column) {
                msg += `, column ${this.column}`;
            }
            msg += ')';
        }
        return msg;
    }
}

export interface FileValidationResult {
    file: string;
    entityCount: number;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

export interface EntityDependency {
    entityName: string;
    dependsOn: Set<string>;
    file: string;
}

export interface ValidationOptions {
    verbose: boolean;
    outputFormat: 'human' | 'json';
    maxNestingDepth: number;
    checkBestPractices: boolean;
}

export type ReferenceType = '@file:' | '@lookup:' | '@template:' | '@parent:' | '@root:' | '@env:';

export interface ParsedReference {
    type: ReferenceType;
    value: string;
    entity?: string;
    field?: string;
    createIfMissing?: boolean;
    additionalFields?: Record<string, any>;
}