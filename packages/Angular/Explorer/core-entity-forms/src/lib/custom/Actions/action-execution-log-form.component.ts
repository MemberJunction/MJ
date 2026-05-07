import { Component, OnInit } from '@angular/core';
import { MJActionExecutionLogEntity, MJActionEntity, MJUserEntity } from '@memberjunction/core-entities';
import { RegisterClass, ParseJSONRecursive, ParseJSONOptions } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { SharedService } from '@memberjunction/ng-shared';
import { Metadata, CompositeKey } from '@memberjunction/core';
import { MJActionExecutionLogFormComponent } from '../../generated/Entities/MJActionExecutionLog/mjactionexecutionlog.form.component';

type ParamType = 'Input' | 'Output' | 'Both';
type TypeFilter = 'All' | ParamType;
type SortKey = 'name' | 'type';
type SortDir = 'asc' | 'desc';

interface ActionParameter {
    Name: string;
    Value: unknown;
    Type: ParamType;
}

interface DisplayParameter extends ActionParameter {
    ValueKind: 'string' | 'number' | 'boolean' | 'null' | 'undefined' | 'array' | 'object';
    Preview: string;
    IsExpandable: boolean;
    Expanded: boolean;
    FormattedValue: string;
}

@RegisterClass(BaseFormComponent, 'MJ: Action Execution Logs')
@Component({
  standalone: false,
    selector: 'mj-action-execution-log-form',
    templateUrl: './action-execution-log-form.component.html',
    styleUrls: ['./action-execution-log-form.component.css']
})
export class MJActionExecutionLogFormComponentExtended extends MJActionExecutionLogFormComponent implements OnInit {
    public record!: MJActionExecutionLogEntity;

    // Related entities
    public action: MJActionEntity | null = null;
    public user: MJUserEntity | null = null;

    // Loading states
    public isLoadingAction = false;
    public isLoadingUser = false;

    // Formatted JSON fields
    public formattedParams: string = '';
    public formattedMessage: string = '';

    // Unified parameter display
    public allParameters: DisplayParameter[] = [];
    public paramCounts: Record<TypeFilter, number> = { All: 0, Input: 0, Output: 0, Both: 0 };
    public hasAnyParameters = false;

    // Filter / sort / view state
    public typeFilter: TypeFilter = 'All';
    public searchText: string = '';
    public sortKey: SortKey = 'type';
    public sortDir: SortDir = 'asc';
    public showRawJson: boolean = false;

    async ngOnInit() {
        await super.ngOnInit();
        
        if (this.record?.IsSaved) {
            // Load related data
            await Promise.all([
                this.loadAction(),
                this.loadUser()
            ]);
            
            // Format JSON fields
            this.formatJSONFields();
            this.cdr.detectChanges();
        }
    }

    private async loadAction() {
        if (!this.record.ActionID) return;
        
        this.isLoadingAction = true;
        try {
            const md = this.ProviderToUse;
            this.action = await md.GetEntityObject<MJActionEntity>('MJ: Actions');
            if (this.action) {
                await this.action.Load(this.record.ActionID);
            }
        } catch (error) {
            console.error('Error loading action:', error);
        } finally {
            this.isLoadingAction = false;
        }
    }

    private async loadUser() {
        if (!this.record.UserID) return;
        
        this.isLoadingUser = true;
        try {
            const md = this.ProviderToUse;
            this.user = await md.GetEntityObject<MJUserEntity>('MJ: Users');
            if (this.user) {
                await this.user.Load(this.record.UserID);
            }
        } catch (error) {
            console.error('Error loading user:', error);
        } finally {
            this.isLoadingUser = false;
        }
    }

