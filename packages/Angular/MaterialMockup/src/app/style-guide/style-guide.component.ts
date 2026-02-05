import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

interface MenuItem {
    label: string;
    icon: string;
    route: string;
}

interface MenuGroup {
    label: string;
    items: MenuItem[];
    Collapsed: boolean;
}

@Component({
    selector: 'app-style-guide',
    standalone: true,
    imports: [CommonModule, RouterOutlet, RouterModule, MatIconModule, MatButtonModule, MatTooltipModule],
    template: `
    <div class="layout-wrapper">
      <!-- Sidebar Navigation -->
      <div class="layout-sidebar">
        <div class="sidebar-header">
            <h3>MJ Style Guide</h3>
            <span class="subtitle">Angular Material + Design Tokens</span>
        </div>
        <div class="sidebar-menu">
            @for (group of menuGroups; track group.label) {
                <div class="menu-group">
                    <div class="menu-group-header" (click)="ToggleGroup(group)">
                        <span>{{ group.label }}</span>
                        <mat-icon class="chevron-icon">
                            {{ group.Collapsed ? 'chevron_right' : 'expand_more' }}
                        </mat-icon>
                    </div>
                    @if (!group.Collapsed) {
                        @for (item of group.items; track item.route) {
                            <div
                                class="menu-item"
                                [class.active]="currentRoute === item.route"
                                (click)="Navigate(item.route)">
                                <mat-icon class="menu-icon">{{ item.icon }}</mat-icon>
                                <span>{{ item.label }}</span>
                            </div>
                        }
                    }
                </div>
            }
        </div>
        <div class="sidebar-footer">
            <div class="theme-toggle" (click)="ToggleDarkMode()">
                <mat-icon>{{ IsDarkMode ? 'light_mode' : 'dark_mode' }}</mat-icon>
                <span>{{ IsDarkMode ? 'Light Mode' : 'Dark Mode' }}</span>
            </div>
        </div>
      </div>

      <!-- Main Content -->
      <div class="layout-content">
        <div class="topbar">
            <span class="page-title">{{ GetCurrentPageTitle() }}</span>
            <div class="actions">
                <button mat-icon-button
                    [matTooltip]="IsDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
                    (click)="ToggleDarkMode()">
                    <mat-icon>{{ IsDarkMode ? 'light_mode' : 'dark_mode' }}</mat-icon>
                </button>
            </div>
        </div>
        <div class="content-container">
            <router-outlet></router-outlet>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .layout-wrapper {
        display: flex;
        height: 100vh;
        overflow: hidden;
        background-color: var(--mj-bg-page);
    }

    .layout-sidebar {
        width: 260px;
        min-width: 260px;
        background-color: var(--mj-bg-surface);
        border-right: 1px solid var(--mj-border-default);
        display: flex;
        flex-direction: column;
    }

    .sidebar-header {
        padding: var(--mj-space-5) var(--mj-space-5) var(--mj-space-4);
        border-bottom: 1px solid var(--mj-border-default);

        h3 {
            margin: 0;
            color: var(--mj-brand-primary);
            font-family: var(--mj-font-family);
            font-size: var(--mj-text-lg);
            font-weight: var(--mj-font-bold);
        }

        .subtitle {
            display: block;
            margin-top: var(--mj-space-1);
            font-size: var(--mj-text-xs);
            color: var(--mj-text-muted);
        }
    }

    .sidebar-menu {
        padding: var(--mj-space-2);
        flex: 1;
        overflow-y: auto;
    }

    .menu-group {
        margin-bottom: var(--mj-space-1);
    }

    .menu-group-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--mj-space-2) var(--mj-space-3);
        font-size: 10px;
        font-weight: var(--mj-font-bold);
        text-transform: uppercase;
        letter-spacing: var(--mj-tracking-wide);
        color: var(--mj-text-muted);
        cursor: pointer;
        user-select: none;
        transition: color var(--mj-transition-fast);

        &:hover {
            color: var(--mj-text-secondary);
        }

        .chevron-icon {
            font-size: 14px;
            width: 14px;
            height: 14px;
        }
    }

    .menu-item {
        padding: var(--mj-space-2-5) var(--mj-space-3) var(--mj-space-2-5) var(--mj-space-5);
        margin-bottom: var(--mj-space-0-5);
        border-radius: var(--mj-radius-md);
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: var(--mj-space-3);
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        transition: all var(--mj-transition-base);
        user-select: none;

        &:hover {
            background-color: var(--mj-bg-surface-hover);
            color: var(--mj-text-primary);
        }

        &.active {
            background-color: color-mix(in srgb, var(--mj-brand-primary) 10%, transparent);
            color: var(--mj-brand-primary);
            font-weight: var(--mj-font-medium);
        }

        .menu-icon {
            font-size: 18px;
            width: 20px;
            height: 20px;
            text-align: center;
        }
    }

    .sidebar-footer {
        padding: var(--mj-space-3);
        border-top: 1px solid var(--mj-border-default);
    }

    .theme-toggle {
        display: flex;
        align-items: center;
        gap: var(--mj-space-3);
        padding: var(--mj-space-3);
        border-radius: var(--mj-radius-md);
        cursor: pointer;
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        transition: all var(--mj-transition-base);

        &:hover {
            background-color: var(--mj-bg-surface-hover);
            color: var(--mj-text-primary);
        }

        mat-icon {
            font-size: 20px;
            width: 20px;
            height: 20px;
        }
    }

    .layout-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        min-width: 0;
    }

    .topbar {
        height: 56px;
        background-color: var(--mj-bg-surface);
        border-bottom: 1px solid var(--mj-border-default);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 var(--mj-space-6);
        flex-shrink: 0;
    }

    .page-title {
        font-size: var(--mj-text-lg);
        font-weight: var(--mj-font-semibold);
        color: var(--mj-text-primary);
    }

    .content-container {
        flex: 1;
        overflow: auto;
        padding: var(--mj-space-6);
    }
  `]
})
export class StyleGuideComponent {
    menuGroups: MenuGroup[] = [
        {
            label: 'Foundations',
            Collapsed: false,
            items: [
                { label: 'Colors', icon: 'palette', route: 'colors' },
                { label: 'Typography', icon: 'text_fields', route: 'typography' }
            ]
        },
        {
            label: 'Form',
            Collapsed: false,
            items: [
                { label: 'Buttons', icon: 'smart_button', route: 'buttons' },
                { label: 'Form Inputs', icon: 'text_format', route: 'form-inputs' },
                { label: 'Form Selects', icon: 'list', route: 'form-selects' }
            ]
        },
        {
            label: 'Data',
            Collapsed: false,
            items: [
                { label: 'Data Display', icon: 'table_chart', route: 'data-display' }
            ]
        },
        {
            label: 'Navigation',
            Collapsed: false,
            items: [
                { label: 'Navigation', icon: 'menu', route: 'navigation' }
            ]
        },
        {
            label: 'Layout',
            Collapsed: false,
            items: [
                { label: 'Cards & Layout', icon: 'dashboard', route: 'layout' },
                { label: 'Grid System', icon: 'grid_view', route: 'grid' }
            ]
        },
        {
            label: 'Overlay',
            Collapsed: false,
            items: [
                { label: 'Overlays', icon: 'layers', route: 'overlays' }
            ]
        },
        {
            label: 'Feedback',
            Collapsed: false,
            items: [
                { label: 'Indicators', icon: 'notifications', route: 'indicators' }
            ]
        },
        {
            label: 'Viz',
            Collapsed: false,
            items: [
                { label: 'Charts', icon: 'bar_chart', route: 'charts' }
            ]
        },
        {
            label: 'Misc',
            Collapsed: false,
            items: [
                { label: 'Miscellaneous', icon: 'widgets', route: 'misc' }
            ]
        },
        {
            label: 'Demo',
            Collapsed: false,
            items: [
                { label: 'Dashboard Demo', icon: 'speed', route: 'dashboard' }
            ]
        }
    ];

    currentRoute = 'colors';
    IsDarkMode = false;

    constructor(private router: Router) { }

    Navigate(route: string) {
        this.currentRoute = route;
        this.router.navigate([route]);
    }

    ToggleGroup(group: MenuGroup) {
        group.Collapsed = !group.Collapsed;
    }

    GetCurrentPageTitle(): string {
        for (const group of this.menuGroups) {
            const item = group.items.find(i => i.route === this.currentRoute);
            if (item) {
                return item.label;
            }
        }
        return 'Style Guide';
    }

    ToggleDarkMode() {
        const html = document.documentElement;
        this.IsDarkMode = !this.IsDarkMode;
        html.setAttribute('data-theme', this.IsDarkMode ? 'dark' : 'light');
    }
}
