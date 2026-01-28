/**
 * @fileoverview MCP Test Tool Dialog Component
 *
 * Provides a beautiful UX for testing MCP tools with:
 * - Server/Connection/Tool selection
 * - Dynamic parameter input UI based on JSON Schema
 * - Tool execution with results display
 * - User settings caching via UserInfoEngine
 */

import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { GraphQLDataProvider, gql } from '@memberjunction/graphql-dataprovider';
import { UserInfoEngine } from '@memberjunction/core-entities';

/**
 * Interface for JSON Schema property definition
 */
interface JsonSchemaProperty {
    type?: string | string[];
    description?: string;
    default?: unknown;
    enum?: unknown[];
    required?: boolean;
    items?: JsonSchemaProperty;
    properties?: Record<string, JsonSchemaProperty>;
    format?: string;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
}

/**
 * Interface for JSON Schema
 */
interface JsonSchema {
    type?: string;
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
    description?: string;
}

/**
 * Parameter input configuration derived from schema
 */
interface ParameterConfig {
    name: string;
    type: string;
    description: string;
    required: boolean;
    defaultValue: unknown;
    enumValues: unknown[];
    format: string | null;
    minimum?: number;
    maximum?: number;
}

/**
 * Tool execution result
 */
interface ToolExecutionResult {
    Success: boolean;
    ErrorMessage?: string;
    Result?: unknown;
    DurationMs?: number;
}

/**
 * Server data for selection
 */
export interface TestToolServerData {
    ID: string;
    Name: string;
    Description: string | null;
    Status: string;
}

/**
 * Connection data for selection
 */
export interface TestToolConnectionData {
    ID: string;
    MCPServerID: string;
    ServerName?: string;
    Name: string;
    Description: string | null;
    Status: string;
}

/**
 * Tool data for selection
 */
export interface TestToolData {
    ID: string;
    MCPServerID: string;
    ServerName?: string;
    ToolName: string;
    ToolTitle: string | null;
    ToolDescription: string | null;
    InputSchema: string;
    Status: string;
}

/**
 * GraphQL mutation for executing MCP tool
 */
const ExecuteMCPToolMutation = gql`
    mutation ExecuteMCPTool($input: ExecuteMCPToolInput!) {
        ExecuteMCPTool(input: $input) {
            Success
            ErrorMessage
            Result
            DurationMs
        }
    }
`;

@Component({
    selector: 'mj-mcp-test-tool-dialog',
    templateUrl: './mcp-test-tool-dialog.component.html',
    styleUrls: ['./mcp-test-tool-dialog.component.css']
})
export class MCPTestToolDialogComponent implements OnInit, OnDestroy {

    // ========================================
    // Inputs
    // ========================================

    @Input() Visible = false;
    @Input() Servers: TestToolServerData[] = [];
    @Input() Connections: TestToolConnectionData[] = [];
    @Input() Tools: TestToolData[] = [];

    /** Pre-selected server ID */
    @Input() SelectedServerID: string | null = null;

    /** Pre-selected connection ID */
    @Input() SelectedConnectionID: string | null = null;

    /** Pre-selected tool ID */
    @Input() SelectedToolID: string | null = null;

    // ========================================
    // Outputs
    // ========================================

    @Output() Close = new EventEmitter<void>();

    // ========================================
    // State
    // ========================================

    /** Current step: 'select' | 'configure' | 'results' */
    CurrentStep: 'select' | 'configure' | 'results' = 'select';

    /** Selected IDs */
    ServerID: string | null = null;
    ConnectionID: string | null = null;
    ToolID: string | null = null;

    /** Filtered lists based on selection */
    FilteredConnections: TestToolConnectionData[] = [];
    FilteredTools: TestToolData[] = [];

    /** Selected tool details */
    SelectedTool: TestToolData | null = null;
    ParameterConfigs: ParameterConfig[] = [];
    ParameterValues: Record<string, unknown> = {};