    private formatJSONFields() {
        const parseOptions: ParseJSONOptions = {
            extractInlineJson: true,
            maxDepth: 100,
            debug: false
        };

        // Format Params with recursive JSON parsing
        if (this.record.Params) {
            try {
                const parsed = JSON.parse(this.record.Params);
                const recursivelyParsed = ParseJSONRecursive(parsed, parseOptions);
                this.formattedParams = JSON.stringify(recursivelyParsed, null, 2);

                if (Array.isArray(recursivelyParsed)) {
                    this.buildDisplayParameters(recursivelyParsed as ActionParameter[]);
                }
            } catch (e) {
                this.formattedParams = this.record.Params;
            }
        }

        // Format Message field with recursive JSON parsing
        if (this.record.Message) {
            try {
                const parsed = JSON.parse(this.record.Message);
                const recursivelyParsed = ParseJSONRecursive(parsed, parseOptions);
                this.formattedMessage = JSON.stringify(recursivelyParsed, null, 2);
            } catch (e) {
                this.formattedMessage = this.record.Message;
            }
        }
    }

    /**
     * Build the unified parameter display list once, so filtering/sorting can
     * operate on a cheap, pre-computed structure.
     */
    private buildDisplayParameters(params: ActionParameter[]) {
        this.paramCounts = { All: 0, Input: 0, Output: 0, Both: 0 };
        this.allParameters = params
            .filter((p) => p && typeof p.Name === 'string')
            .map((p) => {
                const valueKind = this.detectValueKind(p.Value);
                const isExpandable = valueKind === 'array' || valueKind === 'object';
                this.paramCounts.All += 1;
                if (p.Type === 'Input' || p.Type === 'Output' || p.Type === 'Both') {
                    this.paramCounts[p.Type] += 1;
                }
                return {
                    Name: p.Name,
                    Value: p.Value,
                    Type: p.Type,
                    ValueKind: valueKind,
                    Preview: this.buildPreview(p.Value, valueKind),
                    IsExpandable: isExpandable,
                    Expanded: false,
                    FormattedValue: isExpandable ? JSON.stringify(p.Value, null, 2) : ''
                };
            });
        this.hasAnyParameters = this.allParameters.length > 0;
    }

    private detectValueKind(value: unknown): DisplayParameter['ValueKind'] {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (Array.isArray(value)) return 'array';
        const t = typeof value;
        if (t === 'string' || t === 'number' || t === 'boolean') return t;
        if (t === 'object') return 'object';
        return 'string';
    }

    /**
     * Short inline preview for the row header. Objects/arrays get a compact
     * one-liner; expansion reveals the full formatted JSON below.
     */
    private buildPreview(value: unknown, kind: DisplayParameter['ValueKind']): string {
        switch (kind) {
            case 'null': return 'null';
            case 'undefined': return 'undefined';
            case 'boolean': return value ? 'true' : 'false';
            case 'number': return String(value);
            case 'string': {
                const s = value as string;
                return s.length > 160 ? `"${s.slice(0, 157)}…"` : `"${s}"`;
            }
            case 'array': {
                const arr = value as unknown[];
                if (arr.length === 0) return '[]';
                if (arr.length <= 5 && arr.every((v) => v === null || typeof v !== 'object')) {
                    return `[${arr.map((v) => this.buildPreview(v, this.detectValueKind(v))).join(', ')}]`;
                }
                return `Array(${arr.length})`;
            }
            case 'object': {
                const obj = value as Record<string, unknown>;
                const keys = Object.keys(obj);
                if (keys.length === 0) return '{}';
                const head = keys.slice(0, 3).join(', ');
                return keys.length <= 3 ? `{ ${head} }` : `{ ${head}, …+${keys.length - 3} }`;
            }
        }
    }

    // --- Filter / sort / view helpers (invoked from template) ----------------

    public get filteredParameters(): DisplayParameter[] {
        const needle = this.searchText.trim().toLowerCase();
        let list = this.allParameters;
        if (this.typeFilter !== 'All') {
            list = list.filter((p) => p.Type === this.typeFilter);
        }
        if (needle) {
            list = list.filter(
                (p) =>
                    p.Name.toLowerCase().includes(needle) ||
                    (p.Preview && p.Preview.toLowerCase().includes(needle))
            );
        }
        const typeOrder: Record<ParamType, number> = { Input: 0, Both: 1, Output: 2 };
        const dirMult = this.sortDir === 'asc' ? 1 : -1;
        return [...list].sort((a, b) => {
            if (this.sortKey === 'name') {
                return dirMult * a.Name.localeCompare(b.Name, undefined, { sensitivity: 'base' });
            }
            const typeCmp = typeOrder[a.Type] - typeOrder[b.Type];
            if (typeCmp !== 0) return dirMult * typeCmp;
            return a.Name.localeCompare(b.Name, undefined, { sensitivity: 'base' });
        });
    }

