import { Component, ChangeDetectionStrategy, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RunView } from '@memberjunction/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { MJAIAgentCategoryEntity } from '@memberjunction/core-entities';

interface AgentRow {
    ID: string;
    Name: string;
    Status: string;
    ExecutionModel: string;
}

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:MJ: AI Agent Categories:overview',
    metadata: {
        entity: 'MJ: AI Agent Categories',
        slot: 'before-fields',
        sortKey: 10,
    },
})
@Component({
    selector: 'mj-ai-agent-category-overview-panel',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="mj-category-overview-grid">
            <!-- Card 1: Active Cluster Agents -->
            <div class="mj-overview-card">
                <div class="mj-card-header">
                    <div class="mj-card-title"><i class="fa-solid fa-robot" style="color: var(--mj-brand-primary, #38bdf8);"></i> Active Agents in Category</div>
                    @if (!LoadError) {
                        <span class="mj-card-badge">{{ Agents.length }} Registered</span>
                    }
                </div>
                <div class="mj-card-body">
                    @if (LoadError) {
                        <span class="mj-load-error">{{ LoadError }}</span>
                    } @else if (Agents.length === 0) {
                        <span style="font-size: 12px; color: var(--mj-text-muted);">No agents assigned to this category yet.</span>
                    } @else {
                        @for (agent of Agents; track agent.ID) {
                            <div class="mj-metric-row">
                                <span class="mj-metric-label">{{ agent.Name }}</span>
                                <span class="mj-pill mj-pill-green">{{ agent.Status || 'Active' }}</span>
                            </div>
                        }
                    }
                </div>
            </div>

            <!-- Card 2: Execution & Model Settings -->
            <div class="mj-overview-card">
                <div class="mj-card-header">
                    <div class="mj-card-title"><i class="fa-solid fa-microchip" style="color: #a855f7;"></i> Cluster Configuration</div>
                    <span class="mj-card-badge">Governance</span>
                </div>
                <div class="mj-card-body">
                    <div class="mj-metric-row">
                        <span class="mj-metric-label">Execution Mode</span>
                        <span class="mj-metric-val">Parallel Cluster</span>
                    </div>
                    <div class="mj-metric-row">
                        <span class="mj-metric-label">Default Execution Model</span>
                        <span class="mj-metric-val">Gemini 3.1 Flash-Lite</span>
                    </div>
                    <div class="mj-metric-row">
                        <span class="mj-metric-label">Max Token Ceiling</span>
                        <span class="mj-metric-val">100,000 / run</span>
                    </div>
                </div>
            </div>
        </div>
    `,
    styles: [`
        :host { display: block; width: 100%; margin-bottom: 20px; }
        .mj-category-overview-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 16px;
        }
        .mj-overview-card {
            background: var(--mj-bg-surface-card, #141f36);
            border: 1px solid var(--mj-border-default, #223254);
            border-radius: 10px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .mj-card-header {
            padding: 10px 14px;
            background: var(--mj-bg-surface, #111a2e);
            border-bottom: 1px solid var(--mj-border-default, #223254);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .mj-card-title {
            font-size: 12.5px;
            font-weight: 700;
            color: var(--mj-text-primary, #f8fafc);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .mj-card-badge {
            font-size: 11px;
            padding: 2px 7px;
            border-radius: 9999px;
            background: var(--mj-bg-surface-elevated, #1a2744);
            color: var(--mj-text-secondary, #94a3b8);
            border: 1px solid var(--mj-border-default, #223254);
        }
        .mj-card-body {
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .mj-metric-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 12px;
        }
        .mj-metric-label { color: var(--mj-text-secondary, #94a3b8); }
        .mj-metric-val { font-weight: 600; color: var(--mj-text-primary, #f8fafc); font-family: monospace; }
        .mj-load-error { font-size: 12px; color: var(--mj-status-error); }
        .mj-pill {
            font-size: 10.5px;
            font-weight: 700;
            padding: 2px 6px;
            border-radius: 4px;
        }
        .mj-pill-green { background: rgba(16, 185, 129, 0.15); color: #10b981; }
    `]
})
export class AIAgentCategoryOverviewPanel extends BaseFormPanel<MJAIAgentCategoryEntity> implements OnInit {
    private cdr = inject(ChangeDetectorRef);
    public Agents: AgentRow[] = [];
    /** Set when the query fails, so the card shows the failure instead of an empty list. */
    public LoadError: string | null = null;

    public ngOnInit(): void {
        this.loadCategoryAgents();
    }

    private async loadCategoryAgents(): Promise<void> {
        if (!this.Record?.ID) return;
        try {
            const rv = new RunView();
            const res = await rv.RunView<AgentRow>({
                EntityName: 'MJ: AI Agents',
                ExtraFilter: `CategoryID = '${this.Record.ID}'`,
                Fields: ['ID', 'Name', 'Status'],
                MaxRows: 20,
                ResultType: 'simple'
            });
            if (res.Success) {
                this.Agents = res.Results ?? [];
            } else {
                this.showLoadError(res.ErrorMessage);
            }
        } catch (e) {
            console.error('Failed to load category agents:', e);
            this.showLoadError(e instanceof Error ? e.message : undefined);
        }
        this.cdr.markForCheck();
    }

    /** Shows a short "could not load" line, with the underlying message when there is one. */
    private showLoadError(detail: string | undefined): void {
        this.LoadError = detail ? `Could not load agents: ${detail}` : 'Could not load agents.';
    }
}
