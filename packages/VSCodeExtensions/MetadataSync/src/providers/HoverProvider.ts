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

export class HoverProvider implements vscode.HoverProvider {
    constructor(private metadataProvider: MetadataProvider) {}

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        // Get entity context
        const entityContext = await this.getEntityContext(document);
        if (!entityContext) {
            return undefined;
        }

        // Get the word at the current position
        const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_][a-zA-Z0-9_]*/);
        if (!wordRange) {
            return undefined;
        }

        const word = document.getText(wordRange);

        // Check if this is a field name
        if (this.isFieldName(document, wordRange)) {
            // Determine which entity we're in based on the JSON structure
            const targetEntityName = await this.determineEntityAtPosition(document, position, entityContext);
            return this.getFieldHover(targetEntityName, word, wordRange);
        }

        // Check if this is a reference
        const lineText = document.lineAt(position.line).text;
        if (lineText.includes('@lookup:') || lineText.includes('@file:') || lineText.includes('@template:')) {
            return this.getReferenceHover(lineText, position);
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
            entityName: mjSyncConfig.entity,
            configPath: mjSyncPath,
            config: mjSyncConfig
        };
    }

    private isFieldName(document: vscode.TextDocument, wordRange: vscode.Range): boolean {
        // Check if the word is likely a field name (appears before a colon in JSON)
        const line = document.lineAt(wordRange.start.line).text;
        const afterWord = line.substring(wordRange.end.character).trim();
        return afterWord.startsWith('":') || afterWord.startsWith('" :');
    }

    private async determineEntityAtPosition(
        document: vscode.TextDocument, 
        position: vscode.Position, 
        context: EntityContext
    ): Promise<string> {
        try {
            const documentText = document.getText();
            const jsonData = JSON.parse(documentText);
            
            // Parse the JSON path to the current position
            const jsonPath = this.getJSONPath(documentText, document.offsetAt(position));
            
            // Check if we're in a related entity
            if (jsonPath.includes('relatedEntities') && context.config.relatedEntities) {
                // Find which related entity we're in
                for (const relatedEntity of context.config.relatedEntities) {
                    if (jsonPath.includes(relatedEntity.property || relatedEntity.entity)) {
                        return relatedEntity.entity;
                    }
                }
            }
            
            // Check if we're in a nested structure that indicates a different entity
            // This is a simplified check - you might need more sophisticated logic
            if (jsonPath.length > 2) {
                // Look for patterns like fields[n].relatedEntityName
                const pathStr = jsonPath.join('.');
                if (pathStr.includes('.')) {
                    // Try to extract entity name from the path
                    const parts = pathStr.split('.');
                    for (let i = parts.length - 1; i >= 0; i--) {
                        const part = parts[i];
                        // Check if this part references a related entity
                        if (context.config.relatedEntities) {
                            const related = context.config.relatedEntities.find(
                                re => re.property === part || re.entity === part
                            );
                            if (related) {
                                return related.entity;
                            }
                        }
                    }
                }
            }
            
        } catch (error) {
            // JSON parse error or other issue, fall back to main entity
        }
        
        // Default to the main entity
        return context.entityName;
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

    private async getFieldHover(entityName: string, fieldName: string, wordRange: vscode.Range): Promise<vscode.Hover | undefined> {
        const entity = await this.metadataProvider.getEntityMetadata(entityName);
        if (!entity) {
            return undefined;
        }

        const field = entity.Fields.find(f => f.Name === fieldName);
        if (!field) {
            return undefined;
        }

        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`**${field.DisplayName || field.Name}**\n\n`);
        
        if (field.Description) {
            markdown.appendMarkdown(`${field.Description}\n\n`);
        }

        markdown.appendMarkdown(`**Type:** ${field.Type}`);
        if (field.MaxLength) {
            markdown.appendMarkdown(` (max: ${field.MaxLength})`);
        }
        markdown.appendMarkdown('\n\n');

        if (!field.AllowsNull) {
            markdown.appendMarkdown(`**Required:** Yes\n\n`);
        }

        if (field.DefaultValue) {
            markdown.appendMarkdown(`**Default:** ${field.DefaultValue}\n\n`);
        }

        const possibleValues = this.metadataProvider.getPossibleValues(entity, field);
        if (possibleValues && possibleValues.length > 0) {
            markdown.appendMarkdown(`**Allowed values:**\n`);
            possibleValues.forEach(value => {
                markdown.appendMarkdown(`- ${value}\n`);
            });
            markdown.appendMarkdown('\n');
        }

        if (field.RelatedEntity) {
            markdown.appendMarkdown(`**References:** ${field.RelatedEntity}\n\n`);
            markdown.appendMarkdown(`Use \`@lookup:${field.RelatedEntity}.FieldName=value\` format`);
        }

        return new vscode.Hover(markdown, wordRange);
    }

    private getReferenceHover(lineText: string, position: vscode.Position): vscode.Hover | undefined {
        const markdown = new vscode.MarkdownString();

        if (lineText.includes('@lookup:')) {
            markdown.appendMarkdown(`**@lookup Reference**\n\n`);
            markdown.appendMarkdown(`Format: \`@lookup:EntityName.FieldName=value\`\n\n`);
            markdown.appendMarkdown(`Optionally add \`?create\` to create if not found:\n`);
            markdown.appendMarkdown(`\`@lookup:EntityName.FieldName=value?create&OtherField=value\`\n\n`);
            markdown.appendMarkdown(`This creates a reference to another entity record.`);
        } else if (lineText.includes('@file:')) {
            markdown.appendMarkdown(`**@file Reference**\n\n`);
            markdown.appendMarkdown(`Format: \`@file:path/to/file.ext\`\n\n`);
            markdown.appendMarkdown(`The file path is relative to the directory containing the JSON file.\n\n`);
            markdown.appendMarkdown(`The file contents will be read and used as the field value.`);
        } else if (lineText.includes('@template:')) {
            markdown.appendMarkdown(`**@template Reference**\n\n`);
            markdown.appendMarkdown(`Format: \`@template:path/to/template.json\`\n\n`);
            markdown.appendMarkdown(`Merges the template JSON with the current object.\n\n`);
            markdown.appendMarkdown(`Template values can be overridden by local values.`);
        } else if (lineText.includes('@parent:')) {
            markdown.appendMarkdown(`**@parent Reference**\n\n`);
            markdown.appendMarkdown(`Format: \`@parent:FieldName\`\n\n`);
            markdown.appendMarkdown(`References a field from the parent entity in a hierarchy.`);
        } else if (lineText.includes('@root:')) {
            markdown.appendMarkdown(`**@root Reference**\n\n`);
            markdown.appendMarkdown(`Format: \`@root:FieldName\`\n\n`);
            markdown.appendMarkdown(`References a field from the root entity in a hierarchy.`);
        } else if (lineText.includes('@env:')) {
            markdown.appendMarkdown(`**@env Reference**\n\n`);
            markdown.appendMarkdown(`Format: \`@env:VARIABLE_NAME\`\n\n`);
            markdown.appendMarkdown(`References an environment variable value.`);
        }

        const line = position.line;
        const start = new vscode.Position(line, lineText.indexOf('@'));
        const end = new vscode.Position(line, lineText.length);
        
        return new vscode.Hover(markdown, new vscode.Range(start, end));
    }
}