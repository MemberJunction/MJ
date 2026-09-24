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
    public Action: MJActionEntity | null = null;

    /** @deprecated Use {@link Action}. */
    public get action(): MJActionEntity | null {
      return this.Action;
    }
    /** @deprecated Use {@link Action}. */
    public set action(value: MJActionEntity | null) {
      this.Action = value;
    }
    public User: MJUserEntity | null = null;

    /** @deprecated Use {@link User}. */
    public get user(): MJUserEntity | null {
      return this.User;
    }
    /** @deprecated Use {@link User}. */
    public set user(value: MJUserEntity | null) {
      this.User = value;
    }

    // Loading states
    public IsLoadingAction = false;

    /** @deprecated Use {@link IsLoadingAction}. */
    public get isLoadingAction() {
      return this.IsLoadingAction;
    }
    /** @deprecated Use {@link IsLoadingAction}. */
    public set isLoadingAction(value) {
      this.IsLoadingAction = value;
    }
    public IsLoadingUser = false;

    /** @deprecated Use {@link IsLoadingUser}. */
    public get isLoadingUser() {
      return this.IsLoadingUser;
    }
    /** @deprecated Use {@link IsLoadingUser}. */
    public set isLoadingUser(value) {
      this.IsLoadingUser = value;
    }

    // Formatted JSON fields
    public FormattedParams: string = '';

    /** @deprecated Use {@link FormattedParams}. */
    public get formattedParams(): string {
      return this.FormattedParams;
    }
    /** @deprecated Use {@link FormattedParams}. */
    public set formattedParams(value: string) {
      this.FormattedParams = value;
    }
    public FormattedMessage: string = '';

    /** @deprecated Use {@link FormattedMessage}. */
    public get formattedMessage(): string {
      return this.FormattedMessage;
    }
    /** @deprecated Use {@link FormattedMessage}. */
    public set formattedMessage(value: string) {
      this.FormattedMessage = value;
    }

    // Unified parameter display
    public AllParameters: DisplayParameter[] = [];

    /** @deprecated Use {@link AllParameters}. */
    public get allParameters(): DisplayParameter[] {
      return this.AllParameters;
    }
    /** @deprecated Use {@link AllParameters}. */
    public set allParameters(value: DisplayParameter[]) {
      this.AllParameters = value;
    }
    public ParamCounts: Record<TypeFilter, number> = { All: 0, Input: 0, Output: 0, Both: 0 };

    /** @deprecated Use {@link ParamCounts}. */
    public get paramCounts(): Record<TypeFilter, number> {
      return this.ParamCounts;
    }
    /** @deprecated Use {@link ParamCounts}. */
    public set paramCounts(value: Record<TypeFilter, number>) {
      this.ParamCounts = value;
    }
    public HasAnyParameters = false;

    /** @deprecated Use {@link HasAnyParameters}. */
    public get hasAnyParameters() {
      return this.HasAnyParameters;
    }
    /** @deprecated Use {@link HasAnyParameters}. */
    public set hasAnyParameters(value) {
      this.HasAnyParameters = value;
    }

    // Filter / sort / view state
    public TypeFilter: TypeFilter = 'All';

    /** @deprecated Use {@link TypeFilter}. */
    public get typeFilter(): TypeFilter {
      return this.TypeFilter;
    }
    /** @deprecated Use {@link TypeFilter}. */
    public set typeFilter(value: TypeFilter) {
      this.TypeFilter = value;
    }
    public SearchText: string = '';

    /** @deprecated Use {@link SearchText}. */
    public get searchText(): string {
      return this.SearchText;
    }
    /** @deprecated Use {@link SearchText}. */
    public set searchText(value: string) {
      this.SearchText = value;
    }
    public SortKey: SortKey = 'type';

    /** @deprecated Use {@link SortKey}. */
    public get sortKey(): SortKey {
      return this.SortKey;
    }
    /** @deprecated Use {@link SortKey}. */
    public set sortKey(value: SortKey) {
      this.SortKey = value;
    }
    public SortDir: SortDir = 'asc';

    /** @deprecated Use {@link SortDir}. */
    public get sortDir(): SortDir {
      return this.SortDir;
    }
    /** @deprecated Use {@link SortDir}. */
    public set sortDir(value: SortDir) {
      this.SortDir = value;
    }
    public ShowRawJson: boolean = false;

    /** @deprecated Use {@link ShowRawJson}. */
    public get showRawJson(): boolean {
      return this.ShowRawJson;
    }
    /** @deprecated Use {@link ShowRawJson}. */
    public set showRawJson(value: boolean) {
      this.ShowRawJson = value;
    }

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
        
        this.IsLoadingAction = true;
        try {
            const md = this.ProviderToUse;
            this.Action = await md.GetEntityObject<MJActionEntity>('MJ: Actions');
            if (this.Action) {
                await this.Action.Load(this.record.ActionID);
            }
        } catch (error) {
            console.error('Error loading action:', error);
        } finally {
            this.IsLoadingAction = false;
        }
    }

    private async loadUser() {
        if (!this.record.UserID) return;
        
        this.IsLoadingUser = true;
        try {
            const md = this.ProviderToUse;
            this.User = await md.GetEntityObject<MJUserEntity>('MJ: Users');
            if (this.User) {
                await this.User.Load(this.record.UserID);
            }
        } catch (error) {
            console.error('Error loading user:', error);
        } finally {
            this.IsLoadingUser = false;
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
                this.FormattedParams = JSON.stringify(recursivelyParsed, null, 2);

                if (Array.isArray(recursivelyParsed)) {
                    this.buildDisplayParameters(recursivelyParsed as ActionParameter[]);
                }
            } catch (e) {
                this.FormattedParams = this.record.Params;
            }
        }

        // Format Message field with recursive JSON parsing
        if (this.record.Message) {
            try {
                const parsed = JSON.parse(this.record.Message);
                const recursivelyParsed = ParseJSONRecursive(parsed, parseOptions);
                this.FormattedMessage = JSON.stringify(recursivelyParsed, null, 2);
            } catch (e) {
                this.FormattedMessage = this.record.Message;
            }
        }
    }

    /**
     * Build the unified parameter display list once, so filtering/sorting can
     * operate on a cheap, pre-computed structure.
     */
    private buildDisplayParameters(params: ActionParameter[]) {
        this.ParamCounts = { All: 0, Input: 0, Output: 0, Both: 0 };
        this.AllParameters = params
            .filter((p) => p && typeof p.Name === 'string')
            .map((p) => {
                const valueKind = this.detectValueKind(p.Value);
                const isExpandable = valueKind === 'array' || valueKind === 'object';
                this.ParamCounts.All += 1;
                if (p.Type === 'Input' || p.Type === 'Output' || p.Type === 'Both') {
                    this.ParamCounts[p.Type] += 1;
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
        this.HasAnyParameters = this.AllParameters.length > 0;
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

    public get FilteredParameters(): DisplayParameter[] {
        const needle = this.SearchText.trim().toLowerCase();
        let list = this.AllParameters;
        if (this.TypeFilter !== 'All') {
            list = list.filter((p) => p.Type === this.TypeFilter);
        }
        if (needle) {
            list = list.filter(
                (p) =>
                    p.Name.toLowerCase().includes(needle) ||
                    (p.Preview && p.Preview.toLowerCase().includes(needle))
            );
        }
        const typeOrder: Record<ParamType, number> = { Input: 0, Both: 1, Output: 2 };
        const dirMult = this.SortDir === 'asc' ? 1 : -1;
        return [...list].sort((a, b) => {
            if (this.SortKey === 'name') {
                return dirMult * a.Name.localeCompare(b.Name, undefined, { sensitivity: 'base' });
            }
            const typeCmp = typeOrder[a.Type] - typeOrder[b.Type];
            if (typeCmp !== 0) return dirMult * typeCmp;
            return a.Name.localeCompare(b.Name, undefined, { sensitivity: 'base' });
        });
    }

    /** @deprecated Use {@link FilteredParameters}. */
    public get filteredParameters(): DisplayParameter[] {
      return this.FilteredParameters;
    }

    public SetTypeFilter(filter: TypeFilter): void {
        this.TypeFilter = filter;
    }

    /** @deprecated Use {@link SetTypeFilter}. */
    public setTypeFilter(filter: TypeFilter): void {
      return this.SetTypeFilter(filter);
    }

    public ToggleSort(key: SortKey): void {
        if (this.SortKey === key) {
            this.SortDir = this.SortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.SortKey = key;
            this.SortDir = 'asc';
        }
    }

    /** @deprecated Use {@link ToggleSort}. */
    public toggleSort(key: SortKey): void {
      return this.ToggleSort(key);
    }

    public ToggleExpanded(param: DisplayParameter): void {
        if (!param.IsExpandable) return;
        param.Expanded = !param.Expanded;
    }

    /** @deprecated Use {@link ToggleExpanded}. */
    public toggleExpanded(param: DisplayParameter): void {
      return this.ToggleExpanded(param);
    }

    public ToggleRawJson(): void {
        this.ShowRawJson = !this.ShowRawJson;
    }

    /** @deprecated Use {@link ToggleRawJson}. */
    public toggleRawJson(): void {
      return this.ToggleRawJson();
    }

    public ClearFilters(): void {
        this.TypeFilter = 'All';
        this.SearchText = '';
    }

    /** @deprecated Use {@link ClearFilters}. */
    public clearFilters(): void {
      return this.ClearFilters();
    }

    public TrackParam(_index: number, p: DisplayParameter): string {
        return `${p.Type}::${p.Name}`;
    }

    /** @deprecated Use {@link TrackParam}. */
    public trackParam(_index: number, p: DisplayParameter): string {
      return this.TrackParam(_index, p);
    }

    public CopyParamValue(param: DisplayParameter): void {
        const text = param.IsExpandable
            ? param.FormattedValue
            : this.formatScalarForCopy(param.Value);
        void this.CopyToClipboard(text);
    }

    /** @deprecated Use {@link CopyParamValue}. */
    public copyParamValue(param: DisplayParameter): void {
      return this.CopyParamValue(param);
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
    public GetValueKindIcon(kind: DisplayParameter['ValueKind']): string {
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

    /** @deprecated Use {@link GetValueKindIcon}. */
    public getValueKindIcon(kind: DisplayParameter['ValueKind']): string {
      return this.GetValueKindIcon(kind);
    }

    public GetTypeLabel(type: ParamType): string {
        return type === 'Both' ? 'In/Out' : type;
    }

    /** @deprecated Use {@link GetTypeLabel}. */
    public getTypeLabel(type: ParamType): string {
      return this.GetTypeLabel(type);
    }

    // Navigation
    NavigateToEntity(entityName: string, recordId: string | null) {
        if (!recordId) return;
        SharedService.Instance.OpenEntityRecord(entityName, CompositeKey.FromURLSegment(this.ProviderToUse.EntityByName(entityName), recordId));
    }

    /** @deprecated Use {@link NavigateToEntity}. */
    navigateToEntity(entityName: string, recordId: string | null) {
      return this.NavigateToEntity(entityName, recordId);
    }

    NavigateToAction() {
        if (this.record.ActionID) {
            this.NavigateToEntity('MJ: Actions', this.record.ActionID);
        }
    }

    /** @deprecated Use {@link NavigateToAction}. */
    navigateToAction() {
      return this.NavigateToAction();
    }

    NavigateToUser() {
        if (this.record.UserID) {
            this.NavigateToEntity('MJ: Users', this.record.UserID);
        }
    }

    /** @deprecated Use {@link NavigateToUser}. */
    navigateToUser() {
      return this.NavigateToUser();
    }

    // UI Helpers
    GetExecutionDuration(): number {
        if (!this.record.StartedAt || !this.record.EndedAt) return 0;
        return new Date(this.record.EndedAt).getTime() - new Date(this.record.StartedAt).getTime();
    }

    /** @deprecated Use {@link GetExecutionDuration}. */
    getExecutionDuration(): number {
      return this.GetExecutionDuration();
    }

    formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
        return `${(ms / 3600000).toFixed(1)}h`;
    }

    GetResultCodeColor(): string {
        const code = this.record.ResultCode?.toLowerCase();
        if (code === 'success' || code === 'ok' || code === 'completed' || code === '200') {
            return 'var(--mj-status-success)';
        }
        return 'var(--mj-status-error)';
    }

    /** @deprecated Use {@link GetResultCodeColor}. */
    getResultCodeColor(): string {
      return this.GetResultCodeColor();
    }

    GetResultCodeIcon(): string {
        const code = this.record.ResultCode?.toLowerCase();
        if (code === 'success' || code === 'ok' || code === 'completed' || code === '200') {
            return 'fa-check-circle';
        }
        return 'fa-times-circle';
    }

    /** @deprecated Use {@link GetResultCodeIcon}. */
    getResultCodeIcon(): string {
      return this.GetResultCodeIcon();
    }

    // Save handlers for JSON fields
    async SaveParams() {
        if (!this.EditMode) return;
        
        try {
            // Validate JSON
            JSON.parse(this.FormattedParams);
            this.record.Params = this.FormattedParams;
            await this.record.Save();
        } catch (e) {
            console.error('Invalid JSON in Params field:', e);
            // Could show notification here
        }
    }

    /** @deprecated Use {@link SaveParams}. */
    async saveParams() {
      return this.SaveParams();
    }

    async SaveMessage() {
        if (!this.EditMode) return;
        
        try {
            // Validate JSON
            JSON.parse(this.FormattedMessage);
            this.record.Message = this.FormattedMessage;
            await this.record.Save();
        } catch (e) {
            console.error('Invalid JSON in Message field:', e);
            // Could show notification here
        }
    }

    /** @deprecated Use {@link SaveMessage}. */
    async saveMessage() {
      return this.SaveMessage();
    }
    
    async CopyToClipboard(text: string) {
        try {
            await navigator.clipboard.writeText(text);
            // Could show a toast notification here
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
        }
    }

    /** @deprecated Use {@link CopyToClipboard}. */
    async copyToClipboard(text: string) {
      return this.CopyToClipboard(text);
    }
}
