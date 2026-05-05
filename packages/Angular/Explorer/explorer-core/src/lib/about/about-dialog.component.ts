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
import { InstanceConfigEngine } from '@memberjunction/core-entities';
import { GraphQLDataProvider, PACKAGE_VERSION } from '@memberjunction/graphql-dataprovider';
import { MJAuthBase } from '@memberjunction/ng-auth-services';
import { ThemeService } from '@memberjunction/ng-shared';
import { Subscription } from 'rxjs';
import { ServerConnectivityService } from '../services/server-connectivity.service';

/**
 * About dialog for MemberJunction. Shows brand identity, version, lightweight
 * usage stats, the current user, and a collapsible diagnostics panel.
 *
 * Self-contained standalone component. Opened via {@link AboutDialogService}.
 *
 * Easter eggs:
 *  - Click the version pill 7× → toast + logo spin
 *  - Click the logo → quick wiggle
 *  - Konami code (↑↑↓↓←→←→ B A) → barrel roll
 */
@Component({
    selector: 'mj-about-dialog',
    standalone: true,
    imports: [CommonModule],
    template: `
<div class="mj-about" role="document">
    <button class="mj-about__close" type="button" aria-label="Close" (click)="OnCloseClick()">
        <i class="fa-solid fa-xmark"></i>
    </button>

    <div class="mj-about__hero">
        <div class="mj-about__logo-wrap" (click)="OnLogoClick()">
            <svg class="mj-about__logo" #aboutLogo
                 xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448.28 57.11"
                 aria-label="MemberJunction">
                <path fill="#fff"
                    d="M428.73,44.89v-16.92c.7-1.34,1.66-2.37,2.88-3.09,1.22-.72,2.59-1.08,4.12-1.08,2.2,0,3.92.65,5.17,1.94,1.25,1.3,1.87,3.07,1.87,5.33v13.81h2.01v-14.36c0-1.71-.36-3.21-1.08-4.51-.72-1.3-1.72-2.3-3.02-3.02-1.3-.72-2.8-1.08-4.51-1.08-3.14,0-5.63,1.21-7.46,3.61v-3.16h-2.01v22.51h2.01ZM407.08,42.12c-1.39-.87-2.49-2.04-3.29-3.52-.81-1.48-1.21-3.13-1.21-4.96s.4-3.48,1.21-4.96c.81-1.48,1.91-2.65,3.29-3.52,1.39-.87,2.94-1.31,4.64-1.31s3.25.44,4.64,1.31c1.39.87,2.49,2.04,3.29,3.52.81,1.48,1.21,3.13,1.21,4.96s-.41,3.48-1.21,4.96c-.81,1.48-1.91,2.65-3.29,3.52-1.39.87-2.94,1.3-4.64,1.3s-3.26-.43-4.64-1.3M417.42,43.79c1.69-1.04,3.04-2.45,4.03-4.23.99-1.78,1.49-3.76,1.49-5.92s-.5-4.18-1.49-5.95c-.99-1.77-2.33-3.17-4.03-4.21-1.69-1.04-3.59-1.56-5.69-1.56s-3.97.52-5.67,1.56c-1.71,1.04-3.06,2.44-4.05,4.21-.99,1.77-1.49,3.75-1.49,5.95s.5,4.14,1.49,5.92c.99,1.79,2.34,3.19,4.05,4.23,1.71,1.04,3.6,1.56,5.67,1.56s4-.52,5.69-1.56M397.14,16.8c.32-.34.48-.75.48-1.24s-.16-.9-.48-1.24c-.32-.34-.74-.5-1.26-.5-.49,0-.9.17-1.24.5-.34.34-.5.75-.5,1.24s.17.9.5,1.24c.34.34.75.5,1.24.5.52,0,.94-.17,1.26-.5M396.89,22.38h-2.01v22.51h2.01v-22.51ZM390.57,45.21c.61-.09,1.2-.25,1.78-.46v-1.97c-.52.21-1.02.37-1.51.48-.49.11-1.08.16-1.79.16-1.31,0-2.25-.28-2.81-.84s-.85-1.49-.85-2.77v-15.6h6.95v-1.83h-6.95v-6.31l-2.01.64v5.67h-4.94v1.83h4.94v16.29c0,1.52.46,2.71,1.37,3.57.91.85,2.23,1.28,3.94,1.28.64,0,1.26-.05,1.87-.14M373.12,44.43c1.54-.61,2.89-1.45,4.05-2.51l-1.37-1.65c-.98.95-2.1,1.71-3.36,2.29s-2.57.87-3.91.87c-1.71,0-3.25-.43-4.64-1.3-1.39-.87-2.49-2.04-3.29-3.52-.81-1.48-1.21-3.13-1.21-4.96s.4-3.48,1.21-4.96c.81-1.48,1.9-2.65,3.29-3.52,1.39-.87,2.93-1.31,4.64-1.31,1.34,0,2.64.28,3.91.85,1.27.56,2.39,1.33,3.36,2.31l1.37-1.65c-1.16-1.07-2.51-1.91-4.05-2.52-1.54-.61-3.07-.91-4.6-.91-2.07,0-3.96.52-5.67,1.56s-3.06,2.44-4.05,4.21c-.99,1.77-1.49,3.75-1.49,5.95s.49,4.18,1.49,5.95c.99,1.77,2.34,3.17,4.05,4.21s3.6,1.56,5.67,1.56c1.52,0,3.06-.31,4.6-.92M337.65,44.89v-16.92c.7-1.34,1.66-2.37,2.88-3.09,1.22-.72,2.59-1.08,4.12-1.08,2.2,0,3.92.65,5.17,1.94,1.25,1.3,1.88,3.07,1.88,5.33v13.81h2.01v-14.36c0-1.71-.36-3.21-1.07-4.51-.72-1.3-1.73-2.3-3.02-3.02s-2.8-1.08-4.5-1.08c-3.14,0-5.63,1.21-7.46,3.61v-3.16h-2.01v22.51h2.01ZM328.7,41.78v3.11h2.01v-22.51h-2.01v16.92c-.7,1.31-1.66,2.33-2.88,3.06-1.22.73-2.59,1.1-4.12,1.1-2.2,0-3.92-.65-5.17-1.97-1.25-1.31-1.87-3.08-1.87-5.31v-13.81h-2.01v14.36c0,1.71.37,3.21,1.1,4.51.73,1.3,1.74,2.3,3.04,3.02,1.3.72,2.78,1.08,4.46,1.08,3.2,0,5.69-1.19,7.46-3.57M303.64,43.88c1.74-1.01,3.08-2.43,4.02-4.28.95-1.84,1.42-4.05,1.42-6.61V12.87h-2.1v20.13c0,3.2-.85,5.74-2.56,7.62-1.71,1.88-4.01,2.81-6.91,2.81-2.17,0-4.02-.56-5.58-1.69-1.56-1.13-2.77-2.75-3.66-4.85l-1.92.87c1.01,2.5,2.46,4.4,4.37,5.7,1.9,1.3,4.15,1.94,6.75,1.94,2.38,0,4.44-.5,6.18-1.51M279.77,44.89v-15.37c.61-.97,1.41-1.73,2.4-2.26.99-.53,2.07-.8,3.22-.8.64,0,1.27.06,1.88.18.61.12,1.16.3,1.65.55v-6.45c-.55-.37-1.48-.56-2.79-.59-1.31,0-2.5.25-3.57.75-1.07.5-2,1.24-2.79,2.22v-2.42h-7.41v24.2h7.41ZM253.44,28.07c.47-.56,1.04-1,1.72-1.3.67-.3,1.42-.46,2.24-.46s1.52.16,2.2.48c.67.32,1.26.76,1.76,1.33.5.56.88,1.24,1.12,2.04h-10.11c.24-.82.6-1.52,1.07-2.08M263.5,44.47c1.6-.58,3.17-1.51,4.69-2.79l-4.9-4.35c-.58.58-1.28,1.03-2.1,1.35-.82.32-1.74.48-2.75.48-.91,0-1.77-.16-2.56-.48-.79-.32-1.47-.77-2.03-1.35-.56-.58-1.02-1.25-1.35-2.01h17.25v-1.83c0-2.56-.53-4.83-1.58-6.82-1.05-1.98-2.49-3.54-4.32-4.69-1.83-1.14-3.94-1.72-6.31-1.72s-4.48.55-6.4,1.67c-1.92,1.11-3.44,2.62-4.55,4.5-1.11,1.89-1.67,4.01-1.67,6.36s.58,4.47,1.74,6.36c1.16,1.89,2.74,3.39,4.73,4.51,2,1.11,4.23,1.67,6.7,1.67,2.01,0,3.82-.29,5.42-.87M227.12,38.44c-.88-.34-1.65-.79-2.29-1.37v-8.46c.67-.64,1.43-1.12,2.29-1.44s1.8-.48,2.84-.48c1.19,0,2.26.27,3.23.8.96.53,1.72,1.26,2.29,2.2.56.93.84,1.97.84,3.13s-.28,2.2-.84,3.13c-.56.93-1.32,1.66-2.27,2.2-.95.54-2.03.8-3.25.8-1.01,0-1.95-.17-2.84-.5M224.74,44.89v-1.37c.92.55,1.91.97,2.97,1.26,1.07.29,2.16.43,3.29.43,2.35,0,4.48-.55,6.38-1.65,1.91-1.1,3.41-2.58,4.53-4.46,1.11-1.88,1.67-3.97,1.67-6.29s-.55-4.42-1.65-6.29c-1.1-1.88-2.58-3.37-4.44-4.49-1.86-1.11-3.95-1.67-6.27-1.67s-4.51.67-6.41,2.01v-10.66l-7.41,1.14v32.02h7.32ZM183.69,44.89v-16.56c.46-.58,1.01-1.01,1.67-1.3.66-.29,1.4-.43,2.22-.43,1.19,0,2.14.4,2.86,1.19.72.79,1.07,1.86,1.07,3.2v13.91h7.41v-14.91c0-.28,0-.54-.02-.8-.01-.26-.04-.51-.07-.76.49-.61,1.07-1.07,1.74-1.37.67-.31,1.42-.46,2.24-.46,1.19,0,2.14.4,2.86,1.19s1.08,1.86,1.08,3.2v13.91h7.41v-14.91c0-1.92-.41-3.61-1.21-5.08-.81-1.46-1.91-2.61-3.31-3.43-1.4-.82-3.02-1.23-4.85-1.23-1.59,0-3.05.29-4.39.87-1.34.58-2.5,1.4-3.48,2.47-.83-1.07-1.85-1.89-3.07-2.47-1.22-.58-2.59-.87-4.12-.87-2.32,0-4.33.67-6.04,2.01v-1.56h-7.41v24.2h7.41ZM157.36,28.07c.47-.56,1.04-1,1.72-1.3.67-.3,1.42-.46,2.24-.46s1.52.16,2.2.48c.67.32,1.26.76,1.76,1.33.5.56.88,1.24,1.12,2.04h-10.11c.24-.82.6-1.52,1.08-2.08M167.42,44.47c1.6-.58,3.16-1.51,4.69-2.79l-4.9-4.35c-.58.58-1.28,1.03-2.1,1.35-.83.32-1.74.48-2.75.48-.91,0-1.77-.16-2.56-.48-.79-.32-1.47-.77-2.03-1.35-.56-.58-1.02-1.25-1.35-2.01h17.25v-1.83c0-2.56-.53-4.83-1.58-6.82-1.05-1.98-2.49-3.54-4.32-4.69-1.83-1.14-3.93-1.72-6.31-1.72s-4.48.55-6.41,1.67c-1.92,1.11-3.44,2.62-4.55,4.5-1.11,1.89-1.67,4.01-1.67,6.36s.58,4.47,1.74,6.36c1.16,1.89,2.74,3.39,4.74,4.51,2,1.11,4.23,1.67,6.7,1.67,2.01,0,3.82-.29,5.42-.87M118.71,44.89v-21.91l10.52,19.62,10.52-19.53v21.82h7.41V12.87h-9.93l-7.91,15.1-7.91-15.1h-9.93v32.02h7.23Z" />
                <path fill="#fff"
                    d="M88.82,12.69v27.95s9.76,5.58,9.76,5.58c.01-.24.02-34.61.02-34.61,0-3.72-1.57-6.76-4.3-8.35-2.73-1.59-6.15-1.44-9.38.39l-33.88,19.27L17.17,3.66c-3.23-1.84-6.65-1.98-9.38-.39-2.73,1.59-4.3,4.63-4.3,8.35,0,0,0,34.39.02,34.64l9.75-5.58V12.69l27.89,15.87L4.21,49.57c.71,1.84,1.93,3.32,3.57,4.28,1.26.73,2.67,1.1,4.13,1.1,1.71,0,3.51-.5,5.25-1.49L88.82,12.69Z" />
                <path fill="#fff"
                    d="M64.22,30.43l-9.86,5.64,30.56,17.39c1.74.99,3.54,1.49,5.26,1.49,1.46,0,2.87-.37,4.13-1.1,1.65-.96,2.87-2.46,3.59-4.31l-33.67-19.11Z" />
            </svg>
        </div>

        <div class="mj-about__version-row">
            <span class="mj-about__version-pill" (click)="OnVersionClick()" role="button" tabindex="0">
                <span class="mj-about__version-dot"></span>
                <span>Version {{ Version }}</span>
            </span>
        </div>
    </div>

    <div class="mj-about__body">
        @if (ConnectionLabel) {
            <div class="mj-about__connection-line">
                Connected to <span class="mj-about__connection-name">{{ ConnectionLabel }}</span>
            </div>
        }

        <div class="mj-about__user-card">
            @if (AvatarUrl) {
                <img class="mj-about__user-avatar mj-about__user-avatar--img"
                     [src]="AvatarUrl" alt="" (error)="OnAvatarLoadError()" />
            } @else if (AvatarIconClass) {
                <div class="mj-about__user-avatar mj-about__user-avatar--icon">
                    <i [class]="AvatarIconClass"></i>
                </div>
            } @else {
                <div class="mj-about__user-avatar">{{ UserInitials }}</div>
            }
            <div class="mj-about__user-info">
                <div class="mj-about__user-name">{{ UserName }}</div>
                <div class="mj-about__user-meta">{{ UserMeta }}</div>
            </div>
            <div class="mj-about__conn-pill" [class.mj-about__conn-pill--offline]="!IsConnected">
                <i class="fa-solid fa-circle"></i>
                {{ IsConnected ? 'Connected' : 'Offline' }}
            </div>
        </div>

        <button class="mj-about__diag-toggle" type="button" [class.mj-about__diag-toggle--open]="DiagnosticsOpen"
                (click)="ToggleDiagnostics()">
            <span class="mj-about__diag-toggle-left">
                <i class="fa-solid fa-stethoscope"></i>
                {{ DiagnosticsOpen ? 'Hide diagnostics' : 'Show diagnostics' }}
            </span>
            <i class="fa-solid fa-chevron-down mj-about__diag-chev"></i>
        </button>

        <div class="mj-about__diag-panel" [class.mj-about__diag-panel--open]="DiagnosticsOpen">
            <div class="mj-about__diag-section">
                <h5><i class="fa-solid fa-cube"></i> Build</h5>
                <div class="mj-about__diag-row"><span class="k">Version</span><span class="v">{{ Version }}</span></div>
                <div class="mj-about__diag-row"><span class="k">Environment</span><span class="v">{{ Environment }}</span></div>
            </div>
            <div class="mj-about__diag-section">
                <h5><i class="fa-solid fa-plug"></i> Connection</h5>
                <div class="mj-about__diag-row"><span class="k">API endpoint</span><span class="v" [title]="ApiUrl">{{ ApiUrlShort }}</span></div>
                <div class="mj-about__diag-row"><span class="k">Auth provider</span><span class="v">{{ AuthProvider }}</span></div>
                <div class="mj-about__diag-row"><span class="k">Status</span><span class="v" [class.mj-about__success]="IsConnected" [class.mj-about__error]="!IsConnected">{{ IsConnected ? 'Connected' : 'Offline' }}</span></div>
            </div>
            <div class="mj-about__diag-section">
                <h5><i class="fa-solid fa-database"></i> Loaded</h5>
                <div class="mj-about__diag-row"><span class="k">Entities</span><span class="v">{{ EntityCount }}</span></div>
                <div class="mj-about__diag-row"><span class="k">Applications</span><span class="v">{{ ApplicationCount }}</span></div>
                <div class="mj-about__diag-row"><span class="k">Queries</span><span class="v">{{ QueryCount }}</span></div>
            </div>
            <div class="mj-about__diag-section">
                <h5><i class="fa-solid fa-user"></i> Session</h5>
                <div class="mj-about__diag-row"><span class="k">User</span><span class="v">{{ UserEmail }}</span></div>
                <div class="mj-about__diag-row"><span class="k">Roles</span><span class="v">{{ UserRolesText }}</span></div>
                <div class="mj-about__diag-row"><span class="k">Theme</span><span class="v">{{ ThemeLabel }}</span></div>
                <div class="mj-about__diag-row"><span class="k">Browser</span><span class="v">{{ BrowserLabel }}</span></div>
            </div>
            <button class="mj-about__copy-btn" type="button" (click)="CopyDiagnostics()">
                <i class="fa-solid" [class.fa-clipboard]="!CopyConfirmed" [class.fa-check]="CopyConfirmed"></i>
                {{ CopyConfirmed ? 'Copied!' : 'Copy diagnostics' }}
            </button>
        </div>
    </div>

    <div class="mj-about__footer">
        <a class="mj-about__footer-link" href="https://docs.memberjunction.org" target="_blank" rel="noopener">
            <i class="fa-solid fa-book"></i> Documentation
        </a>
        <a class="mj-about__footer-link" href="https://github.com/MemberJunction/MJ" target="_blank" rel="noopener">
            <i class="fa-brands fa-github"></i> GitHub
        </a>
        <a class="mj-about__footer-link" href="https://memberjunction.com" target="_blank" rel="noopener">
            <i class="fa-solid fa-globe"></i> Website
        </a>
    </div>

    <div class="mj-about__credit">
        Built with <span class="mj-about__heart">&hearts;</span> by the MemberJunction community
    </div>

    @if (ToastMessage) {
        <div class="mj-about__toast">{{ ToastMessage }}</div>
    }
</div>
    `,
    styles: [`
:host {
    display: block;
    width: 100%;
    height: 100%;
}
.mj-about {
    display: flex;
    flex-direction: column;
    background: var(--mj-bg-surface);
    color: var(--mj-text-primary);
    height: 100%;
    min-height: 0;
    position: relative;
    font-family: inherit;
}
.mj-about__close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(8px);
    color: #fff;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
    z-index: 2;
}
.mj-about__close:hover { background: rgba(255, 255, 255, 0.3); }

.mj-about__hero {
    background: linear-gradient(135deg, #264FAF 0%, #0076b6 100%);
    color: #fff;
    padding: 36px 24px 28px;
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
}
.mj-about__hero::before {
    content: '';
    position: absolute;
    inset: -50%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.10) 0%, transparent 60%);
    animation: mj-about-rotate 24s linear infinite;
    pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
    .mj-about__hero::before { animation: none; }
}
@keyframes mj-about-rotate { to { transform: rotate(360deg); } }

.mj-about__logo-wrap {
    position: relative;
    z-index: 1;
    cursor: pointer;
    display: block;
    text-align: center;
}
.mj-about__logo {
    width: 280px;
    max-width: 80%;
    height: auto;
    display: inline-block;
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.15));
    transition: transform 0.3s ease-out;
}
.mj-about__logo-wrap:hover .mj-about__logo { transform: scale(1.03); }

.mj-about__version-row {
    position: relative;
    z-index: 1;
    text-align: center;
}
.mj-about__version-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 100px;
    padding: 5px 14px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
    color: #fff;
    transition: background 0.15s;
    letter-spacing: 0.2px;
}
.mj-about__version-pill:hover { background: rgba(255, 255, 255, 0.28); }
.mj-about__version-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #4ade80;
    box-shadow: 0 0 6px #4ade80;
}

.mj-about__body {
    padding: 22px 24px 16px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
}

.mj-about__connection-line {
    text-align: center;
    font-size: 11.5px;
    color: var(--mj-text-muted);
    margin-bottom: 14px;
    letter-spacing: 0.2px;
}
.mj-about__connection-name {
    color: var(--mj-text-secondary);
    font-weight: 600;
}

.mj-about__user-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px;
    background: var(--mj-bg-surface-sunken);
    border-radius: 10px;
    margin-bottom: 16px;
}
.mj-about__user-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: linear-gradient(135deg, #264FAF 0%, #0076b6 100%);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 15px;
    flex-shrink: 0;
    object-fit: cover;
    overflow: hidden;
}
img.mj-about__user-avatar { background: var(--mj-bg-surface-card); }
.mj-about__user-avatar--icon i { font-size: 18px; }
.mj-about__user-info { flex: 1; min-width: 0; }
.mj-about__user-name {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--mj-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.mj-about__user-meta {
    font-size: 11.5px;
    color: var(--mj-text-muted);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.mj-about__conn-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--mj-status-success);
    font-weight: 600;
    background: color-mix(in srgb, var(--mj-status-success) 12%, transparent);
    padding: 3px 8px;
    border-radius: 100px;
    flex-shrink: 0;
}
.mj-about__conn-pill i { font-size: 6px; }
.mj-about__conn-pill--offline {
    color: var(--mj-status-error);
    background: color-mix(in srgb, var(--mj-status-error) 12%, transparent);
}

.mj-about__diag-toggle {
    width: 100%;
    background: transparent;
    border: 1px solid var(--mj-border-default);
    border-radius: 10px;
    padding: 12px 14px;
    font-size: 13px;
    font-weight: 500;
    color: var(--mj-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
    font-family: inherit;
}
.mj-about__diag-toggle:hover {
    background: var(--mj-bg-surface-hover);
    border-color: var(--mj-border-strong);
    color: var(--mj-text-primary);
}
.mj-about__diag-toggle-left {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}
.mj-about__diag-chev {
    transition: transform 0.25s;
    color: var(--mj-text-muted);
}
.mj-about__diag-toggle--open .mj-about__diag-chev { transform: rotate(180deg); }

.mj-about__diag-panel {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.35s ease-out, margin-top 0.25s;
}
.mj-about__diag-panel--open {
    max-height: 800px;
    margin-top: 12px;
}
.mj-about__diag-section + .mj-about__diag-section { margin-top: 12px; }
.mj-about__diag-section {
    background: var(--mj-bg-surface-card);
    border: 1px solid var(--mj-border-subtle);
    border-radius: 10px;
    padding: 12px 14px;
}
.mj-about__diag-section h5 {
    margin: 0 0 8px;
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--mj-text-muted);
    display: flex;
    align-items: center;
    gap: 6px;
}
.mj-about__diag-section h5 i { color: var(--mj-brand-primary); }
.mj-about__diag-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    padding: 4px 0;
    min-width: 0;
}
.mj-about__diag-row .k { color: var(--mj-text-secondary); flex-shrink: 0; }
.mj-about__diag-row .v {
    color: var(--mj-text-primary);
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 11.5px;
    font-weight: 500;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
}
.mj-about__success { color: var(--mj-status-success) !important; }
.mj-about__error   { color: var(--mj-status-error)   !important; }

.mj-about__copy-btn {
    width: 100%;
    margin-top: 12px;
    padding: 10px;
    border: 1px dashed var(--mj-border-strong);
    background: transparent;
    border-radius: 8px;
    font-size: 12.5px;
    color: var(--mj-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
    font-family: inherit;
}
.mj-about__copy-btn:hover {
    border-color: var(--mj-brand-primary);
    color: var(--mj-brand-primary);
    background: color-mix(in srgb, var(--mj-brand-primary) 4%, transparent);
}

.mj-about__footer {
    border-top: 1px solid var(--mj-border-subtle);
    padding: 14px 20px;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
    flex-shrink: 0;
}
.mj-about__footer-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: 7px;
    font-size: 12px;
    color: var(--mj-text-secondary);
    text-decoration: none;
    transition: background 0.15s, color 0.15s;
    cursor: pointer;
}
.mj-about__footer-link:hover {
    background: var(--mj-bg-surface-hover);
    color: var(--mj-brand-primary);
}

.mj-about__credit {
    text-align: center;
    font-size: 10.5px;
    color: var(--mj-text-muted);
    padding: 0 20px 14px;
    flex-shrink: 0;
}
.mj-about__heart {
    color: var(--mj-status-error);
    display: inline-block;
    animation: mj-about-heart 2s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
    .mj-about__heart { animation: none; }
}
@keyframes mj-about-heart {
    50% { transform: scale(1.18); }
}

.mj-about__toast {
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--mj-text-primary);
    color: var(--mj-bg-surface);
    padding: 10px 18px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    z-index: 5;
    pointer-events: none;
    animation: mj-about-toast-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    max-width: calc(100% - 32px);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
@keyframes mj-about-toast-in {
    from { transform: translateX(-50%) translateY(-30px); opacity: 0; }
    to   { transform: translateX(-50%) translateY(0);     opacity: 1; }
}

@media (max-width: 480px) {
    .mj-about__hero { padding: 30px 18px 22px; gap: 12px; }
    .mj-about__logo { width: 220px; }
    .mj-about__body { padding: 18px 16px 14px; }
    .mj-about__footer { padding: 12px 14px; }
}
    `]
})
export class AboutDialogComponent implements OnInit, OnDestroy {
    @Output() CloseRequested = new EventEmitter<void>();

