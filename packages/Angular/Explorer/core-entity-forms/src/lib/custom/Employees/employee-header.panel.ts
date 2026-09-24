import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { MJEmployeeEntity, UserInfoEngine } from '@memberjunction/core-entities';

const SETTING_KEY = 'mj.form.employees.headerCollapsed';

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Employees:header',
    metadata: {
        entity: 'Employees',
        slot: 'header',
        sortKey: 10,
    },
})
@Component({
    selector: 'mj-employee-header-panel',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (Employee) {
            <div class="mj-entity-hero-header">
                <div class="mj-hero-top">
                    <div class="mj-hero-identity">
                        <div class="mj-hero-avatar" style="background: linear-gradient(135deg, #10b981, #047857);">
                            <i class="fa-solid fa-id-badge"></i>
                        </div>
                        <div>
                            <h1 class="mj-hero-title">{{ Employee.FirstName }} {{ Employee.LastName }}</h1>
                            <div class="mj-hero-subline">
                                <span>{{ Employee.Title || 'Team Member' }}</span>
                                @if (Employee.Email) {
                                    <span>•</span>
                                    <span>{{ Employee.Email }}</span>
                                }
                            </div>
                        </div>
                    </div>
                    <div class="mj-hero-actions">
                        <button type="button" class="mj-hero-toggle-btn" (click)="ToggleCollapsed()" [title]="IsCollapsed ? 'Expand Header' : 'Collapse Header'">
                            <i class="fa-solid" [class.fa-chevron-up]="!IsCollapsed" [class.fa-chevron-down]="IsCollapsed"></i>
                        </button>
                    </div>
                </div>

                @if (!IsCollapsed) {
                    <div class="mj-hero-metrics-row">
                        <div class="mj-hero-metric">
                            <span class="mj-hero-metric-label">Employee ID</span>
                            <span class="mj-hero-metric-val">{{ Employee.ID?.substring(0, 8) }}</span>
                        </div>
                        <div class="mj-hero-metric">
                            <span class="mj-hero-metric-label">Status</span>
                            <span class="mj-hero-metric-val" style="color: #10b981;">Active</span>
                        </div>
                        @if (Employee.Phone) {
                            <div class="mj-hero-metric">
                                <span class="mj-hero-metric-label">Phone</span>
                                <span class="mj-hero-metric-val">{{ Employee.Phone }}</span>
                            </div>
                        }
                    </div>
                }
            </div>
        }
    `,
    styles: [`
        :host { display: block; width: 100%; }
        .mj-entity-hero-header {
            background: linear-gradient(180deg, var(--mj-bg-surface, #111a2e) 0%, var(--mj-bg-surface-card, #141f36) 100%);
            border-bottom: 1px solid var(--mj-border-default, #223254);
            padding: 16px 24px;
        }
        .mj-hero-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .mj-hero-identity { display: flex; align-items: center; gap: 14px; }
        .mj-hero-avatar {
            width: 44px; height: 44px; border-radius: 10px;
            display: flex; align-items: center; justify-content: center;
            font-size: 18px; color: #fff; flex-shrink: 0;
        }
        .mj-hero-title { font-size: 18px; font-weight: 800; color: var(--mj-text-primary, #f8fafc); }
        .mj-hero-subline { font-size: 12.5px; color: var(--mj-text-secondary, #94a3b8); margin-top: 2px; display: flex; gap: 8px; align-items: center; }
        .mj-hero-toggle-btn {
            background: none; border: 1px solid var(--mj-border-default, #223254);
            color: var(--mj-text-muted, #64748b); border-radius: 6px;
            padding: 6px 10px; cursor: pointer;
        }
        .mj-hero-metrics-row {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 12px; margin-top: 14px; padding-top: 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        .mj-hero-metric { display: flex; flex-direction: column; gap: 2px; }
        .mj-hero-metric-label { font-size: 10.5px; font-weight: 700; color: var(--mj-text-muted, #64748b); text-transform: uppercase; }
        .mj-hero-metric-val { font-size: 14px; font-weight: 700; color: var(--mj-text-primary, #f8fafc); font-family: monospace; }
    `]
})
export class EmployeeHeaderPanel extends BaseFormPanel<MJEmployeeEntity> {
    public IsCollapsed = false;

    public ngOnInit(): void {
        const raw = UserInfoEngine.Instance.GetSetting(SETTING_KEY);
        if (raw) this.IsCollapsed = raw === 'true';
    }

    public get Employee(): MJEmployeeEntity | null {
        return this.Record;
    }

    public ToggleCollapsed(): void {
        this.IsCollapsed = !this.IsCollapsed;
        UserInfoEngine.Instance.SetSettingDebounced(SETTING_KEY, String(this.IsCollapsed));
    }
}
