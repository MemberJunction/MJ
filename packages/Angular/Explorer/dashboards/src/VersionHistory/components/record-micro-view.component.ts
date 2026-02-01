import { Component, Input, Output, EventEmitter, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { RunView, Metadata, EntityInfo } from '@memberjunction/core';
import { MicroViewData } from './label-detail-panel.component';

interface FieldDisplay {
    Name: string;
    Value: string;
    Type: string;
    Description: string;
    DiffClass: string;
    OldValue: string;
}

interface RecordChangeSimple {
    FullRecordJSON: string;
}

@Component({
    selector: 'mj-record-micro-view',
    templateUrl: './record-micro-view.component.html',
    styleUrls: ['./record-micro-view.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecordMicroViewComponent implements OnInit {
    @Input() Data!: MicroViewData;
    @Input() Inline = false;
    @Output() Close = new EventEmitter<void>();

    public IsLoading = true;
    public IsVisible = false;
    public Fields: FieldDisplay[] = [];
    public ErrorMessage = '';

    private metadata = new Metadata();

    constructor(private cdr: ChangeDetectorRef) {}

    ngOnInit(): void {
        if (this.Inline) {
            // No animation needed for inline mode
            this.IsVisible = true;
        } else {
            Promise.resolve().then(() => {
                this.IsVisible = true;
                this.cdr.markForCheck();
            });
        }
        this.loadRecordData();
    }

    @HostListener('document:keydown.escape')
    public OnEscapeKey(): void {
        // Only handle escape in overlay mode; parent handles it in inline mode
        if (!this.Inline) {
            this.OnClose();
        }
    }

    public OnClose(): void {
        if (this.Inline) {
            // Inline mode: emit immediately, no animation
            this.Close.emit();
        } else {
            this.IsVisible = false;
            this.cdr.markForCheck();
            setTimeout(() => this.Close.emit(), 250);
        }
    }

    private async loadRecordData(): Promise<void> {
        this.IsLoading = true;
        this.cdr.markForCheck();

        try {
            let recordData = this.Data.FullRecordJSON;

            // Load from RecordChange if not provided
            if (!recordData && this.Data.RecordChangeID) {
                recordData = await this.loadRecordChangeJson(this.Data.RecordChangeID);
            }

            if (recordData) {
                this.Fields = this.buildFieldList(recordData);
            } else {
                this.ErrorMessage = 'Unable to load record data.';
            }
        } catch (e) {
            this.ErrorMessage = e instanceof Error ? e.message : 'Failed to load record data.';
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    private async loadRecordChangeJson(changeId: string): Promise<Record<string, unknown> | null> {
        const rv = new RunView();
        const result = await rv.RunView<RecordChangeSimple>({
            EntityName: 'Record Changes',
            ExtraFilter: `ID = '${changeId}'`,
            Fields: ['FullRecordJSON'],
            ResultType: 'simple'
        });

        if (result.Success && result.Results.length > 0) {
            const json = result.Results[0].FullRecordJSON;
            if (json) {
                return JSON.parse(json) as Record<string, unknown>;
            }
        }
        return null;
    }

    private buildFieldList(data: Record<string, unknown>): FieldDisplay[] {
        const entityInfo = this.findEntityInfo();
        const diffMap = this.buildDiffMap();
        const fields: FieldDisplay[] = [];

        for (const [key, value] of Object.entries(data)) {
            // Skip MJ system fields
            if (key.startsWith('__mj_')) continue;

            const fieldMeta = entityInfo?.Fields.find(f => f.Name === key);
            const diff = diffMap.get(key);

            fields.push({
                Name: key,
                Value: this.formatValue(value),
                Type: fieldMeta?.Type ?? this.inferType(value),
                Description: fieldMeta?.Description ?? '',
                DiffClass: diff?.ChangeType ? `diff-${diff.ChangeType.toLowerCase()}` : '',
                OldValue: diff?.OldValue ?? ''
            });
        }

        // Sort: ID fields first, then alphabetically
        return fields.sort((a, b) => {
            if (a.Name === 'ID') return -1;
            if (b.Name === 'ID') return 1;
            if (a.Name.endsWith('ID') && !b.Name.endsWith('ID')) return -1;
            if (!a.Name.endsWith('ID') && b.Name.endsWith('ID')) return 1;
            return a.Name.localeCompare(b.Name);
        });
    }

    private findEntityInfo(): EntityInfo | undefined {
        if (this.Data.EntityName && this.Data.EntityName !== 'Unknown') {
            return this.metadata.Entities.find(e => e.Name === this.Data.EntityName);
        }
        if (this.Data.EntityID) {
            return this.metadata.Entities.find(e => e.ID === this.Data.EntityID);
        }
        return undefined;
    }

    private buildDiffMap(): Map<string, { ChangeType: string; OldValue: string }> {
        const map = new Map<string, { ChangeType: string; OldValue: string }>();
        if (this.Data.FieldDiffs) {
            for (const diff of this.Data.FieldDiffs) {
                map.set(diff.FieldName, { ChangeType: diff.ChangeType, OldValue: diff.OldValue });
            }
        }
        return map;
    }

    private formatValue(value: unknown): string {
        if (value == null) return 'null';
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        if (typeof value === 'number') return String(value);
        if (typeof value === 'string') {
            // Check if it looks like a date
            if (this.isDateString(value)) {
                return this.formatDate(value);
            }
            // Truncate very long strings
            if (value.length > 200) {
                return value.substring(0, 200) + '...';
            }
            return value;
        }
        if (typeof value === 'object') {
            return JSON.stringify(value, null, 2);
        }
        return String(value);
    }

    private isDateString(value: string): boolean {
        // ISO date pattern
        return /^\d{4}-\d{2}-\d{2}T/.test(value);
    }

    private formatDate(value: string): string {
        try {
            const d = new Date(value);
            return d.toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch {
            return value;
        }
    }

    private inferType(value: unknown): string {
        if (value == null) return 'null';
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'number') return 'number';
        if (typeof value === 'string') {
            if (this.isDateString(value)) return 'datetime';
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return 'uniqueidentifier';
            return 'string';
        }
        return 'object';
    }

    public GetTypeIcon(type: string): string {
        const icons: Record<string, string> = {
            'uniqueidentifier': 'fa-solid fa-fingerprint',
            'datetime': 'fa-solid fa-calendar',
            'boolean': 'fa-solid fa-toggle-on',
            'number': 'fa-solid fa-hashtag',
            'string': 'fa-solid fa-font',
            'object': 'fa-solid fa-brackets-curly',
            'null': 'fa-solid fa-circle-xmark'
        };
        return icons[type.toLowerCase()] ?? 'fa-solid fa-font';
    }

    public get HasDiffs(): boolean {
        return this.Data.FieldDiffs != null && this.Data.FieldDiffs.length > 0;
    }
}