    /** Optional avatar image URL — passed in from the shell where it's already resolved. */
    @Input() AvatarUrl: string | null = null;

    /** Optional Font Awesome icon class fallback when no image is available. */
    @Input() AvatarIconClass: string | null = null;

    /** Static framework version, generated at build time. */
    public readonly Version: string = PACKAGE_VERSION;

    public EntityCount = 0;
    public ApplicationCount = 0;
    public QueryCount = 0;

    public UserName = 'Unknown User';
    public UserEmail = '';
    public UserInitials = '?';
    public UserRolesText = 'None';
    public ApiUrl = '';
    public ApiUrlShort = '';
    public AuthProvider = 'Unknown';
    public Environment: string = 'production';
    public ThemeLabel = '';
    public BrowserLabel = '';
    public IsConnected = true;
    public DiagnosticsOpen = false;

    /** Friendly "Connected to X" label — display name from InstanceConfig or just the API hostname. */
    public ConnectionLabel = '';

    public ToastMessage = '';
    public CopyConfirmed = false;

    private authBase = inject(MJAuthBase);
    private themeService = inject(ThemeService);
    private connectivity = inject(ServerConnectivityService);
    private cdr = inject(ChangeDetectorRef);

    private connSub?: Subscription;
    private themeSub?: Subscription;
    private versionClickCount = 0;
    private versionClickResetTimer: ReturnType<typeof setTimeout> | null = null;
    private toastTimer: ReturnType<typeof setTimeout> | null = null;
    private konamiIndex = 0;
    private readonly konamiSequence = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
    private readonly konamiHandler = (event: KeyboardEvent): void => {
        const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
        if (key === this.konamiSequence[this.konamiIndex]) {
            this.konamiIndex++;
            if (this.konamiIndex === this.konamiSequence.length) {
                this.konamiIndex = 0;
                this.showToast('🚀 You found it. Now you must tell no one.', 3500);
                this.barrelRoll();
            }
        } else {
            this.konamiIndex = 0;
        }
    };

