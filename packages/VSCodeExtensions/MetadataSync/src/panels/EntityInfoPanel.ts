import * as vscode from 'vscode';
import { MetadataProvider } from '../providers/MetadataProvider';
import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';

export class EntityInfoPanel {
    public static currentPanel: EntityInfoPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _currentEntity: string | undefined;
    private _allEntities: EntityInfo[] | undefined;
    private _viewMode: 'current' | 'browse' = 'current';

    private constructor(
        panel: vscode.WebviewPanel,
        private readonly metadataProvider: MetadataProvider
    ) {
        this._panel = panel;
        
        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'insertField':
                        this.insertFieldIntoEditor(message.fieldName);
                        break;
                    case 'copyField':
                        vscode.env.clipboard.writeText(message.fieldName);
                        vscode.window.showInformationMessage(`Copied "${message.fieldName}" to clipboard`);
                        break;
                    case 'switchView':
                        this._viewMode = message.mode;
                        if (message.mode === 'browse' && !this._allEntities) {
                            await this.loadAllEntities();
                        }
                        await this.updateContent();
                        break;
                    case 'selectEntity':
                        this._currentEntity = message.entityName;
                        this._viewMode = 'current';
                        await this.updateContent();
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
        this._viewMode = 'current';
        await this.updateContent();
    }

    private async updateContent() {
        if (this._viewMode === 'current' && this._currentEntity) {
            const entity = await this.metadataProvider.getEntityMetadata(this._currentEntity);
            if (entity) {
                this._panel.webview.html = this.getWebviewContent(entity);
                this._panel.title = `MJ: ${entity.Name}`;
            }
        } else if (this._viewMode === 'browse') {
            this._panel.webview.html = this.getBrowseViewContent();
            this._panel.title = 'MJ: Entity Browser';
        }
    }

