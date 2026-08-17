import { Component, ChangeDetectionStrategy, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RunView } from '@memberjunction/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { MJCompanyEntity } from '@memberjunction/core-entities';

interface EmployeeRow {
    ID: string;
    FirstName: string;
    LastName: string;
    Title: string;
}

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Companies:overview',
    metadata: {
        entity: 'Companies',
        slot: 'before-fields',
        sortKey: 10,
    },
})
@Component({
    selector: 'mj-company-overview-panel',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="mj-company-overview-grid">
            <!-- Card 1: Team & Staff -->
            <div class="mj-overview-card">
                <div class="mj-card-header">
                    <div class="mj-card-title"><i class="fa-solid fa-users" style="color: var(--mj-brand-primary, #38bdf8);"></i> Company Team</div>
                    <span class="mj-card-badge">{{ Employees.length }} Members</span>
                </div>
                <div class="mj-card-body">
                    @if (Employees.length === 0) {
                        <span style="font-size: 12px; color: var(--mj-text-muted);">No employees assigned directly to this company.</span>
                    } @else {
                        @for (emp of Employees; track emp.ID) {
                            <div class="mj-metric-row">
                                <span class="mj-metric-label">{{ emp.FirstName }} {{ emp.LastName }}</span>
                                <span class="mj-pill mj-pill-blue">{{ emp.Title || 'Staff' }}</span>
                            </div>
                        }
                    }
                </div>
            </div>

            <!-- Card 2: Company Setup & Profile -->
            <div class="mj-overview-card">
                <div class="mj-card-header">
                    <div class="mj-card-title"><i class="fa-solid fa-building-shield" style="color: #10b981;"></i> Company Governance</div>
                    <span class="mj-card-badge">Profile</span>
                </div>
                <div class="mj-card-body">
                    <div class="mj-metric-row">
                        <span class="mj-metric-label">Company Name</span>
                        <span class="mj-metric-val">{{ Company?.Name }}</span>
                    </div>
                    <div class="mj-metric-row">
                        <span class="mj-metric-label">Website</span>
                        <span class="mj-metric-val">{{ Company?.Website || 'None Listed' }}</span>
                    </div>
                    <div class="mj-metric-row">
                        <span class="mj-metric-label">Record Type</span>
                        <span class="mj-pill mj-pill-green">Corporate Entity</span>
                    </div>
                </div>
            </div>
        </div>
    `,
    styles: [`
        :host { display: block; width: 100%; margin-bottom: 20px; }
        .mj-company-overview-grid {
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
        .mj-pill { font-size: 10.5px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
        .mj-pill-green { background: rgba(16, 185, 129, 0.15); color: #10b981; }
        .mj-pill-blue { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
    `]
})
export class CompanyOverviewPanel extends BaseFormPanel<MJCompanyEntity> implements OnInit {
    private cdr = inject(ChangeDetectorRef);
    public Employees: EmployeeRow[] = [];

    public get Company(): MJCompanyEntity | null {
        return this.Record;
    }

    public ngOnInit(): void {
        this.LoadEmployees();
    }

    private async LoadEmployees(): Promise<void> {
        if (!this.Record?.ID) return;
        try {
            const rv = new RunView();
            const res = await rv.RunView<EmployeeRow>({
                EntityName: 'Employees',
                ExtraFilter: `CompanyID = '${this.Record.ID}'`,
                Fields: ['ID', 'FirstName', 'LastName', 'Title'],
                MaxRows: 20,
                ResultType: 'simple'
            });
            if (res.Success && res.Results) {
                this.Employees = res.Results;
                this.cdr.markForCheck();
            }
        } catch (e) {
            console.error('Failed to load company employees:', e);
        }
    }
}