    public setTypeFilter(filter: TypeFilter): void {
        this.typeFilter = filter;
    }

    public toggleSort(key: SortKey): void {
        if (this.sortKey === key) {
            this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortKey = key;
            this.sortDir = 'asc';
        }
    }

    public toggleExpanded(param: DisplayParameter): void {
        if (!param.IsExpandable) return;
        param.Expanded = !param.Expanded;
    }

    public toggleRawJson(): void {
        this.showRawJson = !this.showRawJson;
    }

    public clearFilters(): void {
        this.typeFilter = 'All';
        this.searchText = '';
    }

    public trackParam(_index: number, p: DisplayParameter): string {
        return `${p.Type}::${p.Name}`;
    }

    public copyParamValue(param: DisplayParameter): void {
        const text = param.IsExpandable
            ? param.FormattedValue
            : this.formatScalarForCopy(param.Value);
        void this.copyToClipboard(text);
    }

    private formatScalarForCopy(value: unknown): string {
        if (value === null) return 'null';
        if (value === undefined) return '';
        if (typeof value === 'string') return value;
        return String(value);
    }

    /**
     * Returns the icon class for a value kind — rendered to the left of each
     * preview so object/array/scalar rows are visually distinct at a glance.
     */
    public getValueKindIcon(kind: DisplayParameter['ValueKind']): string {
        switch (kind) {
            case 'string': return 'fa-quote-right';
            case 'number': return 'fa-hashtag';
            case 'boolean': return 'fa-toggle-on';
            case 'array': return 'fa-list-ol';
            case 'object': return 'fa-code';
            case 'null': return 'fa-circle-minus';
            case 'undefined': return 'fa-ban';
        }
    }

    public getTypeLabel(type: ParamType): string {
        return type === 'Both' ? 'In/Out' : type;
    }

    // Navigation
    navigateToEntity(entityName: string, recordId: string | null) {
        if (!recordId) return;
        SharedService.Instance.OpenEntityRecord(entityName, CompositeKey.FromID(recordId));
    }

    navigateToAction() {
        if (this.record.ActionID) {
            this.navigateToEntity('MJ: Actions', this.record.ActionID);
        }
    }

    navigateToUser() {
        if (this.record.UserID) {
            this.navigateToEntity('MJ: Users', this.record.UserID);
        }
    }

    // UI Helpers
    getExecutionDuration(): number {
        if (!this.record.StartedAt || !this.record.EndedAt) return 0;
        return new Date(this.record.EndedAt).getTime() - new Date(this.record.StartedAt).getTime();
    }

    formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
        return `${(ms / 3600000).toFixed(1)}h`;
    }

    getResultCodeColor(): string {
        const code = this.record.ResultCode?.toLowerCase();
        if (code === 'success' || code === 'ok' || code === 'completed' || code === '200') {
            return 'var(--mj-status-success)';
        }
        return 'var(--mj-status-error)';
    }

    getResultCodeIcon(): string {
        const code = this.record.ResultCode?.toLowerCase();
        if (code === 'success' || code === 'ok' || code === 'completed' || code === '200') {
            return 'fa-check-circle';
        }
        return 'fa-times-circle';
    }

    // Save handlers for JSON fields
    async saveParams() {
        if (!this.EditMode) return;
        
        try {
            // Validate JSON
            JSON.parse(this.formattedParams);
            this.record.Params = this.formattedParams;
            await this.record.Save();
        } catch (e) {
            console.error('Invalid JSON in Params field:', e);
            // Could show notification here
        }
    }

    async saveMessage() {
        if (!this.EditMode) return;
        
        try {
            // Validate JSON
            JSON.parse(this.formattedMessage);
            this.record.Message = this.formattedMessage;
            await this.record.Save();
        } catch (e) {
            console.error('Invalid JSON in Message field:', e);
            // Could show notification here
        }
    }
    
    async copyToClipboard(text: string) {
        try {
            await navigator.clipboard.writeText(text);
            // Could show a toast notification here
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
        }
    }
}
