import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MetadataProvider } from './MetadataProvider';

// Define the types we need locally
interface MJSyncConfig {
    entity: string;
    files?: string | string[];
    processOrder?: number;
    defaults?: Record<string, any>;
    defaultFromFile?: string;
    defaultFromTemplate?: string;
    relatedEntities?: RelatedEntityConfig[];
    ignoreFields?: string[];
    ignorePull?: boolean;
    ignorePush?: boolean;
    autoCreateMissingRecords?: boolean;
    externalFiles?: Record<string, string>;
}

interface RelatedEntityConfig {
    entity: string;
    relationshipType: 'single' | 'collection';
    lookupField?: string;
    property?: string;
    files?: string | string[];
    orderBy?: string;
    defaults?: Record<string, any>;
}

interface EntityContext {
    entityName: string;
    configPath: string;
    config: MJSyncConfig;
}

export class CompletionProvider implements vscode.CompletionItemProvider {
    constructor(private metadataProvider: MetadataProvider) {}
    
    resolveCompletionItem?(
        item: vscode.CompletionItem,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CompletionItem> {
        // The actual insertion will be handled by a command
        return item;
    }

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList | undefined> {
        // Check if we're in a relevant JSON file
        const entityContext = await this.getEntityContext(document);
        if (!entityContext) {
            return undefined;
        }

        // Get the current line and determine what type of completion is needed
        const line = document.lineAt(position);
        const lineText = line.text.substring(0, position.character);
        
        // Check if we're typing a property name
        if (this.isTypingPropertyName(lineText)) {
            const items = await this.getFieldCompletions(entityContext, document, position);
            // Return a CompletionList with isIncomplete: false to prevent VSCode from adding its own suggestions
            return new vscode.CompletionList(items, false);
        }

        // Check if we're typing a property value
        const propertyName = this.getPropertyNameForValue(document, position);
        if (propertyName) {
            const items = await this.getValueCompletions(entityContext, propertyName);
            return new vscode.CompletionList(items, false);
        }

        // Check if we're typing a reference (starts with @)
        if (lineText.trim().endsWith('"@') || lineText.trim().endsWith(': "@')) {
            const items = this.getReferenceCompletions();
            return new vscode.CompletionList(items, false);
        }

        return undefined;
    }

    private async getEntityContext(document: vscode.TextDocument): Promise<EntityContext | undefined> {
        // Find the nearest .mj-sync.json file
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return undefined;
        }

        let currentDir = path.dirname(document.uri.fsPath);
        let mjSyncConfig: MJSyncConfig | undefined;
        let mjSyncPath: string | undefined;

        // Walk up the directory tree looking for .mj-sync.json
        while (currentDir.startsWith(workspaceFolder.uri.fsPath)) {
            const configPath = path.join(currentDir, '.mj-sync.json');
            if (fs.existsSync(configPath)) {
                try {
                    const configContent = fs.readFileSync(configPath, 'utf8');
                    mjSyncConfig = JSON.parse(configContent);
                    mjSyncPath = configPath;
                    break;
                } catch (error) {
                    console.error('Error parsing .mj-sync.json:', error);
                }
            }
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) break;
            currentDir = parentDir;
        }

        if (!mjSyncConfig || !mjSyncPath) {
            return undefined;
        }