    /** Execution state */
    IsExecuting = false;
    ExecutionResult: ToolExecutionResult | null = null;
    ExecutionError: string | null = null;

    /** User settings key prefix */
    private readonly SETTINGS_PREFIX = 'mcp-tool-test/';

    private destroy$ = new Subject<void>();
    private gqlProvider = GraphQLDataProvider.Instance;

    constructor(private cdr: ChangeDetectorRef) {}

    ngOnInit(): void {
        // Apply pre-selected values
        if (this.SelectedServerID) {
            this.ServerID = this.SelectedServerID;
            this.onServerChange();
        }
        if (this.SelectedConnectionID) {
            this.ConnectionID = this.SelectedConnectionID;
            this.onConnectionChange();
        }
        if (this.SelectedToolID) {
            this.ToolID = this.SelectedToolID;
        }
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // ========================================
    // Selection Handlers
    // ========================================

    onServerChange(): void {
        // Filter connections by selected server
        if (this.ServerID) {
            this.FilteredConnections = this.Connections.filter(
                c => c.MCPServerID === this.ServerID && c.Status === 'Active'
            );
            // Filter tools by selected server
            this.FilteredTools = this.Tools.filter(
                t => t.MCPServerID === this.ServerID && t.Status === 'Active'
            );
        } else {
            this.FilteredConnections = [];
            this.FilteredTools = [];
        }

        // Reset downstream selections
        this.ConnectionID = null;
        this.ToolID = null;
        this.cdr.detectChanges();
    }

    onConnectionChange(): void {
        // Connection changed - tools are filtered by server, not connection
        this.cdr.detectChanges();
    }

    onToolChange(): void {
        this.cdr.detectChanges();
    }

    /**
     * Can proceed to configuration step
     */
    get CanProceedToConfig(): boolean {
        return this.ServerID != null && this.ConnectionID != null && this.ToolID != null;
    }

    /**
     * Proceed to configuration step
     */
    async proceedToConfig(): Promise<void> {
        if (!this.CanProceedToConfig) return;

        this.SelectedTool = this.Tools.find(t => t.ID === this.ToolID) || null;
        if (!this.SelectedTool) return;

        // Parse input schema and create parameter configs
        this.parseInputSchema();

        // Load cached parameter values
        await this.loadCachedParameters();

        this.CurrentStep = 'configure';
        this.cdr.detectChanges();
    }

    /**
     * Parse the tool's input schema to create parameter configurations
     */
    private parseInputSchema(): void {
        if (!this.SelectedTool?.InputSchema) {
            this.ParameterConfigs = [];
            return;
        }

        try {
            const schema: JsonSchema = JSON.parse(this.SelectedTool.InputSchema);
            const properties = schema.properties || {};
            const required = schema.required || [];

            this.ParameterConfigs = Object.entries(properties).map(([name, prop]) => {
                const propDef = prop as JsonSchemaProperty;
                return {
                    name,
                    type: this.normalizeType(propDef.type),
                    description: propDef.description || '',
                    required: required.includes(name),
                    defaultValue: propDef.default,
                    enumValues: propDef.enum || [],
                    format: propDef.format || null,
                    minimum: propDef.minimum,
                    maximum: propDef.maximum
                };
            });

            // Sort: required first, then alphabetically
            this.ParameterConfigs.sort((a, b) => {
                if (a.required !== b.required) return a.required ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

            // Initialize parameter values with defaults
            this.ParameterValues = {};
            for (const config of this.ParameterConfigs) {
                if (config.defaultValue !== undefined) {
                    this.ParameterValues[config.name] = config.defaultValue;
                } else {
                    this.ParameterValues[config.name] = this.getDefaultForType(config.type);
                }
            }
        } catch (error) {
            console.error('Failed to parse input schema:', error);
            this.ParameterConfigs = [];
        }
    }

    /**
     * Normalize JSON Schema type to string
     */
    private normalizeType(type: string | string[] | undefined): string {
        if (!type) return 'string';
        if (Array.isArray(type)) {
            // Filter out 'null' and take first type
            const nonNull = type.filter(t => t !== 'null');
            return nonNull.length > 0 ? nonNull[0] : 'string';
        }
        return type;
    }

    /**
     * Get default value for a type
     */
    private getDefaultForType(type: string): unknown {
        switch (type) {
            case 'string': return '';
            case 'number':
            case 'integer': return null;
            case 'boolean': return false;
            case 'array': return [];
            case 'object': return {};
            default: return '';
        }
    }

    /**
     * Load cached parameter values from UserInfoEngine
     */
    private async loadCachedParameters(): Promise<void> {
        if (!this.SelectedTool) return;

        const settingKey = this.getSettingKey();
        const engine = UserInfoEngine.Instance;
        const cachedValue = engine.GetSetting(settingKey);

        if (cachedValue) {
            try {
                const cached = JSON.parse(cachedValue);
                // Merge cached values with defaults (cached takes precedence)
                this.ParameterValues = { ...this.ParameterValues, ...cached };
            } catch (error) {
                console.warn('Failed to parse cached parameters:', error);
            }
        }
    }

    /**
     * Save current parameter values to cache
     */
    private async saveCachedParameters(): Promise<void> {
        if (!this.SelectedTool) return;

        const settingKey = this.getSettingKey();
        const engine = UserInfoEngine.Instance;

        try {
            await engine.SetSetting(settingKey, JSON.stringify(this.ParameterValues));
        } catch (error) {
            console.warn('Failed to save cached parameters:', error);
        }
    }

    /**
     * Get the setting key for caching parameters
     */
    private getSettingKey(): string {
        return `${this.SETTINGS_PREFIX}${this.ServerID}/${this.ToolID}`;
    }

    // ========================================
    // Parameter Input Helpers
    // ========================================

    /**
     * Get input type for a parameter
     */
    getInputType(config: ParameterConfig): string {
        if (config.enumValues.length > 0) return 'select';
        if (config.format === 'date') return 'date';
        if (config.format === 'date-time') return 'datetime-local';
        if (config.format === 'email') return 'email';
        if (config.format === 'uri' || config.format === 'url') return 'url';

        switch (config.type) {
            case 'boolean': return 'checkbox';
            case 'integer':
            case 'number': return 'number';
            case 'array':
            case 'object': return 'textarea';
            default: return 'text';
        }
    }

    /**
     * Check if parameter should use textarea
     */
    isTextarea(config: ParameterConfig): boolean {
        return config.type === 'array' || config.type === 'object' ||
               (config.description != null && config.description.length > 100);
    }

    /**
     * Handle parameter value change
     */
    onParameterChange(name: string, value: unknown): void {
        this.ParameterValues[name] = value;
    }

    /**
     * Get parameter value as string for textarea display
     */
    getTextareaValue(name: string): string {
        const value = this.ParameterValues[name];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value, null, 2);
        return String(value);
    }

    /**
     * Handle textarea change - parse JSON if needed
     */
    onTextareaChange(name: string, value: string, config: ParameterConfig): void {
        if (config.type === 'array' || config.type === 'object') {
            try {
                this.ParameterValues[name] = JSON.parse(value || (config.type === 'array' ? '[]' : '{}'));
            } catch {
                // Keep as string if not valid JSON
                this.ParameterValues[name] = value;
            }
        } else {
            this.ParameterValues[name] = value;
        }
    }

    // ========================================
    // Execution
    // ========================================

    /**
     * Validate that all required parameters have values
     */
    get IsValid(): boolean {
        for (const config of this.ParameterConfigs) {
            if (config.required) {
                const value = this.ParameterValues[config.name];
                if (value === null || value === undefined || value === '') {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Execute the tool
     */
    async executeTool(): Promise<void> {
        if (!this.IsValid || !this.ConnectionID || !this.ToolID) return;

        this.IsExecuting = true;
        this.ExecutionError = null;
        this.cdr.detectChanges();

        // Save parameters before execution
        await this.saveCachedParameters();

        // Build input arguments, filtering out empty optional values
        const inputArgs: Record<string, unknown> = {};
        for (const config of this.ParameterConfigs) {
            const value = this.ParameterValues[config.name];
            if (config.required || (value !== null && value !== undefined && value !== '')) {
                inputArgs[config.name] = value;
            }
        }

        try {
            const result = await this.gqlProvider.ExecuteGQL(ExecuteMCPToolMutation, {
                input: {
                    ConnectionID: this.ConnectionID,
                    ToolID: this.ToolID,
                    ToolName: this.SelectedTool?.ToolName,
                    InputArgs: JSON.stringify(inputArgs)
                }
            });

            this.ExecutionResult = result?.ExecuteMCPTool || {
                Success: false,
                ErrorMessage: 'No result returned from server'
            };

            this.CurrentStep = 'results';
        } catch (error) {
            this.ExecutionError = error instanceof Error ? error.message : String(error);
            this.ExecutionResult = {
                Success: false,
                ErrorMessage: this.ExecutionError
            };
            this.CurrentStep = 'results';
        } finally {
            this.IsExecuting = false;
            this.cdr.detectChanges();
        }
    }

    // ========================================
    // Results Helpers
    // ========================================

    /**
     * Format the result for display
     */
    get FormattedResult(): string {
        if (!this.ExecutionResult?.Result) return '';

        try {
            if (typeof this.ExecutionResult.Result === 'string') {
                // Try to parse as JSON for pretty printing
                const parsed = JSON.parse(this.ExecutionResult.Result);
                return JSON.stringify(parsed, null, 2);
            }
            return JSON.stringify(this.ExecutionResult.Result, null, 2);
        } catch {
            return String(this.ExecutionResult.Result);
        }
    }

    /**
     * Check if result is JSON
     */
    get IsResultJson(): boolean {
        if (!this.ExecutionResult?.Result) return false;
        try {
            if (typeof this.ExecutionResult.Result === 'string') {
                JSON.parse(this.ExecutionResult.Result);
            }
            return typeof this.ExecutionResult.Result === 'object';
        } catch {
            return false;
        }
    }

    /**
     * Copy result to clipboard
     */
    async copyResult(): Promise<void> {
        if (!this.FormattedResult) return;

        try {
            await navigator.clipboard.writeText(this.FormattedResult);
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
        }
    }

    // ========================================
    // Navigation
    // ========================================

    /**
     * Go back to previous step
     */
    goBack(): void {
        if (this.CurrentStep === 'results') {
            this.CurrentStep = 'configure';
        } else if (this.CurrentStep === 'configure') {
            this.CurrentStep = 'select';
        }
        this.cdr.detectChanges();
    }

    /**
     * Run the tool again with same parameters
     */
    async runAgain(): Promise<void> {
        this.CurrentStep = 'configure';
        this.ExecutionResult = null;
        this.ExecutionError = null;
        this.cdr.detectChanges();
    }

    /**
     * Close the dialog
     */
    closeDialog(): void {
        this.Close.emit();
    }

    /**
     * Get display name for selected server
     */
    get SelectedServerName(): string {
        const server = this.Servers.find(s => s.ID === this.ServerID);
        return server?.Name || '';
    }

    /**
     * Get display name for selected connection
     */
    get SelectedConnectionName(): string {
        const connection = this.Connections.find(c => c.ID === this.ConnectionID);
        return connection?.Name || '';
    }

    /**
     * Get display name for selected tool
     */
    get SelectedToolName(): string {
        return this.SelectedTool?.ToolTitle || this.SelectedTool?.ToolName || '';
    }
}

/**
 * Tree-shaking prevention function
 */
export function LoadMCPTestToolDialog(): void {
    // Ensures the component is not tree-shaken
}