    public get UserMeta(): string {
        if (this.UserEmail && this.UserRolesText && this.UserRolesText !== 'None') {
            return `${this.UserEmail} · ${this.UserRolesText}`;
        }
        return this.UserEmail || this.UserRolesText;
    }

    public ngOnInit(): void {
        this.populate();
        this.connSub = this.connectivity.IsConnected$.subscribe(connected => {
            this.IsConnected = connected;
            this.cdr.markForCheck();
        });
        this.themeSub = this.themeService.AppliedTheme$.subscribe(() => {
            this.ThemeLabel = this.computeThemeLabel();
            this.cdr.markForCheck();
        });
        document.addEventListener('keydown', this.konamiHandler);
    }

    public ngOnDestroy(): void {
        this.connSub?.unsubscribe();
        this.themeSub?.unsubscribe();
        document.removeEventListener('keydown', this.konamiHandler);
        if (this.versionClickResetTimer) clearTimeout(this.versionClickResetTimer);
        if (this.toastTimer) clearTimeout(this.toastTimer);
    }

    private populate(): void {
        const provider = Metadata.Provider;

        this.EntityCount = provider?.Entities?.length ?? 0;
        this.ApplicationCount = provider?.Applications?.length ?? 0;
        this.QueryCount = provider?.Queries?.length ?? 0;

        const user = provider?.CurrentUser;
        if (user) {
            this.UserName = user.Name || `${user.FirstName ?? ''} ${user.LastName ?? ''}`.trim() || 'User';
            this.UserEmail = user.Email || '';
            this.UserInitials = this.computeInitials(this.UserName);
            const roles = (user.UserRoles ?? [])
                .map((r: UserRoleInfo) => r.Role)
                .filter((n: string | null) => !!n) as string[];
            this.UserRolesText = roles.length > 0 ? roles.join(', ') : 'None';
        }

        if (provider instanceof GraphQLDataProvider) {
            this.ApiUrl = provider.ConfigData?.URL ?? '';
            this.ApiUrlShort = this.shortenUrl(this.ApiUrl);
        }

        this.AuthProvider = this.computeAuthLabel(this.authBase?.type);
        this.Environment = this.detectEnvironment();
        this.ThemeLabel = this.computeThemeLabel();
        this.BrowserLabel = this.computeBrowserLabel();
        this.IsConnected = this.connectivity.IsConnected;
        this.ConnectionLabel = this.computeConnectionLabel();
    }

