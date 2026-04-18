/**
 * @fileoverview Reusable filter bar for AI Analytics dashboard sections.
 *
 * Provides time-range chips, model/agent/prompt/status dropdowns
 * (using mj-dropdown), a compare toggle, and an optional export button.
 * Each section shows/hides filters via boolean inputs.
 */

import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { GlobalFilterState } from '../../interfaces/analytics-preferences.interface';

interface FilterOption {
    text: string;
    value: string;
    [key: string]: unknown;
}

@Component({
    standalone: false,
    selector: 'app-analytics-filter-bar',
    template: `
        <div class="filter-bar">
            <div class="filter-controls">
                <span class="filter-label">
                    <i class="fa-solid fa-filter"></i>
                    Filters:
                </span>

                @if (ShowModelFilter) {
                    <mj-dropdown
                        [Data]="ModelOptions"
                        TextField="text"
                        ValueField="value"
                        [ValuePrimitive]="true"
                        [DefaultItem]="modelDefaultItem"
                        [Filterable]="ModelOptions.length > 10"
                        Placeholder="All Models"
                        (ValueChange)="OnModelChange($event)">
                    </mj-dropdown>
                }

                @if (ShowAgentFilter) {
                    <mj-dropdown
                        [Data]="AgentOptions"
                        TextField="text"
                        ValueField="value"
                        [ValuePrimitive]="true"
                        [DefaultItem]="agentDefaultItem"
                        [Filterable]="AgentOptions.length > 10"
                        Placeholder="All Agents"
                        (ValueChange)="OnAgentChange($event)">
                    </mj-dropdown>
                }

                @if (ShowPromptFilter) {
                    <mj-dropdown
                        [Data]="PromptOptions"
                        TextField="text"
                        ValueField="value"
                        [ValuePrimitive]="true"
                        [DefaultItem]="promptDefaultItem"
                        [Filterable]="PromptOptions.length > 10"
                        Placeholder="All Prompts"
                        (ValueChange)="OnPromptChange($event)">
                    </mj-dropdown>
                }

                @if (ShowStatusFilter) {
                    <mj-dropdown
                        [Data]="StatusOptions"
                        TextField="text"
                        ValueField="value"
                        [ValuePrimitive]="true"
                        [DefaultItem]="statusDefaultItem"
                        Placeholder="All Statuses"
                        (ValueChange)="OnStatusChange($event)">
                    </mj-dropdown>
                }

                @if (ShowCompareToggle) {
                    <button
                        class="compare-btn"
                        [class.active]="compareActive"
                        (click)="ToggleCompare()">
                        <i class="fa-solid fa-code-compare"></i>
                        Compare
                    </button>
                }

                @if (ShowExportButton) {
                    <button class="export-btn" (click)="ExportClicked.emit()">
                        <i class="fa-solid fa-download"></i>
                        Export
                    </button>
                }
            </div>

            <div class="time-chips">
                @for (option of TimeRangeOptions; track option) {
                    <button
                        class="time-chip"
                        [class.active]="TimeRange === option"
                        (click)="OnTimeRangeSelect(option)">
                        {{ option }}
                    </button>
                }
            </div>
        </div>
    `,
    styles: [`
        .filter-bar {
            display: flex;
            align-items: center;
            gap: 12px;
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: 10px;
            padding: 12px 16px;
            flex-wrap: wrap;
        }

        .filter-controls {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }

        .filter-label {
            font-size: 13px;
            font-weight: 600;
            color: var(--mj-text-secondary);
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .filter-label i {
            font-size: 12px;
            color: var(--mj-text-muted);
        }

        :host ::ng-deep mj-dropdown {
            min-width: 160px;
            max-width: 220px;
        }

        :host ::ng-deep mj-dropdown .mj-dropdown {
            font-size: 13px;
            border-radius: 6px;
        }

        .compare-btn,
        .export-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 5px 12px;
            border: 1px solid var(--mj-border-default);
            border-radius: 6px;
            background: var(--mj-bg-surface);
            color: var(--mj-text-secondary);
            font-size: 13px;
            cursor: pointer;
            white-space: nowrap;
            transition: background 0.15s, color 0.15s, border-color 0.15s;
        }

        .compare-btn:hover,
        .export-btn:hover {
            background: var(--mj-bg-surface-hover);
            color: var(--mj-text-primary);
        }

        .compare-btn.active {
            background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
            color: var(--mj-brand-primary);
            border-color: var(--mj-brand-primary);
        }

        .time-chips {
            display: flex;
            align-items: center;
            gap: 4px;
            margin-left: auto;
        }

        .time-chip {
            padding: 5px 12px;
            border: 1px solid var(--mj-border-default);
            border-radius: 16px;
            background: var(--mj-bg-surface);
            color: var(--mj-text-secondary);
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s, color 0.15s, border-color 0.15s;
            white-space: nowrap;
        }

        .time-chip:hover {
            background: var(--mj-bg-surface-hover);
            color: var(--mj-text-primary);
        }

        .time-chip.active {
            background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
            color: var(--mj-brand-primary);
            border-color: var(--mj-brand-primary);
            font-weight: 600;
        }

        @media (max-width: 768px) {
            .filter-bar {
                flex-direction: column;
                align-items: stretch;
            }

            .time-chips {
                margin-left: 0;
                justify-content: flex-start;
                flex-wrap: wrap;
            }
        }
    `]
})
export class AnalyticsFilterBarComponent implements OnInit {
    @Input() TimeRange = '24h';
    @Input() TimeRangeOptions: string[] = ['1h', '6h', '24h', '7d', '30d'];
    @Input() ShowModelFilter = true;
    @Input() ShowAgentFilter = true;
    @Input() ShowPromptFilter = true;
    @Input() ShowStatusFilter = true;
    @Input() ShowCompareToggle = true;
    @Input() ShowExportButton = false;
    @Input() Filters: GlobalFilterState = { Models: [], Agents: [], Prompts: [], Statuses: [] };

