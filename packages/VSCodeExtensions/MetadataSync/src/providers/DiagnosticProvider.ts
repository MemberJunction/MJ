import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MetadataProvider } from './MetadataProvider';
import { EntityFieldInfo } from '@memberjunction/core';

interface MJSyncConfig {
    entity: string;
    files?: string | string[];
    relatedEntities?: Array<{
        entity: string;
        relationshipType: 'single' | 'collection';
        lookupField?: string;
        property?: string;
    }>;
}

export class DiagnosticProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor(
        private metadataProvider: MetadataProvider
    ) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('mj-metadata');
    }

    async updateDiagnostics(document: vscode.TextDocument): Promise<void> {
        // Only validate JSON files
        if (document.languageId !== 'json') {
            return;
        }

        // Find the entity context
        const entityName = await this.getEntityFromContext(document);
        if (!entityName) {
            this.diagnosticCollection.delete(document.uri);
            return;
        }

        const diagnostics: vscode.Diagnostic[] = [];

        try {
            const documentText = document.getText();
            const jsonData = JSON.parse(documentText);

            // Get entity metadata
            const entity = await this.metadataProvider.getEntityMetadata(entityName);
            if (!entity) {
                return;
            }

            // Create a map of valid field names for quick lookup
            const validFields = new Map<string, EntityFieldInfo>();
            entity.Fields.forEach(field => {
                validFields.set(field.Name, field);
            });

            // Check if this is a MJ metadata file structure
            if (this.isMJMetadataStructure(jsonData)) {
                // Validate MJ metadata structure
                await this.validateMJMetadata(
                    document,
                    jsonData,
                    validFields,
                    diagnostics,
                    documentText
                );
            } else {
                // Validate as a simple entity object
                await this.validateObject(
                    document, 
                    jsonData, 
                    validFields, 
                    diagnostics, 
                    documentText,
                    0 // starting offset
                );
            }

        } catch (error) {
            // JSON parse error - VSCode already handles this
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    private isMJMetadataStructure(obj: any): boolean {
        // Check if this looks like a MJ metadata structure
        return obj && typeof obj === 'object' && 
               ('fields' in obj || 'relatedEntities' in obj || 'primaryKey' in obj || 'sync' in obj);
    }

    private async validateMJMetadata(
        document: vscode.TextDocument,
        jsonData: any,
        validFields: Map<string, EntityFieldInfo>,
        diagnostics: vscode.Diagnostic[],
        documentText: string
    ): Promise<void> {
        // Valid top-level keys for MJ metadata files
        const validTopLevelKeys = ['fields', 'relatedEntities', 'primaryKey', 'sync'];
        
        // Validate top-level structure
        for (const key of Object.keys(jsonData)) {
            if (!validTopLevelKeys.includes(key)) {
                const propertyMatch = this.findPropertyPosition(documentText, key, 0);
                if (propertyMatch) {
                    const keyStart = document.positionAt(propertyMatch.keyStart);
                    const keyEnd = document.positionAt(propertyMatch.keyEnd);
                    const keyRange = new vscode.Range(keyStart, keyEnd);
                    
                    const diagnostic = new vscode.Diagnostic(
                        keyRange,
                        `Unknown metadata property "${key}". Valid properties are: ${validTopLevelKeys.join(', ')}`,
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostic.code = 'unknown-metadata-property';
                    diagnostics.push(diagnostic);
                }
            }
        }

        // Validate fields array
        if (jsonData.fields && Array.isArray(jsonData.fields)) {
            const fieldsMatch = this.findPropertyPosition(documentText, 'fields', 0);
            if (fieldsMatch) {
                // Find the start of the array content
                const arrayStartOffset = documentText.indexOf('[', fieldsMatch.valueStart);
                if (arrayStartOffset !== -1) {
                    for (let i = 0; i < jsonData.fields.length; i++) {
                        const fieldObj = jsonData.fields[i];
                        if (typeof fieldObj === 'object' && fieldObj !== null) {
                            // Find this field object in the document
                            const fieldOffset = this.findObjectOffset(documentText, fieldObj, arrayStartOffset);
                            if (fieldOffset !== -1) {
                                await this.validateObject(
                                    document,
                                    fieldObj,
                                    validFields,
                                    diagnostics,
                                    documentText,
                                    fieldOffset
                                );
                            }
                        }
                    }
                }
            }
        }

        // Validate relatedEntities if present
        if (jsonData.relatedEntities && typeof jsonData.relatedEntities === 'object') {
            const mjSyncConfig = await this.getMJSyncConfig(document);
            if (mjSyncConfig && mjSyncConfig.relatedEntities) {
                for (const relatedEntityConfig of mjSyncConfig.relatedEntities) {
                    const relatedEntityData = jsonData.relatedEntities[relatedEntityConfig.property || relatedEntityConfig.entity];
                    if (relatedEntityData) {
                        // Get metadata for the related entity
                        const relatedEntity = await this.metadataProvider.getEntityMetadata(relatedEntityConfig.entity);
                        if (relatedEntity) {
                            const relatedValidFields = new Map<string, EntityFieldInfo>();
                            relatedEntity.Fields.forEach(field => {
                                relatedValidFields.set(field.Name, field);
                            });

                            // Find the offset for this related entity section
                            const propertyMatch = this.findPropertyPosition(
                                documentText, 
                                relatedEntityConfig.property || relatedEntityConfig.entity, 
                                0
                            );
                            
                            if (propertyMatch) {
                                // Validate the related entity data
                                if (Array.isArray(relatedEntityData)) {
                                    // Handle collection of related entities
                                    for (const item of relatedEntityData) {
                                        const itemOffset = this.findObjectOffset(documentText, item, propertyMatch.valueStart);
                                        if (itemOffset !== -1) {
                                            await this.validateObject(
                                                document,
                                                item,
                                                relatedValidFields,
                                                diagnostics,
                                                documentText,
                                                itemOffset
                                            );
                                        }
                                    }
                                } else if (typeof relatedEntityData === 'object') {
                                    // Handle single related entity
                                    await this.validateObject(
                                        document,
                                        relatedEntityData,
                                        relatedValidFields,
                                        diagnostics,
                                        documentText,
                                        propertyMatch.valueStart
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }

    }

    private async validateObject(
        document: vscode.TextDocument,
        obj: any,
        validFields: Map<string, EntityFieldInfo>,
        diagnostics: vscode.Diagnostic[],
        documentText: string,
        startOffset: number
    ): Promise<void> {
        if (typeof obj !== 'object' || obj === null) {
            return;
        }

        if (Array.isArray(obj)) {
            // Handle arrays
            for (let i = 0; i < obj.length; i++) {
                const item = obj[i];
                if (typeof item === 'object' && item !== null) {
                    // Find the offset of this array item
                    const itemOffset = this.findObjectOffset(documentText, item, startOffset);
                    if (itemOffset !== -1) {
                        await this.validateObject(document, item, validFields, diagnostics, documentText, itemOffset);
                    }
                }
            }
            return;
        }

        // Validate object properties
        for (const [key, value] of Object.entries(obj)) {
            // Find the position of this property in the document
            const propertyMatch = this.findPropertyPosition(documentText, key, startOffset);
            if (!propertyMatch) {
                continue;
            }

            const keyStart = document.positionAt(propertyMatch.keyStart);
            const keyEnd = document.positionAt(propertyMatch.keyEnd);
            const keyRange = new vscode.Range(keyStart, keyEnd);

            // Check if the field exists in the entity
            const fieldInfo = validFields.get(key);
            if (!fieldInfo) {
                // Invalid field name
                const diagnostic = new vscode.Diagnostic(
                    keyRange,
                    `Unknown field "${key}". This field does not exist in the entity schema.`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.code = 'unknown-field';
                diagnostics.push(diagnostic);
                continue;
            }

            // Validate the field value
            if (value !== null && value !== undefined) {
                await this.validateFieldValue(
                    document,
                    fieldInfo,
                    value,
                    documentText,
                    propertyMatch.valueStart,
                    propertyMatch.valueEnd,
                    diagnostics
                );
            } else if (!fieldInfo.AllowsNull) {
                // Null value for required field
                const valueStart = document.positionAt(propertyMatch.valueStart);
                const valueEnd = document.positionAt(propertyMatch.valueEnd);
                const valueRange = new vscode.Range(valueStart, valueEnd);

                const diagnostic = new vscode.Diagnostic(
                    valueRange,
                    `Field "${key}" is required and cannot be null.`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.code = 'required-field';
                diagnostics.push(diagnostic);
            }
        }
    }

    private async validateFieldValue(
        document: vscode.TextDocument,
        field: EntityFieldInfo,
        value: any,
        documentText: string,
        valueStart: number,
        valueEnd: number,
        diagnostics: vscode.Diagnostic[]
    ): Promise<void> {
        const start = document.positionAt(valueStart);
        const end = document.positionAt(valueEnd);
        const range = new vscode.Range(start, end);

        // Check for possible values
        const possibleValues = this.metadataProvider.getPossibleValues(
            { Fields: [field] } as any, 
            field
        );

        if (possibleValues && possibleValues.length > 0) {
            // Field has constrained values
            if (typeof value === 'string' && !possibleValues.includes(value)) {
                const diagnostic = new vscode.Diagnostic(
                    range,
                    `Invalid value "${value}" for field "${field.Name}". Allowed values: ${possibleValues.join(', ')}`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.code = 'invalid-value';
                diagnostics.push(diagnostic);
            }
        }

        // Type validation
        const typeError = this.validateType(field, value);
        if (typeError) {
            const diagnostic = new vscode.Diagnostic(
                range,
                typeError,
                vscode.DiagnosticSeverity.Error
            );
            diagnostic.code = 'type-mismatch';
            diagnostics.push(diagnostic);
        }

        // Length validation for strings
        if (typeof value === 'string' && field.MaxLength && value.length > field.MaxLength) {
            const diagnostic = new vscode.Diagnostic(
                range,
                `Value exceeds maximum length of ${field.MaxLength} characters (current: ${value.length}).`,
                vscode.DiagnosticSeverity.Warning
            );
            diagnostic.code = 'max-length';
            diagnostics.push(diagnostic);
        }
    }

    private validateType(field: EntityFieldInfo, value: any): string | null {
        const type = field.Type.toLowerCase();

        switch (type) {
            case 'bit':
                if (typeof value !== 'boolean') {
                    return `Field "${field.Name}" expects a boolean value (true/false).`;
                }
                break;
            
            case 'int':
            case 'bigint':
            case 'decimal':
            case 'float':
                if (typeof value !== 'number') {
                    return `Field "${field.Name}" expects a numeric value.`;
                }
                break;
            
            case 'nvarchar':
            case 'varchar':
            case 'char':
            case 'text':
            case 'uniqueidentifier':
            case 'datetime':
            case 'date':
                if (typeof value !== 'string') {
                    return `Field "${field.Name}" expects a string value.`;
                }
                break;
        }

        return null;
    }

    private findPropertyPosition(
        text: string, 
        propertyName: string, 
        startOffset: number
    ): { keyStart: number; keyEnd: number; valueStart: number; valueEnd: number } | null {
        // Find the property key in quotes
        const keyPattern = new RegExp(`"${propertyName}"\\s*:\\s*`, 'g');
        keyPattern.lastIndex = startOffset;
        
        const match = keyPattern.exec(text);
        if (!match) {
            return null;
        }

        const keyStart = match.index + 1; // Skip opening quote
        const keyEnd = keyStart + propertyName.length;
        const colonIndex = match.index + match[0].length;

        // Find the value after the colon
        let valueStart = colonIndex;
        let valueEnd = colonIndex;
        let depth = 0;
        let inString = false;
        let escapeNext = false;

        for (let i = colonIndex; i < text.length; i++) {
            const char = text[i];

            if (!inString && /\s/.test(char)) {
                if (valueStart === colonIndex) {
                    continue; // Skip leading whitespace
                }
            } else if (valueStart === colonIndex) {
                valueStart = i;
            }

            if (escapeNext) {
                escapeNext = false;
                continue;
            }

            if (char === '\\') {
                escapeNext = true;
                continue;
            }

            if (char === '"' && depth === 0) {
                inString = !inString;
            }

            if (!inString) {
                if (char === '{' || char === '[') {
                    depth++;
                } else if (char === '}' || char === ']') {
                    depth--;
                } else if (depth === 0 && (char === ',' || char === '}')) {
                    valueEnd = i;
                    break;
                }
            }
        }

        if (valueEnd === colonIndex) {
            valueEnd = text.length;
        }

        return { keyStart, keyEnd, valueStart, valueEnd };
    }

    private findObjectOffset(text: string, obj: any, startOffset: number): number {
        // Simple heuristic: find the first property of the object
        const firstKey = Object.keys(obj)[0];
        if (!firstKey) {
            return -1;
        }

        const keyPattern = new RegExp(`"${firstKey}"`, 'g');
        keyPattern.lastIndex = startOffset;
        
        const match = keyPattern.exec(text);
        return match ? match.index : -1;
    }

    private async getMJSyncConfig(document: vscode.TextDocument): Promise<MJSyncConfig | undefined> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return undefined;
        }

        let currentDir = path.dirname(document.uri.fsPath);
        
        while (currentDir.startsWith(workspaceFolder.uri.fsPath)) {
            const configPath = path.join(currentDir, '.mj-sync.json');
            if (fs.existsSync(configPath)) {
                try {
                    const configContent = fs.readFileSync(configPath, 'utf8');
                    const config: MJSyncConfig = JSON.parse(configContent);
                    return config;
                } catch (error) {
                    console.error('Error parsing .mj-sync.json:', error);
                }
            }
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) break;
            currentDir = parentDir;
        }

        return undefined;
    }

    private async getEntityFromContext(document: vscode.TextDocument): Promise<string | undefined> {
        const config = await this.getMJSyncConfig(document);
        return config?.entity;
    }

    dispose(): void {
        this.diagnosticCollection.dispose();
    }
}