import { Component, ChangeDetectorRef, OnChanges, SimpleChanges } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseConfigDialog } from './base-config-dialog';
import { PanelConfig, QueryPanelConfig, createDefaultQueryPanelConfig } from '../models/dashboard-types';

/**
 * Configuration dialog for Query parts.
 * Allows selecting a query and configuring display options.
 */
@RegisterClass(BaseConfigDialog, 'QueryPanelConfigDialog')
@Component({
    selector: 'mj-query-config-dialog',
    templateUrl: './query-config-dialog.component.html',
    styleUrls: ['./config-dialog.component.css']
})
export class QueryConfigDialogComponent extends BaseConfigDialog implements OnChanges {
    // Form fields
    public title = '';
    public queryId = '';
    public queryName = '';
    public showParameterControls = true;
    public parameterLayout: 'header' | 'sidebar' | 'dialog' = 'header';
    public autoRefreshSeconds = 0;
    public showExecutionMetadata = true;

    // Validation
    public queryError = '';

    constructor(cdr: ChangeDetectorRef) {
        super(cdr);
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['config'] || changes['panel']) {
            this.initFromConfig(this.config);
        }
    }

    public initFromConfig(config: PanelConfig | null): void {
        if (config && config.type === 'Query') {
            const queryConfig = config as QueryPanelConfig;
            this.queryId = queryConfig.queryId || '';
            this.queryName = queryConfig.queryName || '';
            this.showParameterControls = queryConfig.showParameterControls ?? true;
            this.parameterLayout = queryConfig.parameterLayout || 'header';
            this.autoRefreshSeconds = queryConfig.autoRefreshSeconds || 0;
            this.showExecutionMetadata = queryConfig.showExecutionMetadata ?? true;
        } else {
            const defaults = createDefaultQueryPanelConfig();
            this.queryId = '';
            this.queryName = '';
            this.showParameterControls = defaults.showParameterControls;
            this.parameterLayout = defaults.parameterLayout;
            this.autoRefreshSeconds = defaults.autoRefreshSeconds;
            this.showExecutionMetadata = defaults.showExecutionMetadata;
        }

        this.title = this.panel?.title || this.getDefaultTitle();
        this.queryError = '';
        this.cdr.detectChanges();
    }

    public buildConfig(): PanelConfig {
        return {
            type: 'Query',
            queryId: this.queryId.trim() || undefined,
            queryName: this.queryName.trim() || undefined,
            showParameterControls: this.showParameterControls,
            parameterLayout: this.parameterLayout,
            autoRefreshSeconds: this.autoRefreshSeconds,
            showExecutionMetadata: this.showExecutionMetadata
        } as QueryPanelConfig;
    }

    public override validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        this.queryError = '';

        if (!this.queryId.trim() && !this.queryName.trim()) {
            this.queryError = 'Please enter a query ID or query name';
            errors.push(this.queryError);
        }

        this.cdr.detectChanges();
        return { valid: errors.length === 0, errors };
    }

    public getDefaultTitle(): string {
        if (this.queryName) {
            return this.queryName;
        }
        return 'Query';
    }

    protected override getTitle(): string {
        return this.title || this.getDefaultTitle();
    }

    public getParameterLayoutDescription(): string {
        switch (this.parameterLayout) {
            case 'sidebar':
                return 'Parameters displayed in a collapsible sidebar';
            case 'dialog':
                return 'Parameters shown in a popup dialog when needed';
            default:
                return 'Parameters displayed in the header area above results';
        }
    }
}
