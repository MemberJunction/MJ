import {
    Component,
    EventEmitter,
    Input,
    OnDestroy,
    OnInit,
    Output,
    ChangeDetectorRef,
    inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Metadata, UserRoleInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    MJUserNotificationPreferenceEntity,
    UserInfoEngine
} from '@memberjunction/core-entities';
import { MJAuthBase } from '@memberjunction/ng-auth-services';
import { ThemeService, SharedService, ThemeDefinition } from '@memberjunction/ng-shared';
import { ExplorerSettingsModule } from '@memberjunction/ng-explorer-settings';
import { Subscription } from 'rxjs';

interface NotificationChannel {
    key: 'InApp' | 'Email' | 'SMS';
    label: string;
    icon: string;
    enabled: boolean;
    saving: boolean;
}

type ProfilePanel = 'none' | 'photo' | 'theme';

/**
 * "Identity Card" profile dialog with slide-in detail panels for editing
 * profile photo and switching theme. Replaces the legacy multi-tab Settings
 * dialog entirely. Brand-aligned with the About dialog.
 */
@Component({
    selector: 'mj-profile-dialog',
    standalone: true,
    imports: [CommonModule, ExplorerSettingsModule],
    template: `
<div class="mj-profile" [class.mj-profile--panel-open]="ActivePanel !== 'none'" role="document">
    <button class="mj-profile__close" type="button" aria-label="Close" (click)="OnCloseClick()">
        <i class="fa-solid fa-xmark"></i>
    </button>

    <!-- ===== MAIN VIEW ===== -->
    <div class="mj-profile__main">
        <div class="mj-profile__hero">
            <h3 class="mj-profile__hero-title">My Profile</h3>
        </div>

        <div class="mj-profile__avatar-zone">
            @if (AvatarUrl) {
                <img class="mj-profile__avatar mj-profile__avatar--img"
                     [src]="AvatarUrl" alt="" (error)="OnAvatarLoadError()" />
            } @else if (AvatarIconClass) {
                <div class="mj-profile__avatar mj-profile__avatar--icon">
                    <i [class]="AvatarIconClass"></i>
                </div>
            } @else {
                <div class="mj-profile__avatar">{{ UserInitials }}</div>
            }
            <button class="mj-profile__avatar-edit" type="button" title="Change photo"
                    (click)="OpenPanel('photo')">
                <i class="fa-solid fa-camera"></i>
            </button>
        </div>

        <div class="mj-profile__identity">
            <h2 class="mj-profile__name">{{ UserName }}</h2>
            <p class="mj-profile__email">{{ UserEmail }}</p>
            @if (RoleChips.length > 0) {
                <div class="mj-profile__chips">
                    @for (chip of RoleChips; track chip.label) {
                        <span class="mj-profile__chip" [class]="'mj-profile__chip--' + chip.tone">
                            @if (chip.icon) { <i [class]="chip.icon"></i> }
                            {{ chip.label }}
                        </span>
                    }
                </div>
            }
        </div>

        <div class="mj-profile__field-list">
            <div class="mj-profile__field">
                <div class="mj-profile__field-icon"><i class="fa-solid fa-id-badge"></i></div>
                <div class="mj-profile__field-body">
                    <div class="mj-profile__field-label">Account</div>
                    <div class="mj-profile__field-value">
                        {{ AccountType }} · {{ AccountStatus }}
                        @if (MemberSince) {
                            <span class="mj-profile__field-muted"> · {{ MemberSince }}</span>
                        }
                    </div>
                </div>
            </div>

            <button class="mj-profile__field mj-profile__field--button" type="button" (click)="OpenPanel('theme')">
                <div class="mj-profile__field-icon"><i class="fa-solid fa-palette"></i></div>
                <div class="mj-profile__field-body">
                    <div class="mj-profile__field-label">Theme</div>
                    <div class="mj-profile__field-value">{{ ThemeLabel }}</div>
                </div>
                <i class="fa-solid fa-chevron-right mj-profile__field-chev"></i>
            </button>
        </div>

        <div class="mj-profile__section">
            <div class="mj-profile__section-head">
                <h4>Notifications</h4>
                @if (UnreadCount > 0) {
                    <span class="mj-profile__unread">{{ UnreadCount }} unread</span>
                }
            </div>
            @if (LoadingNotifications) {
                <div class="mj-profile__channels-loading">
                    <i class="fa-solid fa-spinner fa-spin"></i> Loading…
                </div>
            } @else {
                <div class="mj-profile__channels">
                    @for (ch of Channels; track ch.key) {
                        <button type="button"
                                class="mj-profile__channel"
                                [class.mj-profile__channel--on]="ch.enabled"
                                [disabled]="ch.saving"
                                (click)="ToggleChannel(ch)">
                            <div class="mj-profile__channel-icon"><i [class]="ch.icon"></i></div>
                            <div class="mj-profile__channel-label">{{ ch.label }}</div>
                            <div class="mj-profile__channel-state">
                                @if (ch.saving) {
                                    <i class="fa-solid fa-spinner fa-spin"></i>
                                } @else {
                                    <span class="mj-profile__switch" [class.mj-profile__switch--on]="ch.enabled">
                                        <span class="mj-profile__switch-knob"></span>
                                    </span>
                                }
                            </div>
                        </button>
                    }
                </div>
            }
        </div>

        <div class="mj-profile__footer">
            <button class="mj-profile__btn mj-profile__btn--danger" type="button" (click)="OnSignOut()">
                <i class="fa-solid fa-arrow-right-from-bracket"></i>
                Sign out
            </button>
            <span class="mj-profile__spacer"></span>
            <button class="mj-profile__btn mj-profile__btn--primary" type="button" (click)="OnCloseClick()">
                Done
            </button>
        </div>
    </div>

    <!-- ===== SLIDE-IN PANEL ===== -->
    <div class="mj-profile__panel" [class.mj-profile__panel--open]="ActivePanel !== 'none'">
        <div class="mj-profile__panel-header">
            <button class="mj-profile__panel-back" type="button" aria-label="Back" (click)="ClosePanel()">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <h3 class="mj-profile__panel-title">{{ PanelTitle }}</h3>
        </div>
        <div class="mj-profile__panel-body">
            @if (ActivePanel === 'photo') {
                <mj-user-profile-settings></mj-user-profile-settings>
            } @else if (ActivePanel === 'theme') {
                <div class="mj-profile__themes">
                    @for (theme of ThemeOptions; track theme.id) {
                        <button type="button"
                                class="mj-profile__theme"
                                [class.mj-profile__theme--active]="theme.id === ThemePreference"
                                [class.mj-profile__theme--saving]="SavingTheme === theme.id"
                                [disabled]="!!SavingTheme"
                                (click)="SelectTheme(theme.id)">
                            <div class="mj-profile__theme-swatch" [class]="'mj-profile__theme-swatch--' + theme.swatch">
                                <i [class]="theme.icon"></i>
                            </div>
                            <div class="mj-profile__theme-info">
                                <div class="mj-profile__theme-name">{{ theme.name }}</div>
                                @if (theme.description) {
                                    <div class="mj-profile__theme-desc">{{ theme.description }}</div>
                                }
                            </div>
                            @if (SavingTheme === theme.id) {
                                <i class="fa-solid fa-spinner fa-spin mj-profile__theme-check"></i>
                            } @else if (theme.id === ThemePreference) {
                                <i class="fa-solid fa-check mj-profile__theme-check"></i>
                            }
                        </button>
                    }
                </div>
            }
        </div>
    </div>
</div>
    `,
    styles: [`
:host {
    display: block;
    width: 100%;
    height: 100%;
}
.mj-profile {
    display: block;
    background: var(--mj-bg-surface);
    color: var(--mj-text-primary);
    height: 100%;
    min-height: 0;
    position: relative;
    font-family: inherit;
    overflow: hidden;
}
.mj-profile__close {
    position: absolute;
    top: 12px; right: 12px;
    width: 36px; height: 36px;
    border: none; border-radius: 8px;
    background: rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(8px);
    color: #fff;
    cursor: pointer;
    font-size: 16px;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, opacity 0.2s;
    z-index: 4;
}
.mj-profile__close:hover { background: rgba(255, 255, 255, 0.3); }
.mj-profile--panel-open .mj-profile__close { opacity: 0; pointer-events: none; }

/* ============ MAIN VIEW ============ */
.mj-profile__main {
    display: flex;
    flex-direction: column;
    height: 100%;
    transition: transform 0.32s cubic-bezier(0.4, 0, 0.2, 1);
}
.mj-profile--panel-open .mj-profile__main {
    transform: translateX(-12%);
    pointer-events: none;
}

.mj-profile__hero {
    background: linear-gradient(135deg, #264FAF 0%, #0076b6 100%);
    color: #fff;
    padding: 22px 24px 56px;
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
}
.mj-profile__hero::before {
    content: '';
    position: absolute;
    inset: -50%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.10) 0%, transparent 60%);
    animation: mj-profile-rotate 24s linear infinite;
    pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
    .mj-profile__hero::before { animation: none; }
}
@keyframes mj-profile-rotate { to { transform: rotate(360deg); } }

.mj-profile__hero-title {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    opacity: 0.85;
    position: relative;
    z-index: 1;
}

.mj-profile__avatar-zone {
    position: relative;
    width: 96px;
    height: 96px;
    margin: -48px auto 12px;
    z-index: 2;
}
.mj-profile__avatar {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    background: linear-gradient(135deg, #264FAF 0%, #0076b6 100%);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    font-weight: 700;
    border: 4px solid var(--mj-bg-surface);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
    object-fit: cover;
    overflow: hidden;
}
img.mj-profile__avatar { background: var(--mj-bg-surface-card); }
.mj-profile__avatar--icon i { font-size: 36px; }

.mj-profile__avatar-edit {
    position: absolute;
    bottom: 2px; right: 2px;
    width: 30px; height: 30px;
    border-radius: 50%;
    background: var(--mj-bg-surface);
    color: var(--mj-brand-primary);
    border: 2px solid var(--mj-bg-surface);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
    transition: transform 0.15s;
}
.mj-profile__avatar-edit:hover { transform: scale(1.1); }

.mj-profile__identity {
    text-align: center;
    padding: 0 24px 16px;
    flex-shrink: 0;
}
.mj-profile__name {
    margin: 0 0 4px;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.4px;
    color: var(--mj-text-primary);
}
.mj-profile__email {
    margin: 0 0 12px;
    color: var(--mj-text-muted);
    font-size: 13px;
    word-break: break-all;
}
.mj-profile__chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
}
.mj-profile__chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 100px;
    font-size: 11px;
    font-weight: 600;
    background: color-mix(in srgb, var(--mj-brand-primary) 12%, transparent);
    color: var(--mj-brand-primary);
}
.mj-profile__chip--admin {
    background: color-mix(in srgb, #f59e0b 14%, transparent);
    color: #b45309;
}
.mj-profile__chip--dev {
    background: color-mix(in srgb, #10b981 14%, transparent);
    color: #047857;
}

.mj-profile__field-list {
    padding: 0 24px;
    flex-shrink: 0;
}
.mj-profile__field {
    display: flex;
    align-items: center;
    padding: 12px 0;
    gap: 14px;
    border-top: 1px solid var(--mj-border-subtle);
    width: 100%;
    text-align: left;
    background: transparent;
    border-left: none;
    border-right: none;
    border-bottom: none;
    font-family: inherit;
    color: inherit;
}
.mj-profile__field:first-child { border-top: none; }
.mj-profile__field--button {
    cursor: pointer;
    transition: background 0.12s;
    margin: 0 -8px;
    padding-left: 8px;
    padding-right: 8px;
    border-radius: 8px;
    border-top: none;
}
.mj-profile__field--button + .mj-profile__field--button { margin-top: 0; }
.mj-profile__field--button:hover { background: var(--mj-bg-surface-hover); }
.mj-profile__field--button:hover .mj-profile__field-chev { color: var(--mj-brand-primary); }
.mj-profile__field-icon {
    width: 32px; height: 32px;
    background: var(--mj-bg-surface-sunken);
    border-radius: 8px;
    color: var(--mj-text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    flex-shrink: 0;
}
.mj-profile__field-body { flex: 1; min-width: 0; }
.mj-profile__field-label {
    font-size: 10.5px;
    color: var(--mj-text-muted);
    text-transform: uppercase;
    font-weight: 600;
    letter-spacing: 0.5px;
}
.mj-profile__field-value {
    font-size: 13px;
    color: var(--mj-text-primary);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.mj-profile__field-muted { color: var(--mj-text-muted); }
.mj-profile__field-chev {
    color: var(--mj-text-muted);
    font-size: 11px;
    transition: color 0.15s;
}

.mj-profile__section {
    padding: 16px 24px 8px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}
.mj-profile__section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
}
.mj-profile__section-head h4 {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    color: var(--mj-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.6px;
}
.mj-profile__unread {
    font-size: 11px;
    font-weight: 600;
    color: var(--mj-brand-primary);
    background: color-mix(in srgb, var(--mj-brand-primary) 10%, transparent);
    padding: 2px 8px;
    border-radius: 100px;
}
.mj-profile__channels-loading {
    color: var(--mj-text-muted);
    font-size: 12.5px;
    padding: 12px;
    text-align: center;
}
.mj-profile__channels {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.mj-profile__channel {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: var(--mj-bg-surface-card);
    border: 1px solid var(--mj-border-subtle);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
    text-align: left;
    width: 100%;
}
.mj-profile__channel:hover:not(:disabled) {
    border-color: var(--mj-border-default);
    background: var(--mj-bg-surface-hover);
}
.mj-profile__channel:disabled { cursor: wait; opacity: 0.7; }
.mj-profile__channel-icon {
    width: 32px; height: 32px;
    border-radius: 8px;
    background: var(--mj-bg-surface-sunken);
    color: var(--mj-text-secondary);
    display: flex; align-items: center; justify-content: center;
    font-size: 13px;
    flex-shrink: 0;
    transition: all 0.15s;
}
.mj-profile__channel--on .mj-profile__channel-icon {
    background: color-mix(in srgb, var(--mj-brand-primary) 14%, transparent);
    color: var(--mj-brand-primary);
}
.mj-profile__channel-label {
    flex: 1;
    font-size: 13.5px;
    font-weight: 500;
    color: var(--mj-text-primary);
}
.mj-profile__channel-state {
    flex-shrink: 0;
    color: var(--mj-text-muted);
    font-size: 13px;
    min-width: 36px;
    display: flex; justify-content: flex-end; align-items: center;
}

.mj-profile__switch {
    width: 36px;
    height: 20px;
    background: var(--mj-border-strong);
    border-radius: 100px;
    position: relative;
    transition: background 0.2s;
    display: inline-block;
}
.mj-profile__switch-knob {
    position: absolute;
    top: 2px; left: 2px;
    width: 16px; height: 16px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}
.mj-profile__switch--on { background: var(--mj-brand-primary); }
.mj-profile__switch--on .mj-profile__switch-knob { transform: translateX(16px); }

.mj-profile__footer {
    border-top: 1px solid var(--mj-border-subtle);
    padding: 14px 20px;
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
}
.mj-profile__spacer { flex: 1; }
.mj-profile__btn {
    padding: 9px 16px;
    border-radius: 8px;
    border: 1px solid var(--mj-border-default);
    background: var(--mj-bg-surface);
    color: var(--mj-text-primary);
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: all 0.15s;
}
.mj-profile__btn:hover { background: var(--mj-bg-surface-hover); border-color: var(--mj-border-strong); }
.mj-profile__btn--primary {
    background: var(--mj-brand-primary);
    color: var(--mj-text-inverse);
    border-color: var(--mj-brand-primary);
}
.mj-profile__btn--primary:hover {
    background: color-mix(in srgb, var(--mj-brand-primary) 88%, black);
    border-color: color-mix(in srgb, var(--mj-brand-primary) 88%, black);
}
.mj-profile__btn--danger {
    color: var(--mj-status-error);
    border-color: color-mix(in srgb, var(--mj-status-error) 30%, var(--mj-border-default));
}
.mj-profile__btn--danger:hover {
    background: color-mix(in srgb, var(--mj-status-error) 8%, transparent);
    border-color: var(--mj-status-error);
}

/* ============ SLIDE-IN PANEL ============ */
.mj-profile__panel {
    position: absolute;
    inset: 0;
    background: var(--mj-bg-surface);
    transform: translateX(100%);
    transition: transform 0.32s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    z-index: 3;
}
.mj-profile__panel--open {
    transform: translateX(0);
    box-shadow: -8px 0 24px rgba(0, 0, 0, 0.06);
}
.mj-profile__panel-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--mj-border-subtle);
    background: var(--mj-bg-surface-card);
    flex-shrink: 0;
}
.mj-profile__panel-back {
    width: 34px; height: 34px;
    border-radius: 8px;
    border: 1px solid var(--mj-border-default);
    background: var(--mj-bg-surface);
    color: var(--mj-text-primary);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px;
    transition: all 0.15s;
    font-family: inherit;
}
.mj-profile__panel-back:hover {
    background: var(--mj-bg-surface-hover);
    border-color: var(--mj-brand-primary);
    color: var(--mj-brand-primary);
}
.mj-profile__panel-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--mj-text-primary);
    letter-spacing: -0.2px;
}
.mj-profile__panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 20px 20px;
}

/* Theme picker */
.mj-profile__themes {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.mj-profile__theme {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 14px;
    background: var(--mj-bg-surface-card);
    border: 1px solid var(--mj-border-subtle);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    width: 100%;
    font-family: inherit;
}
.mj-profile__theme:hover:not(:disabled) {
    border-color: var(--mj-brand-primary);
    background: var(--mj-bg-surface-hover);
}
.mj-profile__theme:disabled { cursor: wait; opacity: 0.7; }
.mj-profile__theme--active {
    border-color: var(--mj-brand-primary);
    background: color-mix(in srgb, var(--mj-brand-primary) 5%, var(--mj-bg-surface-card));
}
.mj-profile__theme-swatch {
    width: 40px; height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
    border: 1px solid var(--mj-border-default);
}
.mj-profile__theme-swatch--light {
    background: linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%);
    color: #f59e0b;
}
.mj-profile__theme-swatch--dark {
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    color: #94a3b8;
    border-color: #334155;
}
.mj-profile__theme-swatch--system {
    background: linear-gradient(135deg, #ffffff 0%, #ffffff 49%, #1e293b 51%, #0f172a 100%);
    color: var(--mj-text-secondary);
}
.mj-profile__theme-info { flex: 1; min-width: 0; }
.mj-profile__theme-name {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--mj-text-primary);
}
.mj-profile__theme-desc {
    font-size: 11.5px;
    color: var(--mj-text-muted);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.mj-profile__theme-check {
    color: var(--mj-brand-primary);
    font-size: 14px;
    flex-shrink: 0;
}

@media (max-width: 480px) {
    .mj-profile__hero { padding: 20px 18px 48px; }
    .mj-profile__avatar-zone { width: 88px; height: 88px; margin-top: -44px; }
    .mj-profile__avatar { width: 88px; height: 88px; font-size: 28px; }
    .mj-profile__name { font-size: 19px; }
    .mj-profile__field-list,
    .mj-profile__section { padding-left: 18px; padding-right: 18px; }
    .mj-profile__footer { padding: 12px 16px; }
    .mj-profile--panel-open .mj-profile__main { transform: translateX(-20%); }
    .mj-profile__panel-body { padding: 14px 16px 16px; }
}
    `]
})
export class ProfileDialogComponent implements OnInit, OnDestroy {
    @Output() CloseRequested = new EventEmitter<void>();

