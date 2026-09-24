import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { MJCompanyEntity, UserInfoEngine } from '@memberjunction/core-entities';

const SETTING_KEY = 'mj.form.companies.headerCollapsed';

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Companies:header',
    metadata: {
        entity: 'Companies',
        slot: 'header',
        sortKey: 10,
    },
})
@Component({
    selector: 'mj-company-header-panel',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (Company) {
            <div class="mj-entity-hero-header">
                <div class="mj-hero-top">
                    <div class="mj-hero-identity">
                        <div class="mj-hero-avatar" style="background: linear-gradient(135deg, #3b82f6, #1d4ed8);">
                            <i class="fa-solid fa-building-flag"></i>
                        </div>
                        <div>
                            <h1 class="mj-hero-title">{{ Company.Name || 'Operating Company' }}</h1>
                            <div class="mj-hero-subline">
                                @if (Company.Description) {
                                    <span>{{ Company.Description }}</span>
                                }
                                @if (Company.Website) {
                                    <span>•</span>
                                    <span>{{ Company.Website }}</span>
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
                            <span class="mj-hero-metric-label">Company ID</span>
                            <span class="mj-hero-metric-val">{{ Company.ID?.substring(0, 8) }}</span>
                        </div>
                        <div class="mj-hero-metric">
                            <span class="mj-hero-metric-label">Corporate Structure</span>
                            <span class="mj-hero-metric-val" style="color: #38bdf8;">Operating Entity</span>
                        </div>
                        @if (Company.Website) {
                            <div class="mj-hero-metric">
                                <span class="mj-hero-metric-label">Website</span>
                                <span class="mj-hero-metric-val">{{ Company.Website }}</span>
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
export class CompanyHeaderPanel extends BaseFormPanel<MJCompanyEntity> {
    public IsCollapsed = false;

    public ngOnInit(): void {
        const raw = UserInfoEngine.Instance.GetSetting(SETTING_KEY);
        if (raw) this.IsCollapsed = raw === 'true';
    }

    public get Company(): MJCompanyEntity | null {
        return this.Record;
    }

    public ToggleCollapsed(): void {
        this.IsCollapsed = !this.IsCollapsed;
        UserInfoEngine.Instance.SetSettingDebounced(SETTING_KEY, String(this.IsCollapsed));
    }
}
