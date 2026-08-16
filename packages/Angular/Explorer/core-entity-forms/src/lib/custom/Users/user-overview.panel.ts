import { Component, ChangeDetectionStrategy, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RunView } from '@memberjunction/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { MJUserEntity } from '@memberjunction/core-entities';

interface UserRoleRow {
    ID: string;
    Role: string;
}

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:Users:overview',
    metadata: {
        entity: 'Users',
        slot: 'before-fields',
        sortKey: 10,
    },
})
@Component({
    selector: 'mj-user-overview-panel',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="mj-user-overview-grid">
            <!-- Card 1: Assigned Roles -->
            <div class="mj-overview-card">
                <div class="mj-card-header">
                    <div class="mj-card-title"><i class="fa-solid fa-shield-halved" style="color: var(--mj-brand-primary, #38bdf8);"></i> Assigned Security Roles</div>
                    <span class="mj-card-badge">{{ Roles.length }} Roles</span>
                </div>
                <div class="mj-card-body">
                    @if (Roles.length === 0) {
                        <span style="font-size: 12px; color: var(--mj-text-muted);">No explicit roles assigned. Default permissions apply.</span>
                    } @else {
                        @for (role of Roles; track role.ID) {
                            <div class="mj-metric-row">
                                <span class="mj-metric-label">{{ role.Role }}</span>
                                <span class="mj-pill mj-pill-purple">Granted</span>
                            </div>
                        }
                    }
                </div>
            </div>

            <!-- Card 2: Account Health & Status -->
            <div class="mj-overview-card">
                <div class="mj-card-header">
                    <div class="mj-card-title"><i class="fa-solid fa-user-check" style="color: #10b981;"></i> Account Health</div>
                    <span class="mj-card-badge">Security</span>
                </div>
                <div class="mj-card-body">
                    <div class="mj-metric-row">
                        <span class="mj-metric-label">Account Active</span>
                        <span class="mj-pill" [class.mj-pill-green]="User?.IsActive" [class.mj-pill-red]="!User?.IsActive">
                            {{ User?.IsActive ? 'Active' : 'Disabled' }}
                        </span>
                    </div>
                    <div class="mj-metric-row">
                        <span class="mj-metric-label">User Type</span>
                        <span class="mj-metric-val">{{ User?.Type || 'Standard User' }}</span>
                    </div>
                </div>
            </div>
        </div>
    `,
    styles: [`
        :host { display: block; width: 100%; margin-bottom: 20px; }
        .mj-user-overview-grid {
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
        .mj-pill-red { background: rgba(244, 63, 94, 0.15); color: #f43f5e; }
        .mj-pill-purple { background: rgba(168, 85, 247, 0.15); color: #c084fc; }
    `]
})
export class UserOverviewPanel extends BaseFormPanel<MJUserEntity> implements OnInit {
    private cdr = inject(ChangeDetectorRef);
    public Roles: UserRoleRow[] = [];

    public get User(): MJUserEntity | null {
        return this.Record;
    }

    public ngOnInit(): void {
        this.LoadUserRoles();
    }

    private async LoadUserRoles(): Promise<void> {
        if (!this.Record?.ID) return;
        try {
            const rv = new RunView();
            const res = await rv.RunView<UserRoleRow>({
                EntityName: 'User Roles',
                ExtraFilter: `UserID = '${this.Record.ID}'`,
                Fields: ['ID', 'Role'],
                MaxRows: 20,
                ResultType: 'simple'
            });
            if (res.Success && res.Results) {
                this.Roles = res.Results;
                this.cdr.markForCheck();
            }
        } catch (e) {
            console.error('Failed to load user roles:', e);
        }
    }
}