    @Input() AvatarUrl: string | null = null;
    @Input() AvatarIconClass: string | null = null;

    public UserName = '';
    public UserEmail = '';
    public UserInitials = '?';
    public AccountType = '';
    public AccountStatus = '';
    public MemberSince = '';
    public ThemeLabel = '';
    public RoleChips: Array<{ label: string; tone: string; icon: string | null }> = [];

    public LoadingNotifications = true;
    public Channels: NotificationChannel[] = [
        { key: 'InApp', label: 'In-app',  icon: 'fa-solid fa-bell',     enabled: false, saving: false },
        { key: 'Email', label: 'Email',   icon: 'fa-solid fa-envelope', enabled: false, saving: false },
        { key: 'SMS',   label: 'SMS',     icon: 'fa-solid fa-mobile',   enabled: false, saving: false }
    ];
    public UnreadCount = 0;

    // Slide-in panel state
    public ActivePanel: ProfilePanel = 'none';
    public ThemeOptions: Array<{ id: string; name: string; description: string; icon: string; swatch: 'light' | 'dark' | 'system' }> = [];
    public ThemePreference = '';
    public SavingTheme: string | null = null;

    public get PanelTitle(): string {
        switch (this.ActivePanel) {
            case 'photo': return 'Profile photo';
            case 'theme': return 'Theme';
            default: return '';
        }
    }

