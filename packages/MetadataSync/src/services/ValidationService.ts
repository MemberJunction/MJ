import { Metadata } from '@memberjunction/core';
import * as fs from 'fs';
import * as path from 'path';
import { 
    ValidationResult, 
    ValidationError, 
    ValidationWarning, 
    ValidationOptions, 
    FileValidationResult,
    EntityDependency,
    ParsedReference,
    ReferenceType
} from '../types/validation';
import { RecordData } from '../lib/sync-engine';

// Type aliases for clarity
type EntityData = RecordData;
type EntitySyncConfig = any;
type EntityFieldData = any;

export class ValidationService {
    private metadata: Metadata;
    private errors: ValidationError[] = [];
    private warnings: ValidationWarning[] = [];
    private entityDependencies: Map<string, EntityDependency> = new Map();
    private processedEntities: Set<string> = new Set();
    private options: ValidationOptions;

    constructor(options: Partial<ValidationOptions> = {}) {
        this.metadata = new Metadata();
        this.options = {
            verbose: false,
            outputFormat: 'human',
            maxNestingDepth: 10,
            checkBestPractices: true,
            ...options
        };
    }

    /**
     * Validates all metadata files in the specified directory
     */
    public async validateDirectory(dir: string): Promise<ValidationResult> {
        this.reset();
        
        const configPath = path.join(dir, '.mj-sync.json');
        if (!fs.existsSync(configPath)) {
            this.addError({
                type: 'entity',
                severity: 'error',
                file: dir,
                message: 'No .mj-sync.json configuration file found in directory'
            });
            return this.getResult();
        }

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const directories = await this.getDirectoriesInOrder(dir, config);
        
        let totalFiles = 0;
        let totalEntities = 0;
        const fileResults = new Map<string, FileValidationResult>();

        for (const subDir of directories) {
            const subDirPath = path.join(dir, subDir);
            const result = await this.validateEntityDirectory(subDirPath);
            if (result) {
                totalFiles += result.files;
                totalEntities += result.entities;
                for (const [file, fileResult] of result.fileResults) {
                    fileResults.set(file, fileResult);
                }
            }
        }

        // Validate dependency order
        await this.validateDependencyOrder(directories);

        return {
            isValid: this.errors.length === 0,
            errors: this.errors,
            warnings: this.warnings,
            summary: {
                totalFiles,
                totalEntities,
                totalErrors: this.errors.length,
                totalWarnings: this.warnings.length,
                fileResults
            }
        };
    }

    /**
     * Validates a single entity directory
     */
    private async validateEntityDirectory(dir: string): Promise<{ files: number, entities: number, fileResults: Map<string, FileValidationResult> } | null> {
        const configPath = path.join(dir, '.mj-sync.json');
        if (!fs.existsSync(configPath)) {
            return null;
        }

        const config: EntitySyncConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const entityInfo = this.metadata.EntityByName(config.entity);
        
        if (!entityInfo) {
            this.addError({
                type: 'entity',
                severity: 'error',
                file: configPath,
                message: `Entity "${config.entity}" not found in metadata`
            });
            return null;
        }

        const files = await this.getMatchingFiles(dir, config.filePattern);
        let totalEntities = 0;
        const fileResults = new Map<string, FileValidationResult>();

        for (const file of files) {
            const filePath = path.join(dir, file);
            const result = await this.validateFile(filePath, entityInfo, config);
            totalEntities += result.entityCount;
            fileResults.set(filePath, result);
        }

        return { files: files.length, entities: totalEntities, fileResults };
    }

    /**
     * Validates a single metadata file
     */
    private async validateFile(filePath: string, entityInfo: any, config: EntitySyncConfig): Promise<FileValidationResult> {
        const fileErrors: ValidationError[] = [];
        const fileWarnings: ValidationWarning[] = [];
        let entityCount = 0;

        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);
            const entities = Array.isArray(data) ? data : [data];
            entityCount = entities.length;