    /**
     * Build the "Connected to X" label. Prefers `Instance.DisplayName` from
     * InstanceConfigEngine if set, otherwise falls back to the API hostname.
     */
    private computeConnectionLabel(): string {
        let displayName: string | undefined;
        try {
            displayName = InstanceConfigEngine.Instance.Get('Instance.DisplayName');
        } catch {
            displayName = undefined;
        }
        const host = this.ApiUrlShort?.split('/')[0] ?? '';
        if (displayName && host) return `${displayName} · ${host}`;
        return displayName || host;
    }

    public ToggleDiagnostics(): void {
        this.DiagnosticsOpen = !this.DiagnosticsOpen;
    }

    public OnCloseClick(): void {
        this.CloseRequested.emit();
    }

    public OnLogoClick(): void {
        this.wiggleLogo();
    }

    public OnAvatarLoadError(): void {
        // Image failed to load — fall back to initials
        this.AvatarUrl = null;
        this.cdr.markForCheck();
    }

    public OnVersionClick(): void {
        this.versionClickCount++;
        if (this.versionClickResetTimer) clearTimeout(this.versionClickResetTimer);
        this.versionClickResetTimer = setTimeout(() => (this.versionClickCount = 0), 2000);

        if (this.versionClickCount === 3) this.showToast('Keep going...');
        else if (this.versionClickCount === 5) this.showToast("You're committed now.");
        else if (this.versionClickCount === 7) {
            this.versionClickCount = 0;
            this.showToast('🎉 Developer mode? In THIS economy?');
            this.spinLogo();
        }
    }