    private authBase = inject(MJAuthBase);
    private themeService = inject(ThemeService);
    private sharedService = inject(SharedService);
    private cdr = inject(ChangeDetectorRef);

    private themeSub?: Subscription;

    public ngOnInit(): void {
        this.populateIdentity();
        this.populateThemeOptions();
        this.loadNotifications();
        this.themeSub = this.themeService.Preference$.subscribe(pref => {
            this.ThemePreference = pref;
            this.ThemeLabel = this.computeThemeLabel();
            this.cdr.markForCheck();
        });
    }

    public ngOnDestroy(): void {
        this.themeSub?.unsubscribe();
    }

    public OnCloseClick(): void {
        if (this.ActivePanel !== 'none') {
            this.ClosePanel();
            return;
        }
        this.CloseRequested.emit();
    }

    public OnAvatarLoadError(): void {
        this.AvatarUrl = null;
        this.cdr.markForCheck();
    }

    public OpenPanel(panel: ProfilePanel): void {
        this.ActivePanel = panel;
    }

    public ClosePanel(): void {
        this.ActivePanel = 'none';
    }

    public async OnSignOut(): Promise<void> {
        try {
            localStorage.removeItem('auth');
            localStorage.removeItem('claims');
            await this.authBase.logout();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            this.sharedService.CreateSimpleNotification(`Sign out failed: ${msg}`, 'error', 3000);
        }
    }

