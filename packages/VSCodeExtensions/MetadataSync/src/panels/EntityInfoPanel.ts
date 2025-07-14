import * as vscode from 'vscode';
import { MetadataProvider } from '../providers/MetadataProvider';
import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';

export class EntityInfoPanel {
    public static currentPanel: EntityInfoPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _currentEntity: string | undefined;

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly metadataProvider: MetadataProvider
    ) {
        this._panel = panel;
        
        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'insertField':
                        this.insertFieldIntoEditor(message.fieldName);
                        break;
                    case 'copyField':
                        vscode.env.clipboard.writeText(message.fieldName);
                        vscode.window.showInformationMessage(`Copied "${message.fieldName}" to clipboard`);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public static async createOrShow(metadataProvider: MetadataProvider, entityName?: string) {
        const column = vscode.ViewColumn.Two;

        // If we already have a panel, show it
        if (EntityInfoPanel.currentPanel) {
            EntityInfoPanel.currentPanel._panel.reveal(column);
            if (entityName) {
                await EntityInfoPanel.currentPanel.updateEntity(entityName);
            }
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            'mjEntityInfo',
            'MJ Entity Info',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        EntityInfoPanel.currentPanel = new EntityInfoPanel(panel, metadataProvider);
        if (entityName) {
            await EntityInfoPanel.currentPanel.updateEntity(entityName);
        }
    }

    public async updateEntity(entityName: string) {
        this._currentEntity = entityName;
        const entity = await this.metadataProvider.getEntityMetadata(entityName);
        if (entity) {
            this._panel.webview.html = this.getWebviewContent(entity);
            this._panel.title = `MJ: ${entity.Name}`;
        }
    }

    private insertFieldIntoEditor(fieldName: string) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.active, fieldName);
            });
        }
    }

    private getWebviewContent(entity: EntityInfo): string {
        // Sort fields by sequence
        const sortedFields = [...entity.Fields].sort((a, b) => {
            const aSeq = a.Sequence != null ? a.Sequence : 99999;
            const bSeq = b.Sequence != null ? b.Sequence : 99999;
            return aSeq - bSeq;
        });

        const fieldsHtml = sortedFields.map(field => this.getFieldHtml(field)).join('');

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${entity.Name}</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 10px;
                    margin: 0;
                }
                h1 {
                    font-size: 1.4em;
                    margin-bottom: 10px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding-bottom: 5px;
                }
                h2 {
                    font-size: 1.2em;
                    margin-top: 20px;
                    margin-bottom: 10px;
                }
                .entity-info {
                    margin-bottom: 20px;
                }
                .field {
                    margin-bottom: 15px;
                    padding: 10px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                }
                .field:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .field-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 5px;
                }
                .field-name {
                    font-weight: bold;
                    color: var(--vscode-symbolIcon-variableForeground);
                }
                .field-type {
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                }
                .field-badges {
                    display: flex;
                    gap: 5px;
                    margin-bottom: 5px;
                }
                .badge {
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-size: 0.8em;
                    font-weight: bold;
                }
                .badge-required {
                    background-color: var(--vscode-inputValidation-errorBackground);
                    color: var(--vscode-inputValidation-errorForeground);
                }
                .badge-primary {
                    background-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                }
                .badge-foreign {
                    background-color: var(--vscode-textLink-foreground);
                    color: var(--vscode-editor-background);
                }
                .field-description {
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 5px;
                }
                .field-actions {
                    display: flex;
                    gap: 10px;
                    margin-top: 8px;
                }
                button {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 4px 12px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 0.9em;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .allowed-values {
                    margin-top: 5px;
                    padding: 5px;
                    background-color: var(--vscode-textBlockQuote-background);
                    border-radius: 3px;
                    font-size: 0.9em;
                }
                .search-box {
                    width: 100%;
                    padding: 8px;
                    margin-bottom: 10px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 3px;
                }
            </style>
        </head>
        <body>
            <h1>${entity.DisplayName || entity.Name}</h1>
            
            <div class="entity-info">
                <strong>Entity:</strong> ${entity.Name}<br>
                <strong>Table:</strong> ${entity.BaseTable}<br>
                <strong>Total Fields:</strong> ${entity.Fields.length}
            </div>

            <input type="text" class="search-box" placeholder="Search fields..." id="searchBox">

            <h2>Fields</h2>
            <div id="fieldsContainer">
                ${fieldsHtml}
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                
                // Search functionality
                document.getElementById('searchBox').addEventListener('input', (e) => {
                    const searchTerm = e.target.value.toLowerCase();
                    const fields = document.querySelectorAll('.field');
                    
                    fields.forEach(field => {
                        const fieldName = field.getAttribute('data-field-name').toLowerCase();
                        const fieldDesc = field.getAttribute('data-field-desc').toLowerCase();
                        
                        if (fieldName.includes(searchTerm) || fieldDesc.includes(searchTerm)) {
                            field.style.display = 'block';
                        } else {
                            field.style.display = 'none';
                        }
                    });
                });

                // Button actions
                function insertField(fieldName) {
                    vscode.postMessage({
                        command: 'insertField',
                        fieldName: fieldName
                    });
                }

                function copyField(fieldName) {
                    vscode.postMessage({
                        command: 'copyField',
                        fieldName: fieldName
                    });
                }
            </script>
        </body>
        </html>`;
    }

    private getFieldHtml(field: EntityFieldInfo): string {
        const badges = [];
        if (field.IsPrimaryKey) badges.push('<span class="badge badge-primary">🔑 Primary</span>');
        if (!field.AllowsNull) badges.push('<span class="badge badge-required">Required</span>');
        if (field.RelatedEntity) badges.push(`<span class="badge badge-foreign">🔗 ${field.RelatedEntity}</span>`);

        const possibleValues = this.metadataProvider.getPossibleValues(
            { Fields: [field] } as any,
            field
        );

        return `
        <div class="field" data-field-name="${field.Name}" data-field-desc="${field.Description || ''}">
            <div class="field-header">
                <span class="field-name">${field.Name}</span>
                <span class="field-type">${field.Type}${field.MaxLength ? `(${field.MaxLength})` : ''}</span>
            </div>
            ${badges.length > 0 ? `<div class="field-badges">${badges.join(' ')}</div>` : ''}
            ${field.Description ? `<div class="field-description">${field.Description}</div>` : ''}
            ${field.DefaultValue ? `<div><strong>Default:</strong> ${field.DefaultValue}</div>` : ''}
            ${possibleValues && possibleValues.length > 0 ? 
                `<div class="allowed-values"><strong>Allowed:</strong> ${possibleValues.join(', ')}</div>` : ''}
            <div class="field-actions">
                <button onclick="insertField('${field.Name}')">Insert</button>
                <button onclick="copyField('${field.Name}')">Copy</button>
            </div>
        </div>`;
    }

    public dispose() {
        EntityInfoPanel.currentPanel = undefined;

        // Clean up resources
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}