    @Output() TimeRangeChange = new EventEmitter<string>();
    @Output() FiltersChange = new EventEmitter<GlobalFilterState>();
    @Output() CompareToggled = new EventEmitter<boolean>();
    @Output() ExportClicked = new EventEmitter<void>();

    public ModelOptions: FilterOption[] = [];
    public AgentOptions: FilterOption[] = [];
    public PromptOptions: FilterOption[] = [];
    public StatusOptions: FilterOption[] = [
        { text: 'Success', value: 'Success' },
        { text: 'Error', value: 'Error' },
        { text: 'Running', value: 'Running' },
        { text: 'Pending', value: 'Pending' },
        { text: 'Canceled', value: 'Canceled' }
    ];

    /** Default items shown when nothing is selected (the "All X" option) */
    public modelDefaultItem: FilterOption = { text: 'All Models', value: '' };
    public agentDefaultItem: FilterOption = { text: 'All Agents', value: '' };
    public promptDefaultItem: FilterOption = { text: 'All Prompts', value: '' };
    public statusDefaultItem: FilterOption = { text: 'All Statuses', value: '' };

    public compareActive = false;

    ngOnInit(): void {
        this.BuildOptions();
    }

    public OnTimeRangeSelect(range: string): void {
        this.TimeRange = range;
        this.TimeRangeChange.emit(range);
    }

    public OnModelChange(event: unknown): void {
        const id = (event as string) ?? '';
        this.Filters = { ...this.Filters, Models: id ? [id] : [] };
        this.FiltersChange.emit(this.Filters);
    }

    public OnAgentChange(event: unknown): void {
        const id = (event as string) ?? '';
        this.Filters = { ...this.Filters, Agents: id ? [id] : [] };
        this.FiltersChange.emit(this.Filters);
    }

    public OnPromptChange(event: unknown): void {
        const id = (event as string) ?? '';
        this.Filters = { ...this.Filters, Prompts: id ? [id] : [] };
        this.FiltersChange.emit(this.Filters);
    }

    public OnStatusChange(event: unknown): void {
        const status = (event as string) ?? '';
        this.Filters = { ...this.Filters, Statuses: status ? [status] : [] };
        this.FiltersChange.emit(this.Filters);
    }

    public ToggleCompare(): void {
        this.compareActive = !this.compareActive;
        this.CompareToggled.emit(this.compareActive);
    }

    private BuildOptions(): void {
        const engine = AIEngineBase.Instance;

        this.ModelOptions = engine.Models
            .map(m => ({ text: m.Name ?? '', value: m.ID }))
            .sort((a, b) => a.text.localeCompare(b.text));

        this.AgentOptions = engine.Agents
            .filter(a => a.Status === 'Active')
            .map(a => ({ text: a.Name ?? '', value: a.ID }))
            .sort((a, b) => a.text.localeCompare(b.text));

        this.PromptOptions = engine.Prompts
            .map(p => ({ text: p.Name ?? '', value: p.ID }))
            .sort((a, b) => a.text.localeCompare(b.text));
    }
}