    public async CopyDiagnostics(): Promise<void> {
        const block = [
            `MemberJunction v${this.Version}`,
            `Environment: ${this.Environment}`,
            `API: ${this.ApiUrl || '(unknown)'}`,
            `Auth: ${this.AuthProvider}`,
            `User: ${this.UserEmail || this.UserName} (${this.UserRolesText})`,
            `Theme: ${this.ThemeLabel}`,
            `Browser: ${this.BrowserLabel}`,
            `Entities loaded: ${this.EntityCount}`,
            `Applications: ${this.ApplicationCount}`,
            `Queries: ${this.QueryCount}`
        ].join('\n');

        try {
            await navigator.clipboard.writeText(block);
            this.CopyConfirmed = true;
            this.showToast('Diagnostics copied to clipboard');
            setTimeout(() => {
                this.CopyConfirmed = false;
                this.cdr.markForCheck();
            }, 1800);
        } catch {
            this.showToast('Copy failed — clipboard unavailable');
        }
    }

    // ---------- helpers ----------

    private computeInitials(name: string): string {
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return '?';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    private shortenUrl(url: string): string {
        if (!url) return '(not configured)';
        try {
            const u = new URL(url);
            return u.host + (u.pathname && u.pathname !== '/' ? u.pathname : '');
        } catch {
            return url;
        }
    }

    private computeAuthLabel(type: string | undefined): string {
        switch ((type ?? '').toLowerCase()) {
            case 'msal': return 'Microsoft Entra (MSAL)';
            case 'auth0': return 'Auth0';
            case 'okta': return 'Okta';
            case 'cognito': return 'Amazon Cognito';
            case '': return 'Unknown';
            default: return type ?? 'Unknown';
        }
    }

    private detectEnvironment(): string {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return 'development';
        if (host.startsWith('dev.') || host.includes('-dev.') || host.includes('.dev.')) return 'development';
        if (host.startsWith('staging.') || host.includes('-staging.') || host.includes('.staging.')) return 'staging';
        return 'production';
    }

    private computeThemeLabel(): string {
        const applied = this.themeService.AppliedTheme;
        const preference = this.themeService.Preference;
        const def = this.themeService.GetThemeDefinition(applied);
        const themeName = def?.Name ?? applied;
        return preference === 'system' ? `${themeName} · System` : themeName;
    }

    private computeBrowserLabel(): string {
        const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
        let browser = 'Unknown';
        if (/Edg\//.test(ua)) browser = 'Edge';
        else if (/OPR\//.test(ua)) browser = 'Opera';
        else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
        else if (/Firefox\//.test(ua)) browser = 'Firefox';
        else if (/Safari\//.test(ua)) browser = 'Safari';

        let os = 'Unknown';
        if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
        else if (/Android/.test(ua)) os = 'Android';
        else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
        else if (/Windows/.test(ua)) os = 'Windows';
        else if (/Linux/.test(ua)) os = 'Linux';

        return `${browser} / ${os}`;
    }

    private showToast(message: string, durationMs = 2400): void {
        this.ToastMessage = message;
        if (this.toastTimer) clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            this.ToastMessage = '';
            this.cdr.markForCheck();
        }, durationMs);
    }

    private wiggleLogo(): void {
        const svg = document.querySelector('.mj-about__logo') as SVGElement | null;
        svg?.animate(
            [
                { transform: 'rotate(0)' },
                { transform: 'rotate(-6deg)' },
                { transform: 'rotate(6deg)' },
                { transform: 'rotate(0)' }
            ],
            { duration: 400, easing: 'ease-in-out' }
        );
    }

    private spinLogo(): void {
        const svg = document.querySelector('.mj-about__logo') as SVGElement | null;
        svg?.animate(
            [
                { transform: 'rotate(0) scale(1)', offset: 0 },
                { transform: 'rotate(720deg) scale(1.1)', offset: 0.85 },
                { transform: 'rotate(720deg) scale(1)', offset: 1 }
            ],
            { duration: 2800, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
        );
    }

    private barrelRoll(): void {
        const dialog = document.querySelector('.mj-about') as HTMLElement | null;
        dialog?.animate(
            [{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }],
            { duration: 900, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' }
        );
    }
}