    public async SelectTheme(themeId: string): Promise<void> {
        if (this.SavingTheme) return;
        if (themeId === this.ThemePreference) return;
        this.SavingTheme = themeId;
        this.cdr.markForCheck();
        try {
            await this.themeService.SetTheme(themeId);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            this.sharedService.CreateSimpleNotification(`Theme change failed: ${msg}`, 'error', 3000);
        } finally {
            this.SavingTheme = null;
            this.cdr.markForCheck();
        }
    }

    public async ToggleChannel(channel: NotificationChannel): Promise<void> {
        if (channel.saving) return;
        const newState = !channel.enabled;
        channel.saving = true;
        this.cdr.markForCheck();

        const provider = Metadata.Provider;
        const currentUser = provider?.CurrentUser;
        if (!provider || !currentUser) {
            channel.saving = false;
            return;
        }

        try {
            const transGroup = await provider.CreateTransactionGroup();
            const types = UserInfoEngine.Instance.NotificationTypes;
            const preferences = UserInfoEngine.Instance.NotificationPreferences;

            for (const type of types) {
                if (type.AllowUserPreference === false) continue;

                let pref = preferences.find(p => UUIDsEqual(p.NotificationTypeID, type.ID));
                if (!pref) {
                    pref = await provider.GetEntityObject<MJUserNotificationPreferenceEntity>(
                        'MJ: User Notification Preferences'
                    );
                    pref.UserID = currentUser.ID;
                    pref.NotificationTypeID = type.ID;
                    pref.InAppEnabled = type.DefaultInApp ?? true;
                    pref.EmailEnabled = type.DefaultEmail ?? false;
                    pref.SMSEnabled = type.DefaultSMS ?? false;
                }

                if (channel.key === 'InApp') pref.InAppEnabled = newState;
                else if (channel.key === 'Email') pref.EmailEnabled = newState;
                else pref.SMSEnabled = newState;

                pref.Enabled = pref.InAppEnabled || pref.EmailEnabled || pref.SMSEnabled;
                pref.TransactionGroup = transGroup;
                pref.Save();
            }

            const success = await transGroup.Submit();
            if (success) {
                channel.enabled = newState;
                this.sharedService.CreateSimpleNotification(
                    `${channel.label} notifications ${newState ? 'enabled' : 'disabled'}`,
                    'success',
                    2000
                );
            } else {
                throw new Error('Save failed');
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            this.sharedService.CreateSimpleNotification(`Update failed: ${msg}`, 'error', 3000);
            await this.loadNotifications();
        } finally {
            channel.saving = false;
            this.cdr.markForCheck();
        }
    }

    // ---------- private helpers ----------

    private populateIdentity(): void {
        const provider = Metadata.Provider;
        const user = provider?.CurrentUser;
        if (user) {
            const name = user.Name || `${user.FirstName ?? ''} ${user.LastName ?? ''}`.trim();
            this.UserName = name || 'User';
            this.UserEmail = user.Email || '';
            this.UserInitials = this.computeInitials(this.UserName);
            this.AccountType = user.Type || 'User';
            this.AccountStatus = user.IsActive ? 'Active' : 'Inactive';
            this.MemberSince = this.formatMemberSince(user.__mj_CreatedAt);
            this.RoleChips = this.computeRoleChips(user.UserRoles);
        }
        this.ThemePreference = this.themeService.Preference;
        this.ThemeLabel = this.computeThemeLabel();
    }

    private populateThemeOptions(): void {
        const themes: ThemeDefinition[] = this.themeService.AvailableThemes ?? [];
        this.ThemeOptions = themes.map(t => ({
            id: t.Id,
            name: t.Name,
            description: t.Description ?? (t.BaseTheme === 'dark' ? 'Dark interface' : 'Light interface'),
            icon: t.BaseTheme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun',
            swatch: t.BaseTheme as 'light' | 'dark'
        }));
        this.ThemeOptions.push({
            id: 'system',
            name: 'System',
            description: 'Follow your operating system',
            icon: 'fa-solid fa-desktop',
            swatch: 'system'
        });
    }

    private async loadNotifications(): Promise<void> {
        this.LoadingNotifications = true;
        try {
            this.UnreadCount = UserInfoEngine.Instance.UnreadNotificationCount ?? 0;
            const preferences = UserInfoEngine.Instance.NotificationPreferences;
            const types = UserInfoEngine.Instance.NotificationTypes;

            let inApp: boolean, email: boolean, sms: boolean;
            if (preferences.length === 0 && types.length > 0) {
                inApp = types.some(t => t.DefaultInApp ?? true);
                email = types.some(t => t.DefaultEmail ?? false);
                sms = types.some(t => t.DefaultSMS ?? false);
            } else {
                inApp = preferences.some(p => p.InAppEnabled);
                email = preferences.some(p => p.EmailEnabled);
                sms = preferences.some(p => p.SMSEnabled);
            }

            this.Channels[0].enabled = inApp;
            this.Channels[1].enabled = email;
            this.Channels[2].enabled = sms;
        } catch {
            // non-fatal; leave defaults
        } finally {
            this.LoadingNotifications = false;
            this.cdr.markForCheck();
        }
    }

    private computeInitials(name: string): string {
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return '?';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    private computeRoleChips(roles: UserRoleInfo[] | undefined): Array<{ label: string; tone: string; icon: string | null }> {
        if (!roles || roles.length === 0) return [];
        return roles
            .map(r => r.Role)
            .filter((n): n is string => !!n)
            .map(roleName => {
                const lower = roleName.toLowerCase();
                if (lower.includes('admin')) return { label: roleName, tone: 'admin', icon: 'fa-solid fa-shield' };
                if (lower.includes('developer') || lower.includes('integration')) return { label: roleName, tone: 'dev', icon: 'fa-solid fa-code' };
                return { label: roleName, tone: '', icon: null };
            });
    }

    private formatMemberSince(date: Date | string | null | undefined): string {
        if (!date) return '';
        const d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    }

    private computeThemeLabel(): string {
        const applied = this.themeService.AppliedTheme;
        const preference = this.themeService.Preference;
        const def = this.themeService.GetThemeDefinition(applied);
        const themeName = def?.Name ?? applied;
        return preference === 'system' ? `${themeName} · System` : themeName;
    }
}