    private async loadAllEntities() {
        // Get all entities from metadata
        const metadata = this.metadataProvider.getMetadata();
        if (metadata) {
            this._allEntities = metadata.Entities;
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
                .view-toggle {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                    padding: 10px;
                    background-color: var(--vscode-editor-groupHeader-tabsBackground);
                    border-radius: 4px;
                }
                .toggle-button {
                    flex: 1;
                    padding: 8px 16px;
                    border: 1px solid var(--vscode-panel-border);
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .toggle-button:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }
                .toggle-button.active {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border-color: var(--vscode-focusBorder);
                }
            </style>
        </head>
        <body>
            <div class="view-toggle">
                <button class="toggle-button active" onclick="switchView('current')">
                    📄 Current Entity
                </button>
                <button class="toggle-button" onclick="switchView('browse')">
                    📚 Browse All Entities
                </button>
            </div>

            <h1>${entity.DisplayName || entity.Name}</h1>
            
            <div class="entity-info">
                ${entity.Description ? `<div style="margin-bottom: 15px; font-style: italic; color: var(--vscode-descriptionForeground);">${entity.Description}</div>` : ''}
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

                function switchView(mode) {
                    vscode.postMessage({
                        command: 'switchView',
                        mode: mode
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

    private getBrowseViewContent(): string {
        if (!this._allEntities) {
            return '<h1>Loading entities...</h1>';
        }

        // Sort entities by name
        const sortedEntities = [...this._allEntities].sort((a, b) => 
            a.Name.localeCompare(b.Name)
        );

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Entity Browser</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 10px;
                    margin: 0;
                }
                .view-toggle {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                    padding: 10px;
                    background-color: var(--vscode-editor-groupHeader-tabsBackground);
                    border-radius: 4px;
                }
                .toggle-button {
                    flex: 1;
                    padding: 8px 16px;
                    border: 1px solid var(--vscode-panel-border);
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .toggle-button:hover {
                    background-color: var(--vscode-button-secondaryHoverBackground);
                }
                .toggle-button.active {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border-color: var(--vscode-focusBorder);
                }
                h1 {
                    font-size: 1.4em;
                    margin-bottom: 10px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding-bottom: 5px;
                }
                .search-filters {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                }
                .search-box, .filter-select {
                    flex: 1;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 3px;
                }
                .entity-stats {
                    display: flex;
                    gap: 20px;
                    margin-bottom: 20px;
                    padding: 15px;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 4px;
                }
                .stat-item {
                    text-align: center;
                }
                .stat-value {
                    font-size: 2em;
                    font-weight: bold;
                    color: var(--vscode-symbolIcon-variableForeground);
                }
                .stat-label {
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                }
                .entity-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 10px;
                }
                .entity-table th {
                    background-color: var(--vscode-editor-groupHeader-tabsBackground);
                    padding: 10px;
                    text-align: left;
                    font-weight: bold;
                    border-bottom: 2px solid var(--vscode-panel-border);
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }
                .entity-table td {
                    padding: 10px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .entity-table tr:hover {
                    background-color: var(--vscode-list-hoverBackground);
                    cursor: pointer;
                }
                .entity-name {
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                }
                .entity-type-badge {
                    display: inline-block;
                    padding: 2px 8px;
                    border-radius: 3px;
                    font-size: 0.8em;
                    font-weight: bold;
                    background-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                }
                .field-count {
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                }
                .sort-indicator {
                    opacity: 0.5;
                    font-size: 0.8em;
                }
                .sort-indicator.active {
                    opacity: 1;
                }
                .entity-row-description {
                    font-size: 0.85em;
                    color: var(--vscode-descriptionForeground);
                    font-style: italic;
                    margin-top: 4px;
                }
                [title] {
                    cursor: help;
                }
            </style>
        </head>
        <body>
            <div class="view-toggle">
                <button class="toggle-button" onclick="switchView('current')">
                    📄 Current Entity
                </button>
                <button class="toggle-button active" onclick="switchView('browse')">
                    📚 Browse All Entities
                </button>
            </div>

            <h1>Entity Browser</h1>
            
            <div class="entity-stats">
                <div class="stat-item">
                    <div class="stat-value">${this._allEntities.length}</div>
                    <div class="stat-label">Total Entities</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${this._allEntities.filter(e => e.VirtualEntity).length}</div>
                    <div class="stat-label">Virtual Entities</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${this._allEntities.reduce((sum, e) => sum + e.Fields.length, 0)}</div>
                    <div class="stat-label">Total Fields</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${this._allEntities.filter(e => e.TrackRecordChanges).length}</div>
                    <div class="stat-label">Tracked Entities</div>
                </div>
            </div>

            <div class="search-filters">
                <input type="text" class="search-box" placeholder="Search entities..." id="entitySearchBox">
                <select class="filter-select" id="entityTypeFilter">
                    <option value="all">All Entities</option>
                    <option value="table">Table Entities</option>
                    <option value="virtual">Virtual Entities</option>
                    <option value="tracked">Change Tracked</option>
                    <option value="untracked">Not Tracked</option>
                </select>
            </div>

            <table class="entity-table" id="entityTable">
                <thead>
                    <tr>
                        <th onclick="sortTable('name')">
                            Entity Name 
                            <span class="sort-indicator" data-sort="name">▼</span>
                        </th>
                        <th onclick="sortTable('table')">
                            Base Table 
                            <span class="sort-indicator" data-sort="table">▼</span>
                        </th>
                        <th onclick="sortTable('fields')">
                            Fields 
                            <span class="sort-indicator" data-sort="fields">▼</span>
                        </th>
                        <th>Type</th>
                        <th>Features</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedEntities.map(entity => `
                        <tr onclick="selectEntity('${entity.Name}')" data-entity-name="${entity.Name.toLowerCase()}" 
                            data-is-virtual="${entity.VirtualEntity}" 
                            data-is-tracked="${entity.TrackRecordChanges}"
                            ${entity.Description ? `title="${entity.Description.replace(/"/g, '&quot;')}"` : ''}>
                            <td>
                                <div class="entity-name">${entity.DisplayName || entity.Name}</div>
                                ${entity.Description ? `<div class="entity-row-description">${entity.Description.length > 100 ? entity.Description.substring(0, 100) + '...' : entity.Description}</div>` : ''}
                            </td>
                            <td>${entity.BaseTable || '-'}</td>
                            <td>
                                <span class="field-count">
                                    📋 ${entity.Fields.length}
                                </span>
                            </td>
                            <td>
                                ${entity.VirtualEntity 
                                    ? '<span class="entity-type-badge">Virtual</span>' 
                                    : '<span class="entity-type-badge">Table</span>'}
                            </td>
                            <td>
                                ${entity.TrackRecordChanges ? '✅ Tracked' : ''}
                                ${entity.AllowCreateAPI ? '🔧 API' : ''}
                                ${entity.CustomResolverAPI ? '⚡ Custom' : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <script>
                const vscode = acquireVsCodeApi();
                let sortColumn = 'name';
                let sortDirection = 'asc';
                
                // Search functionality
                document.getElementById('entitySearchBox').addEventListener('input', filterEntities);
                document.getElementById('entityTypeFilter').addEventListener('change', filterEntities);
                
                function filterEntities() {
                    const searchTerm = document.getElementById('entitySearchBox').value.toLowerCase();
                    const typeFilter = document.getElementById('entityTypeFilter').value;
                    const rows = document.querySelectorAll('#entityTable tbody tr');
                    
                    rows.forEach(row => {
                        const name = row.getAttribute('data-entity-name');
                        const description = row.getAttribute('title') || '';
                        const isVirtual = row.getAttribute('data-is-virtual') === 'true';
                        const isTracked = row.getAttribute('data-is-tracked') === 'true';
                        
                        let showRow = true;
                        
                        // Apply search filter (search in name and description)
                        if (searchTerm && !name.includes(searchTerm) && !description.toLowerCase().includes(searchTerm)) {
                            showRow = false;
                        }
                        
                        // Apply type filter
                        if (typeFilter !== 'all') {
                            if (typeFilter === 'virtual' && !isVirtual) showRow = false;
                            if (typeFilter === 'table' && isVirtual) showRow = false;
                            if (typeFilter === 'tracked' && !isTracked) showRow = false;
                            if (typeFilter === 'untracked' && isTracked) showRow = false;
                        }
                        
                        row.style.display = showRow ? '' : 'none';
                    });
                }

                function sortTable(column) {
                    const table = document.getElementById('entityTable');
                    const tbody = table.querySelector('tbody');
                    const rows = Array.from(tbody.querySelectorAll('tr'));
                    
                    // Toggle sort direction if same column
                    if (sortColumn === column) {
                        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
                    } else {
                        sortColumn = column;
                        sortDirection = 'asc';
                    }
                    
                    // Update sort indicators
                    document.querySelectorAll('.sort-indicator').forEach(indicator => {
                        indicator.classList.remove('active');
                        indicator.textContent = '▼';
                    });
                    
                    const activeIndicator = document.querySelector(\`.sort-indicator[data-sort="\${column}"]\`);
                    activeIndicator.classList.add('active');
                    activeIndicator.textContent = sortDirection === 'asc' ? '▲' : '▼';
                    
                    // Sort rows
                    rows.sort((a, b) => {
                        let aValue, bValue;
                        
                        switch(column) {
                            case 'name':
                                aValue = a.cells[0].textContent;
                                bValue = b.cells[0].textContent;
                                break;
                            case 'table':
                                aValue = a.cells[1].textContent;
                                bValue = b.cells[1].textContent;
                                break;
                            case 'fields':
                                aValue = parseInt(a.cells[2].textContent.match(/\\d+/)[0]);
                                bValue = parseInt(b.cells[2].textContent.match(/\\d+/)[0]);
                                break;
                        }
                        
                        if (column === 'fields') {
                            return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
                        } else {
                            const result = aValue.localeCompare(bValue);
                            return sortDirection === 'asc' ? result : -result;
                        }
                    });
                    
                    // Re-append sorted rows
                    rows.forEach(row => tbody.appendChild(row));
                }

                function selectEntity(entityName) {
                    vscode.postMessage({
                        command: 'selectEntity',
                        entityName: entityName
                    });
                }

                function switchView(mode) {
                    vscode.postMessage({
                        command: 'switchView',
                        mode: mode
                    });
                }
            </script>
        </body>
        </html>`;
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