        return {
            entityName: mjSyncConfig.entity, // Store the main entity name
            configPath: mjSyncPath,
            config: mjSyncConfig
        };
    }

    private async determineEntityFromDocument(document: vscode.TextDocument, config: MJSyncConfig, position?: vscode.Position): Promise<string> {
        // Parse the document to determine if we're in a related entity
        try {
            const documentText = document.getText();
            const documentJson = JSON.parse(documentText);

            // If we have a position, try to determine the entity based on JSON path
            if (position) {
                const jsonPath = this.getJSONPath(documentText, document.offsetAt(position));
                
                // Check if we're in a related entity section
                if (jsonPath.includes('relatedEntities') && config.relatedEntities) {
                    // Find which related entity we're in
                    for (const relatedEntity of config.relatedEntities) {
                        if (jsonPath.includes(relatedEntity.property || relatedEntity.entity)) {
                            return relatedEntity.entity;
                        }
                    }
                }
            }

            return config.entity;
        } catch {
            // If we can't parse the document, assume main entity
            return config.entity;
        }
    }

    private getJSONPath(text: string, offset: number): string[] {
        // Simple JSON path parser - finds the path to the current position
        const path: string[] = [];
        let depth = 0;
        let inString = false;
        let currentKey = '';
        let collectingKey = false;
        
        for (let i = 0; i < offset && i < text.length; i++) {
            const char = text[i];
            const prevChar = i > 0 ? text[i - 1] : '';
            
            if (!inString) {
                if (char === '"' && prevChar !== '\\') {
                    inString = true;
                    collectingKey = true;
                    currentKey = '';
                } else if (char === '{' || char === '[') {
                    depth++;
                } else if (char === '}' || char === ']') {
                    depth--;
                    if (path.length > depth) {
                        path.pop();
                    }
                }
            } else {
                if (char === '"' && prevChar !== '\\') {
                    inString = false;
                    if (collectingKey && currentKey) {
                        // Check if this is followed by a colon (making it a key)
                        let j = i + 1;
                        while (j < text.length && /\s/.test(text[j])) j++;
                        if (j < text.length && text[j] === ':') {
                            path[depth - 1] = currentKey;
                        }
                    }
                    collectingKey = false;
                } else if (collectingKey) {
                    currentKey += char;
                }
            }
        }
        
        return path.filter(p => p); // Remove empty entries
    }

    private isTypingPropertyName(lineText: string): boolean {
        // Check if we're in a position to type a property name
        const trimmed = lineText.trim();
        return trimmed.endsWith('"') || trimmed.endsWith(',') || trimmed.endsWith('{');
    }

    private getPropertyNameForValue(document: vscode.TextDocument, position: vscode.Position): string | undefined {
        // Find the property name for the current value position
        const lineText = document.lineAt(position).text;
        const beforeCursor = lineText.substring(0, position.character);
        
        // Look for pattern like "propertyName": "|" where | is cursor
        const match = beforeCursor.match(/"([^"]+)"\s*:\s*"?$/);
        return match ? match[1] : undefined;
    }

    private async getFieldCompletions(
        context: EntityContext, 
        document: vscode.TextDocument, 
        position: vscode.Position
    ): Promise<vscode.CompletionItem[]> {
        // Determine which entity we're actually working with based on position
        const targetEntityName = await this.determineEntityFromDocument(document, context.config, position);
        
        const entity = await this.metadataProvider.getEntityMetadata(targetEntityName);
        if (!entity) {
            return [];
        }

        // Sort fields by Sequence, treating null/undefined as 99999
        const sortedFields = [...entity.Fields].sort((a, b) => {
            const aSeq = a.Sequence ? a.Sequence : 99999;
            const bSeq = b.Sequence ? b.Sequence : 99999;
            
            // If both have the same sequence (e.g., both are 99999), sort by name
            if (aSeq === bSeq) {
                return a.Name.localeCompare(b.Name);
            }
            
            return aSeq - bSeq;
        });

        // Debug: Log the sorted order
        console.log('Sorted fields for', entity.Name, ':', 
            sortedFields.map(f => `${f.Name}(${f.Sequence})`).join(', '));

        return sortedFields.map(field => {
            // Determine the icon based on field type and characteristics
            let itemKind = vscode.CompletionItemKind.Property;
            if (field.IsPrimaryKey) {
                itemKind = vscode.CompletionItemKind.Keyword; // Key icon
            } else if (field.RelatedEntity) {
                itemKind = vscode.CompletionItemKind.Reference; // Link icon
            } else if (field.Type === 'bit') {
                itemKind = vscode.CompletionItemKind.Enum; // Enum icon
            } else if (field.Type === 'int' || field.Type === 'bigint' || field.Type === 'decimal' || field.Type === 'float') {
                itemKind = vscode.CompletionItemKind.Value; // Number icon
            } else if (field.Type === 'datetime' || field.Type === 'date') {
                itemKind = vscode.CompletionItemKind.Event; // Calendar icon
            } else if (field.Type === 'uniqueidentifier') {
                itemKind = vscode.CompletionItemKind.Constant; // Constant icon
            }

            // Build visual indicators for the label
            let labelPrefix = '';
            if (field.IsPrimaryKey) {
                labelPrefix = '🔑 ';
            } else if (!field.AllowsNull) {
                labelPrefix = '● '; // Required field indicator
            } else if (field.RelatedEntity) {
                labelPrefix = '🔗 ';
            }

            // Create type description with visual formatting
            let typeDescription = field.Type;
            if (field.MaxLength && field.MaxLength > 0) {
                typeDescription = `${field.Type}(${field.MaxLength})`;
            }
            if (field.RelatedEntity) {
                typeDescription = `→ ${field.RelatedEntity}`;
            }

            // Create a rich completion item with enhanced label
            const item = new vscode.CompletionItem(
                {
                    label: labelPrefix + field.Name,
                    detail: field.DisplayName !== field.Name ? ` ${field.DisplayName}` : undefined,
                    description: typeDescription
                },
                itemKind
            );
            
            // Build rich documentation with tables and formatting
            const markdown = new vscode.MarkdownString();
            
            // Header with field name
            markdown.appendMarkdown(`### ${field.DisplayName || field.Name}\n\n`);
            
            // Description if available
            if (field.Description) {
                markdown.appendMarkdown(`> ${field.Description}\n\n`);
            }
            
            // Create a properties table
            markdown.appendMarkdown(`| Property | Value |\n`);
            markdown.appendMarkdown(`|----------|-------|\n`);
            markdown.appendMarkdown(`| **Type** | \`${field.Type}${field.MaxLength ? `(${field.MaxLength})` : ''}\` |\n`);
            markdown.appendMarkdown(`| **Required** | ${!field.AllowsNull ? '✅ Yes' : '❌ No'} |\n`);
            
            if (field.IsPrimaryKey) {
                markdown.appendMarkdown(`| **Primary Key** | 🔑 Yes |\n`);
            }
            
            if (field.RelatedEntity) {
                markdown.appendMarkdown(`| **Foreign Key** | 🔗 \`${field.RelatedEntity}\` |\n`);
            }
            
            if (field.DefaultValue) {
                markdown.appendMarkdown(`| **Default** | \`${field.DefaultValue}\` |\n`);
            }
            
            if (field.IsUnique) {
                markdown.appendMarkdown(`| **Unique** | ✅ Yes |\n`);
            }
            
            // Show allowed values if they exist
            const allowedValues = this.metadataProvider.getPossibleValues(entity, field);
            if (allowedValues && allowedValues.length > 0) {
                markdown.appendMarkdown(`\n#### 📋 Allowed Values\n`);
                markdown.appendCodeblock(allowedValues.join('\n'), 'text');
            }
            
            // Add example usage if it's a foreign key
            if (field.RelatedEntity) {
                markdown.appendMarkdown(`\n#### 💡 Example Reference\n`);
                markdown.appendCodeblock(`"@lookup:${field.RelatedEntity}.Name=SomeValue"`, 'json');
            }
            
            item.documentation = markdown;
            item.documentation.supportHtml = true;
            
            // Set sort text to group by category, then by sequence
            // For fields without sequence, ALWAYS put them at the very end regardless of category
            if (field.Sequence === null || field.Sequence === undefined) {
                // Use 'z' prefix to ensure these always sort last
                item.sortText = 'z' + field.Name;
            } else {
                // Categories for fields WITH sequence: 1=Primary Keys, 2=Required, 3=Foreign Keys, 4=Optional
                let categoryPrefix = '4'; // Default: optional fields
                
                if (field.IsPrimaryKey) {
                    categoryPrefix = '1';
                } else if (!field.AllowsNull) {
                    categoryPrefix = '2';
                } else if (field.RelatedEntity) {
                    categoryPrefix = '3';
                }
                
                const sequencePart = field.Sequence.toString().padStart(5, '0');
                item.sortText = categoryPrefix + sequencePart;
            }
            
            // Add preselect for the first item (lowest sequence)
            if (field.Sequence === sortedFields[0].Sequence) {
                item.preselect = true;
            }
            
            // Remove the sequence debug info from description
            
            // Set filter text to the field name (without prefix) to ensure matching works
            item.filterText = field.Name;
            
            // Add tags for additional context
            if (field.IsPrimaryKey || !field.AllowsNull || field.RelatedEntity) {
                const tags = [];
                if (field.IsPrimaryKey) tags.push('primary-key');
                if (!field.AllowsNull) tags.push('required');
                if (field.RelatedEntity) tags.push('foreign-key');
                item.tags = tags.map(t => ({ name: t })) as any;
            }
            
            // Smart insert text based on context
            const line = document.lineAt(position);
            const textBefore = line.text.substring(0, position.character);
            const textAfter = line.text.substring(position.character);
            
            // Build the insert text - just the field name, no quotes or colon
            // User types the opening quote, we insert the field name, they close the quote and add colon
            let insertText = field.Name;
            
            // Don't add any values - just insert the field name
            // User will type the closing quote, colon, and value themselves
            
            item.insertText = new vscode.SnippetString(insertText);
            
            return item;
        });
    }

    private async getValueCompletions(context: EntityContext, propertyName: string): Promise<vscode.CompletionItem[]> {
        const entity = await this.metadataProvider.getEntityMetadata(context.entityName);
        if (!entity) {
            return [];
        }

        const field = entity.Fields.find(f => f.Name === propertyName);
        if (!field) {
            return [];
        }

        const items: vscode.CompletionItem[] = [];

        // Get possible values from the provider
        const possibleValues = this.metadataProvider.getPossibleValues(entity, field);
        
        // Add possible values if they exist
        if (possibleValues && possibleValues.length > 0) {
            possibleValues.forEach(value => {
                const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.Value);
                item.detail = `Allowed value for ${field.Name}`;
                items.push(item);
            });
        }

        // Add reference completions for foreign key fields
        if (field.RelatedEntity) {
            const lookupItem = new vscode.CompletionItem('@lookup:', vscode.CompletionItemKind.Reference);
            lookupItem.detail = `Reference to ${field.RelatedEntity}`;
            lookupItem.insertText = new vscode.SnippetString(`@lookup:${field.RelatedEntity}.\${1:Name}=\${2:value}`);
            items.push(lookupItem);
        }

        // Add boolean values for bit fields
        if (field.Type === 'bit') {
            items.push(
                new vscode.CompletionItem('true', vscode.CompletionItemKind.Value),
                new vscode.CompletionItem('false', vscode.CompletionItemKind.Value)
            );
        }

        return items;
    }

    private getReferenceCompletions(): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];

        // @lookup reference
        const lookupItem = new vscode.CompletionItem('lookup:', vscode.CompletionItemKind.Reference);
        lookupItem.detail = 'Reference to another entity record';
        lookupItem.insertText = new vscode.SnippetString('lookup:\${1:EntityName}.\${2:FieldName}=\${3:value}');
        lookupItem.documentation = new vscode.MarkdownString('Reference format: `@lookup:EntityName.FieldName=value`');
        items.push(lookupItem);

        // @file reference
        const fileItem = new vscode.CompletionItem('file:', vscode.CompletionItemKind.Reference);
        fileItem.detail = 'Reference to an external file';
        fileItem.insertText = new vscode.SnippetString('file:\${1:path/to/file}');
        fileItem.documentation = new vscode.MarkdownString('Reference format: `@file:relative/path/to/file`');
        items.push(fileItem);

        // @template reference
        const templateItem = new vscode.CompletionItem('template:', vscode.CompletionItemKind.Reference);
        templateItem.detail = 'Reference to a JSON template';
        templateItem.insertText = new vscode.SnippetString('template:\${1:path/to/template.json}');
        templateItem.documentation = new vscode.MarkdownString('Reference format: `@template:path/to/template.json`');
        items.push(templateItem);

        // @parent reference
        const parentItem = new vscode.CompletionItem('parent:', vscode.CompletionItemKind.Reference);
        parentItem.detail = 'Reference to parent entity field';
        parentItem.insertText = new vscode.SnippetString('parent:\${1:FieldName}');
        parentItem.documentation = new vscode.MarkdownString('Reference format: `@parent:FieldName`');
        items.push(parentItem);

        // @root reference
        const rootItem = new vscode.CompletionItem('root:', vscode.CompletionItemKind.Reference);
        rootItem.detail = 'Reference to root entity field';
        rootItem.insertText = new vscode.SnippetString('root:\${1:FieldName}');
        rootItem.documentation = new vscode.MarkdownString('Reference format: `@root:FieldName`');
        items.push(rootItem);

        // @env reference
        const envItem = new vscode.CompletionItem('env:', vscode.CompletionItemKind.Reference);
        envItem.detail = 'Reference to environment variable';
        envItem.insertText = new vscode.SnippetString('env:\${1:VARIABLE_NAME}');
        envItem.documentation = new vscode.MarkdownString('Reference format: `@env:VARIABLE_NAME`');
        items.push(envItem);

        return items;
    }
}