            for (const entityData of entities) {
                await this.validateEntityData(entityData, entityInfo, filePath, config);
            }
        } catch (error) {
            fileErrors.push({
                type: 'entity',
                severity: 'error',
                file: filePath,
                message: `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`
            });
        }

        // Collect errors and warnings for this file
        const currentFileErrors = this.errors.filter(e => e.file === filePath);
        const currentFileWarnings = this.warnings.filter(w => w.file === filePath);

        return {
            file: filePath,
            entityCount,
            errors: currentFileErrors,
            warnings: currentFileWarnings
        };
    }

    /**
     * Validates a single entity data object
     */
    private async validateEntityData(
        entityData: EntityData, 
        entityInfo: any, 
        filePath: string, 
        config: EntitySyncConfig,
        parentContext?: { entity: string, field: string },
        depth: number = 0
    ): Promise<void> {
        // Check nesting depth
        if (depth > this.options.maxNestingDepth) {
            this.addWarning({
                type: 'nesting',
                severity: 'warning',
                entity: entityInfo.Name,
                file: filePath,
                message: `Nesting depth ${depth} exceeds recommended maximum of ${this.options.maxNestingDepth}`,
                suggestion: 'Consider flattening the data structure or increasing maxNestingDepth'
            });
        }

        // Validate fields
        if (entityData.fields) {
            await this.validateFields(entityData.fields, entityInfo, filePath, parentContext);
        }

        // Track dependencies
        this.trackEntityDependencies(entityData, entityInfo.Name, filePath);

        // Validate related entities
        if (entityData.relatedEntities) {
            for (const [relatedEntityName, relatedData] of Object.entries(entityData.relatedEntities)) {
                const relatedEntityInfo = this.metadata.EntityByName(relatedEntityName);
                if (!relatedEntityInfo) {
                    this.addError({
                        type: 'entity',
                        severity: 'error',
                        entity: entityInfo.Name,
                        file: filePath,
                        message: `Related entity "${relatedEntityName}" not found in metadata`
                    });
                    continue;
                }

                const relatedEntities = Array.isArray(relatedData) ? relatedData : [relatedData];
                for (const relatedEntity of relatedEntities) {
                    await this.validateEntityData(
                        relatedEntity, 
                        relatedEntityInfo, 
                        filePath, 
                        config,
                        { entity: entityInfo.Name, field: relatedEntityName },
                        depth + 1
                    );
                }
            }
        }
    }

    /**
     * Validates entity fields
     */
    private async validateFields(
        fields: Record<string, any>, 
        entityInfo: any, 
        filePath: string,
        parentContext?: { entity: string, field: string }
    ): Promise<void> {
        const entityFields = entityInfo.Fields;
        const fieldMap = new Map(entityFields.map((f: any) => [f.Name, f]));

        for (const [fieldName, fieldValue] of Object.entries(fields)) {
            const fieldInfo = fieldMap.get(fieldName);
            
            if (!fieldInfo) {
                // Check if this might be a virtual property (getter/setter)
                try {
                    const entityInstance = await this.metadata.GetEntityObject(entityInfo.Name);
                    const hasProperty = fieldName in entityInstance;
                    
                    if (!hasProperty) {
                        this.addError({
                            type: 'field',
                            severity: 'error',
                            entity: entityInfo.Name,
                            field: fieldName,
                            file: filePath,
                            message: `Field "${fieldName}" does not exist on entity "${entityInfo.Name}"`
                        });
                        continue;
                    }
                    
                    // It's a virtual property, validate the value
                    await this.validateFieldValue(fieldValue, { Name: fieldName }, entityInfo, filePath, parentContext);
                    continue;
                } catch (error) {
                    // If we can't create an entity instance, fall back to error
                    this.addError({
                        type: 'field',
                        severity: 'error',
                        entity: entityInfo.Name,
                        field: fieldName,
                        file: filePath,
                        message: `Field "${fieldName}" does not exist on entity "${entityInfo.Name}"`
                    });
                    continue;
                }
            }

            // Check if field is settable (not system field)
            if ((fieldInfo as any).IsSystemField || fieldName.startsWith('__mj_')) {
                this.addError({
                    type: 'field',
                    severity: 'error',
                    entity: entityInfo.Name,
                    field: fieldName,
                    file: filePath,
                    message: `Field "${fieldName}" is a system field and cannot be set`,
                    suggestion: 'Remove this field from your metadata file'
                });
                continue;
            }

            // Validate field value and references
            await this.validateFieldValue(fieldValue, fieldInfo, entityInfo, filePath, parentContext);
        }

        // Check for required fields
        if (this.options.checkBestPractices) {
            for (const field of entityFields) {
                // Skip if field allows null or has a value already
                if (field.AllowsNull || fields[field.Name]) {
                    continue;
                }
                
                // Skip if field has a default value
                if (field.DefaultValue !== null && field.DefaultValue !== undefined) {
                    continue;
                }
                
                // Skip virtual/computed fields (foreign key reference fields)
                // These are typically named without 'ID' suffix but have a corresponding FK field
                const relatedEntityField = field.RelatedEntity;
                const correspondingFKField = entityFields.find((f: any) => 
                    f.Name === field.Name + 'ID' && f.IsForeignKey
                );
                if (relatedEntityField && correspondingFKField) {
                    continue;
                }
                
                // Skip fields that are marked as AutoUpdateOnly or ReadOnly
                if ((field as any).AutoUpdateOnly || (field as any).ReadOnly) {
                    continue;
                }
                
                // Skip if this is a parent context and the field can be inherited
                if (parentContext && (field.Name === parentContext.field || field.Name === parentContext.field + 'ID')) {
                    continue;
                }
                
                // Special case: Skip TemplateID if TemplateText is provided (virtual property)
                if (field.Name === 'TemplateID' && fields['TemplateText']) {
                    continue;
                }
                
                // Skip Template field if TemplateText is provided
                if (field.Name === 'Template' && fields['TemplateText']) {
                    continue;
                }
                
                this.addWarning({
                    type: 'bestpractice',
                    severity: 'warning',
                    entity: entityInfo.Name,
                    field: field.Name,
                    file: filePath,
                    message: `Required field "${field.Name}" is missing`,
                    suggestion: `Add "${field.Name}" to the fields object`
                });
            }
        }
    }

    /**
     * Validates field values and references
     */
    private async validateFieldValue(
        value: any, 
        fieldInfo: any, 
        entityInfo: any, 
        filePath: string,
        parentContext?: { entity: string, field: string }
    ): Promise<void> {
        if (typeof value === 'string' && value.startsWith('@')) {
            await this.validateReference(value, fieldInfo, entityInfo, filePath, parentContext);
        }
        // Add type validation here if needed
    }

    /**
     * Validates special references (@file:, @lookup:, etc.)
     */
    private async validateReference(
        reference: string, 
        fieldInfo: any, 
        entityInfo: any, 
        filePath: string,
        parentContext?: { entity: string, field: string }
    ): Promise<void> {
        const parsed = this.parseReference(reference);
        if (!parsed) {
            this.addError({
                type: 'reference',
                severity: 'error',
                entity: entityInfo.Name,
                field: fieldInfo.Name,
                file: filePath,
                message: `Invalid reference format: "${reference}"`
            });
            return;
        }

        switch (parsed.type) {
            case '@file:':
                await this.validateFileReference(parsed.value, filePath, entityInfo.Name, fieldInfo.Name);
                break;
            case '@lookup:':
                await this.validateLookupReference(parsed, filePath, entityInfo.Name, fieldInfo.Name);
                break;
            case '@template:':
                await this.validateTemplateReference(parsed.value, filePath, entityInfo.Name, fieldInfo.Name);
                break;
            case '@parent:':
                this.validateParentReference(parsed.value, parentContext, filePath, entityInfo.Name, fieldInfo.Name);
                break;
            case '@root:':
                this.validateRootReference(parsed.value, parentContext, filePath, entityInfo.Name, fieldInfo.Name);
                break;
        }
    }

    /**
     * Parses a reference string
     */
    private parseReference(reference: string): ParsedReference | null {
        const patterns: [ReferenceType, RegExp][] = [
            ['@file:', /^@file:(.+)$/],
            ['@lookup:', /^@lookup:([^.]+)\.([^=]+)=(.+)$/],
            ['@template:', /^@template:(.+)$/],
            ['@parent:', /^@parent:(.+)$/],
            ['@root:', /^@root:(.+)$/],
            ['@env:', /^@env:(.+)$/]
        ];

        for (const [type, pattern] of patterns) {
            const match = reference.match(pattern);
            if (match) {
                if (type === '@lookup:') {
                    const [, entity, field, valueAndOptions] = match;
                    const [value, ...options] = valueAndOptions.split('?');
                    const createIfMissing = options.includes('create');
                    const additionalFields: Record<string, any> = {};
                    
                    for (const option of options) {
                        if (option.includes('&')) {
                            const pairs = option.split('&');
                            for (const pair of pairs) {
                                const [key, val] = pair.split('=');
                                if (key && val && key !== 'create') {
                                    additionalFields[key] = val;
                                }
                            }
                        }
                    }

                    return { type, value, entity, field, createIfMissing, additionalFields };
                }
                return { type, value: match[1] };
            }
        }

        return null;
    }

    /**
     * Validates @file: references
     */
    private async validateFileReference(
        filePath: string, 
        sourceFile: string, 
        entityName: string, 
        fieldName: string
    ): Promise<void> {
        const dir = path.dirname(sourceFile);
        const resolvedPath = path.resolve(dir, filePath);
        
        if (!fs.existsSync(resolvedPath)) {
            this.addError({
                type: 'reference',
                severity: 'error',
                entity: entityName,
                field: fieldName,
                file: sourceFile,
                message: `File reference not found: "${filePath}"`,
                suggestion: `Create file at: ${resolvedPath}`
            });
        }
    }

    /**
     * Validates @lookup: references
     */
    private async validateLookupReference(
        parsed: ParsedReference, 
        sourceFile: string, 
        entityName: string, 
        fieldName: string
    ): Promise<void> {
        const lookupEntity = this.metadata.EntityByName(parsed.entity!);
        
        if (!lookupEntity) {
            this.addError({
                type: 'reference',
                severity: 'error',
                entity: entityName,
                field: fieldName,
                file: sourceFile,
                message: `Lookup entity "${parsed.entity}" not found`,
                suggestion: 'Check entity name spelling and case'
            });
            return;
        }

        const lookupField = lookupEntity.Fields.find((f: any) => f.Name === parsed.field);
        if (!lookupField) {
            this.addError({
                type: 'reference',
                severity: 'error',
                entity: entityName,
                field: fieldName,
                file: sourceFile,
                message: `Lookup field "${parsed.field}" not found on entity "${parsed.entity}"`,
                suggestion: `Available fields: ${lookupEntity.Fields.map((f: any) => f.Name).join(', ')}`
            });
        }

        // Track dependency
        this.addEntityDependency(entityName, parsed.entity!);
    }

    /**
     * Validates @template: references
     */
    private async validateTemplateReference(
        templatePath: string, 
        sourceFile: string, 
        entityName: string, 
        fieldName: string
    ): Promise<void> {
        const dir = path.dirname(sourceFile);
        const resolvedPath = path.resolve(dir, templatePath);
        
        if (!fs.existsSync(resolvedPath)) {
            this.addError({
                type: 'reference',
                severity: 'error',
                entity: entityName,
                field: fieldName,
                file: sourceFile,
                message: `Template file not found: "${templatePath}"`,
                suggestion: `Create template at: ${resolvedPath}`
            });
            return;
        }

        // Validate template is valid JSON
        try {
            JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
        } catch (error) {
            this.addError({
                type: 'reference',
                severity: 'error',
                entity: entityName,
                field: fieldName,
                file: sourceFile,
                message: `Template file is not valid JSON: "${templatePath}"`,
                details: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Validates @parent: references
     */
    private validateParentReference(
        fieldName: string, 
        parentContext: { entity: string, field: string } | undefined,
        sourceFile: string,
        entityName: string,
        currentFieldName: string
    ): void {
        if (!parentContext) {
            this.addError({
                type: 'reference',
                severity: 'error',
                entity: entityName,
                field: currentFieldName,
                file: sourceFile,
                message: `@parent: reference used but no parent context exists`,
                suggestion: '@parent: can only be used in nested/related entities'
            });
        }
    }

    /**
     * Validates @root: references
     */
    private validateRootReference(
        fieldName: string, 
        parentContext: { entity: string, field: string } | undefined,
        sourceFile: string,
        entityName: string,
        currentFieldName: string
    ): void {
        if (!parentContext) {
            this.addError({
                type: 'reference',
                severity: 'error',
                entity: entityName,
                field: currentFieldName,
                file: sourceFile,
                message: `@root: reference used but no root context exists`,
                suggestion: '@root: can only be used in nested/related entities'
            });
        }
    }

    /**
     * Track entity dependencies
     */
    private trackEntityDependencies(entityData: EntityData, entityName: string, filePath: string): void {
        if (!this.entityDependencies.has(entityName)) {
            this.entityDependencies.set(entityName, {
                entityName,
                dependsOn: new Set(),
                file: filePath
            });
        }

        // Track dependencies from lookups in fields
        if (entityData.fields) {
            for (const value of Object.values(entityData.fields)) {
                if (typeof value === 'string' && value.startsWith('@lookup:')) {
                    const parsed = this.parseReference(value);
                    if (parsed?.entity) {
                        this.addEntityDependency(entityName, parsed.entity);
                    }
                }
            }
        }
    }

    /**
     * Add an entity dependency
     */
    private addEntityDependency(from: string, to: string): void {
        if (!this.entityDependencies.has(from)) {
            this.entityDependencies.set(from, {
                entityName: from,
                dependsOn: new Set(),
                file: ''
            });
        }
        this.entityDependencies.get(from)!.dependsOn.add(to);
    }

    /**
     * Validates dependency order
     */
    private async validateDependencyOrder(directoryOrder: string[]): Promise<void> {
        // Build a map of entity to directory
        const entityToDirectory = new Map<string, string>();
        
        for (const dir of directoryOrder) {
            // This is simplified - in reality we'd need to read the .mj-sync.json
            // to get the actual entity name
            entityToDirectory.set(dir, dir);
        }

        // Check for circular dependencies
        const visited = new Set<string>();
        const recursionStack = new Set<string>();
        
        for (const [entity, deps] of this.entityDependencies) {
            if (!visited.has(entity)) {
                this.checkCircularDependency(entity, visited, recursionStack);
            }
        }

        // Check if current order satisfies dependencies
        const orderViolations = this.checkDependencyOrder(directoryOrder);
        if (orderViolations.length > 0) {
            // Suggest a corrected order
            const suggestedOrder = this.topologicalSort();
            
            for (const violation of orderViolations) {
                this.addError({
                    type: 'dependency',
                    severity: 'error',
                    entity: violation.entity,
                    file: violation.file,
                    message: `Entity '${violation.entity}' depends on '${violation.dependency}' but is processed before it`,
                    suggestion: `Reorder directories to: [${suggestedOrder.join(', ')}]`
                });
            }
        }
    }

    /**
     * Check for circular dependencies
     */
    private checkCircularDependency(
        entity: string, 
        visited: Set<string>, 
        recursionStack: Set<string>,
        path: string[] = []
    ): boolean {
        visited.add(entity);
        recursionStack.add(entity);
        path.push(entity);

        const deps = this.entityDependencies.get(entity);
        if (deps) {
            for (const dep of deps.dependsOn) {
                if (!visited.has(dep)) {
                    if (this.checkCircularDependency(dep, visited, recursionStack, [...path])) {
                        return true;
                    }
                } else if (recursionStack.has(dep)) {
                    // Found circular dependency
                    const cycle = [...path, dep];
                    const cycleStart = cycle.indexOf(dep);
                    const cyclePath = cycle.slice(cycleStart).join(' → ');
                    
                    this.addError({
                        type: 'circular',
                        severity: 'error',
                        entity: entity,
                        file: deps.file,
                        message: `Circular dependency detected: ${cyclePath}`,
                        suggestion: 'Restructure your entities to avoid circular references'
                    });
                    return true;
                }
            }
        }

        recursionStack.delete(entity);
        return false;
    }

    /**
     * Get directories in order based on config
     */
    private async getDirectoriesInOrder(rootDir: string, config: any): Promise<string[]> {
        const allDirs = fs.readdirSync(rootDir)
            .filter(f => fs.statSync(path.join(rootDir, f)).isDirectory())
            .filter(d => !d.startsWith('.'));

        if (config.directoryOrder && Array.isArray(config.directoryOrder)) {
            const ordered = config.directoryOrder.filter((d: string) => allDirs.includes(d));
            const remaining = allDirs.filter(d => !ordered.includes(d)).sort();
            return [...ordered, ...remaining];
        }

        return allDirs.sort();
    }

    /**
     * Get files matching pattern
     */
    private async getMatchingFiles(dir: string, pattern: string): Promise<string[]> {
        const files = fs.readdirSync(dir)
            .filter(f => fs.statSync(path.join(dir, f)).isFile());
        
        // Simple glob pattern matching
        if (pattern === '*.json') {
            return files.filter(f => f.endsWith('.json') && !f.startsWith('.mj-'));
        } else if (pattern === '.*.json') {
            return files.filter(f => f.startsWith('.') && f.endsWith('.json') && !f.startsWith('.mj-'));
        }
        
        return files;
    }

    /**
     * Add an error
     */
    private addError(error: ValidationError): void {
        this.errors.push(error);
    }

    /**
     * Add a warning
     */
    private addWarning(warning: ValidationWarning): void {
        this.warnings.push(warning);
    }

    /**
     * Check if current directory order satisfies dependencies
     */
    private checkDependencyOrder(directoryOrder: string[]): Array<{entity: string, dependency: string, file: string}> {
        const violations: Array<{entity: string, dependency: string, file: string}> = [];
        const processedEntities = new Set<string>();
        
        for (const dir of directoryOrder) {
            // In real implementation, we'd read .mj-sync.json to get entity name
            const entityName = dir; // Simplified for now
            
            const deps = this.entityDependencies.get(entityName);
            if (deps) {
                for (const dep of deps.dependsOn) {
                    if (!processedEntities.has(dep) && directoryOrder.includes(dep)) {
                        violations.push({
                            entity: entityName,
                            dependency: dep,
                            file: deps.file
                        });
                    }
                }
            }
            
            processedEntities.add(entityName);
        }
        
        return violations;
    }

    /**
     * Perform topological sort on entity dependencies
     */
    private topologicalSort(): string[] {
        const result: string[] = [];
        const visited = new Set<string>();
        const tempStack = new Set<string>();
        
        const visit = (entity: string): boolean => {
            if (tempStack.has(entity)) {
                // Circular dependency, already handled by checkCircularDependency
                return false;
            }
            
            if (visited.has(entity)) {
                return true;
            }
            
            tempStack.add(entity);
            
            const deps = this.entityDependencies.get(entity);
            if (deps) {
                for (const dep of deps.dependsOn) {
                    if (!visit(dep)) {
                        return false;
                    }
                }
            }
            
            tempStack.delete(entity);
            visited.add(entity);
            result.push(entity);
            
            return true;
        };
        
        // Visit all entities
        for (const entity of this.entityDependencies.keys()) {
            if (!visited.has(entity)) {
                visit(entity);
            }
        }
        
        return result;
    }

    /**
     * Reset validation state
     */
    private reset(): void {
        this.errors = [];
        this.warnings = [];
        this.entityDependencies.clear();
        this.processedEntities.clear();
    }

    /**
     * Get validation result
     */
    private getResult(): ValidationResult {
        return {
            isValid: this.errors.length === 0,
            errors: this.errors,
            warnings: this.warnings,
            summary: {
                totalFiles: 0,
                totalEntities: 0,
                totalErrors: this.errors.length,
                totalWarnings: this.warnings.length,
                fileResults: new Map()
            }
        };
    }
}