import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MenuModule } from 'primeng/menu';
import { MenubarModule } from 'primeng/menubar';
import { BreadcrumbModule } from 'primeng/breadcrumb';
import { ContextMenuModule, ContextMenu } from 'primeng/contextmenu';
import { TieredMenuModule } from 'primeng/tieredmenu';
import { PanelMenuModule } from 'primeng/panelmenu';
import { MegaMenuModule } from 'primeng/megamenu';
import { DockModule } from 'primeng/dock';
import { StepsModule } from 'primeng/steps';
import { ButtonModule } from 'primeng/button';
import { MenuItem, MegaMenuItem } from 'primeng/api';

@Component({
    selector: 'app-menus',
    standalone: true,
    imports: [
        CommonModule,
        MenuModule,
        MenubarModule,
        BreadcrumbModule,
        ContextMenuModule,
        TieredMenuModule,
        PanelMenuModule,
        MegaMenuModule,
        DockModule,
        StepsModule,
        ButtonModule
    ],
    template: `
    <div class="menus-page">
        <!-- Menu Section -->
        <section class="token-section">
            <h2>Menu</h2>
            <p class="section-desc">Basic popup menu activated by a button. Uses MJ surface tokens for the overlay panel and brand tokens for active/hover states.</p>
            <p class="token-mapping">Panel bg: --mj-bg-surface-elevated | Hover: --mj-bg-surface-hover | Active text: --mj-brand-primary</p>
            <div class="mj-grid mj-gap-3 mj-align-center component-row">
                <button pButton label="Toggle Menu" icon="pi pi-bars" class="p-button-outlined" (click)="menu.toggle($event)"></button>
                <p-menu #menu [model]="menuItems" [popup]="true"></p-menu>
            </div>
        </section>

        <!-- Menubar Section -->
        <section class="token-section">
            <h2>Menubar</h2>
            <p class="section-desc">Horizontal navigation bar with dropdown submenus. Suitable for application-level navigation with nested menu structures.</p>
            <p class="token-mapping">Bar bg: --mj-bg-surface-elevated | Submenu bg: --mj-bg-surface-elevated | Hover: --mj-bg-surface-hover</p>
            <p-menubar [model]="menubarItems"></p-menubar>
        </section>

        <!-- Breadcrumb Section -->
        <section class="token-section">
            <h2>Breadcrumb</h2>
            <p class="section-desc">Hierarchical path indicator showing the current location within the application. Uses muted text for inactive crumbs and brand color for active.</p>
            <p class="token-mapping">Separator: --mj-text-muted | Active: --mj-brand-primary | Inactive: --mj-text-secondary</p>
            <p-breadcrumb [model]="breadcrumbItems" [home]="breadcrumbHome"></p-breadcrumb>
        </section>

        <!-- ContextMenu Section -->
        <section class="token-section">
            <h2>ContextMenu</h2>
            <p class="section-desc">Menu triggered by right-clicking on a target element. Uses the same surface and hover tokens as the standard menu.</p>
            <p class="token-mapping">Panel bg: --mj-bg-surface-elevated | Hover: --mj-bg-surface-hover | Border: --mj-border-subtle</p>
            <div class="mj-grid mj-align-center mj-justify-center mj-gap-3 context-menu-area" (contextmenu)="OnContextMenu($event)">
                <i class="pi pi-mouse"></i>
                <span>Right-click here to open context menu</span>
            </div>
            <p-contextMenu [model]="contextMenuItems" #contextMenu></p-contextMenu>
        </section>

        <!-- TieredMenu Section -->
        <section class="token-section">
            <h2>TieredMenu</h2>
            <p class="section-desc">Multi-level menu with nested submenus that fly out on hover. Ideal for deeply nested navigation structures.</p>
            <p class="token-mapping">Panel bg: --mj-bg-surface-elevated | Submenu indicator: --mj-text-muted | Separator: --mj-border-subtle</p>
            <p-tieredMenu [model]="tieredMenuItems"></p-tieredMenu>
        </section>

        <!-- PanelMenu Section -->
        <section class="token-section">
            <h2>PanelMenu</h2>
            <p class="section-desc">Accordion-style vertical menu with expandable panels. Each top-level item reveals its children on click.</p>
            <p class="token-mapping">Header bg: --mj-bg-surface-elevated | Content bg: --mj-bg-surface | Active: --mj-brand-primary</p>
            <div class="panel-menu-container">
                <p-panelMenu [model]="panelMenuItems"></p-panelMenu>
            </div>
        </section>

        <!-- MegaMenu Section -->
        <section class="token-section">
            <h2>MegaMenu</h2>
            <p class="section-desc">Wide dropdown menu displaying multiple columns of menu items. Useful for complex navigation with categorized links.</p>
            <p class="token-mapping">Panel bg: --mj-bg-surface-elevated | Category header: --mj-text-primary, --mj-font-semibold | Hover: --mj-bg-surface-hover</p>
            <p-megaMenu [model]="megaMenuItems"></p-megaMenu>
        </section>

        <!-- Dock Section -->
        <section class="token-section">
            <h2>Dock</h2>
            <p class="section-desc">macOS-style dock bar with icon-based shortcuts. Supports tooltip labels and magnification effects on hover.</p>
            <p class="token-mapping">Dock bg: --mj-bg-surface-elevated | Icon hover: --mj-bg-surface-hover | Shadow: --mj-shadow-lg</p>
            <div class="dock-container">
                <p-dock [model]="dockItems" position="bottom"></p-dock>
            </div>
        </section>

        <!-- Steps Section -->
        <section class="token-section">
            <h2>Steps</h2>
            <p class="section-desc">Step-by-step progress indicator for multi-stage workflows. Active step uses the brand primary color; completed steps use a muted accent.</p>
            <p class="token-mapping">Active step: --mj-brand-primary | Inactive: --mj-text-muted | Connector line: --mj-border-subtle</p>
            <p-steps [model]="stepsItems" [activeIndex]="activeStepIndex" [readonly]="false" (activeIndexChange)="OnActiveStepChange($event)"></p-steps>
            <p class="steps-status">Current step: <strong>{{ stepsItems[activeStepIndex].label }}</strong></p>
        </section>

    </div>
    `,
    styles: [`
    .menus-page {
        max-width: 1100px;
    }

    .token-section {
        margin-bottom: var(--mj-space-12);
    }

    .token-section h2 {
        font-size: var(--mj-text-2xl);
        font-weight: var(--mj-font-bold);
        color: var(--mj-text-primary);
        margin: 0 0 var(--mj-space-2) 0;
    }

    .section-desc {
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        margin: 0 0 var(--mj-space-2) 0;
        line-height: var(--mj-leading-relaxed);
    }

    .token-mapping {
        font-family: var(--mj-font-family-mono);
        font-size: 11px;
        color: var(--mj-text-muted);
        margin: 0 0 var(--mj-space-5) 0;
    }

    .component-row {
        margin-bottom: var(--mj-space-4);
    }

    /* Context Menu Target Area */
    .context-menu-area {
        padding: var(--mj-space-8) var(--mj-space-6);
        border: 2px dashed var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-secondary);
        font-size: var(--mj-text-sm);
        cursor: context-menu;
        transition: border-color var(--mj-transition-base), background var(--mj-transition-base);
        user-select: none;
    }

    .context-menu-area:hover {
        border-color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 4%, var(--mj-bg-surface-sunken));
    }

    .context-menu-area i {
        font-size: var(--mj-text-xl);
        color: var(--mj-text-muted);
    }

    /* Panel Menu Container */
    .panel-menu-container {
        max-width: 360px;
    }

    /* Dock Container */
    .dock-container {
        position: relative;
        height: 120px;
        background: var(--mj-bg-surface-sunken);
        border-radius: var(--mj-radius-lg);
        border: 1px solid var(--mj-border-subtle);
        overflow: hidden;
    }

    /* Steps Status */
    .steps-status {
        margin-top: var(--mj-space-4);
        font-size: var(--mj-text-sm);
        color: var(--mj-text-secondary);
    }

    .steps-status strong {
        color: var(--mj-brand-primary);
    }

    /* Tab Content Area */
    .tab-content-area {
        padding: var(--mj-space-5);
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-subtle);
        border-top: none;
        border-radius: 0 0 var(--mj-radius-md) var(--mj-radius-md);
        font-size: var(--mj-text-sm);
        color: var(--mj-text-secondary);
    }

    .tab-content-area strong {
        color: var(--mj-text-primary);
    }
    `]
})
export class MenusComponent {
    @ViewChild('contextMenu') contextMenu!: ContextMenu;

    // Basic Menu Items
    menuItems: MenuItem[] = [
        { label: 'Dashboard', icon: 'pi pi-home' },
        { label: 'Projects', icon: 'pi pi-briefcase' },
        { label: 'Messages', icon: 'pi pi-envelope', badge: '3' },
        { separator: true },
        { label: 'Settings', icon: 'pi pi-cog' },
        { label: 'Sign Out', icon: 'pi pi-sign-out' }
    ];

    // Menubar Items
    menubarItems: MenuItem[] = [
        {
            label: 'File',
            icon: 'pi pi-file',
            items: [
                { label: 'New', icon: 'pi pi-plus', shortcut: 'Ctrl+N' },
                { label: 'Open', icon: 'pi pi-folder-open', shortcut: 'Ctrl+O' },
                { separator: true },
                { label: 'Save', icon: 'pi pi-save', shortcut: 'Ctrl+S' },
                { label: 'Save As...', icon: 'pi pi-save' },
                { separator: true },
                { label: 'Export', icon: 'pi pi-upload', items: [
                    { label: 'PDF', icon: 'pi pi-file-pdf' },
                    { label: 'CSV', icon: 'pi pi-file-excel' },
                    { label: 'JSON', icon: 'pi pi-code' }
                ]},
                { separator: true },
                { label: 'Exit', icon: 'pi pi-power-off' }
            ]
        },
        {
            label: 'Edit',
            icon: 'pi pi-pencil',
            items: [
                { label: 'Undo', icon: 'pi pi-undo', shortcut: 'Ctrl+Z' },
                { label: 'Redo', icon: 'pi pi-replay', shortcut: 'Ctrl+Y' },
                { separator: true },
                { label: 'Cut', icon: 'pi pi-clipboard', shortcut: 'Ctrl+X' },
                { label: 'Copy', icon: 'pi pi-copy', shortcut: 'Ctrl+C' },
                { label: 'Paste', icon: 'pi pi-clone', shortcut: 'Ctrl+V' },
                { separator: true },
                { label: 'Find', icon: 'pi pi-search', shortcut: 'Ctrl+F' },
                { label: 'Replace', icon: 'pi pi-arrows-h', shortcut: 'Ctrl+H' }
            ]
        },
        {
            label: 'View',
            icon: 'pi pi-eye',
            items: [
                { label: 'Full Screen', icon: 'pi pi-window-maximize' },
                { label: 'Zoom In', icon: 'pi pi-search-plus' },
                { label: 'Zoom Out', icon: 'pi pi-search-minus' },
                { separator: true },
                { label: 'Sidebar', icon: 'pi pi-bars' },
                { label: 'Status Bar', icon: 'pi pi-minus' }
            ]
        },
        {
            label: 'Help',
            icon: 'pi pi-question-circle',
            items: [
                { label: 'Documentation', icon: 'pi pi-book' },
                { label: 'Keyboard Shortcuts', icon: 'pi pi-key' },
                { separator: true },
                { label: 'About', icon: 'pi pi-info-circle' }
            ]
        }
    ];

    // Breadcrumb Items
    breadcrumbHome: MenuItem = { icon: 'pi pi-home', routerLink: '/' };
    breadcrumbItems: MenuItem[] = [
        { label: 'Products' },
        { label: 'Electronics' },
        { label: 'Headphones' }
    ];

    // Context Menu Items
    contextMenuItems: MenuItem[] = [
        { label: 'View Details', icon: 'pi pi-eye' },
        { label: 'Edit', icon: 'pi pi-pencil' },
        { label: 'Duplicate', icon: 'pi pi-copy' },
        { separator: true },
        { label: 'Share', icon: 'pi pi-share-alt', items: [
            { label: 'Email', icon: 'pi pi-envelope' },
            { label: 'Link', icon: 'pi pi-link' },
            { label: 'Slack', icon: 'pi pi-slack' }
        ]},
        { separator: true },
        { label: 'Archive', icon: 'pi pi-inbox' },
        { label: 'Delete', icon: 'pi pi-trash' }
    ];

    // TieredMenu & SlideMenu Items (shared)
    tieredMenuItems: MenuItem[] = [
        {
            label: 'Documents',
            icon: 'pi pi-file',
            items: [
                {
                    label: 'New',
                    icon: 'pi pi-plus',
                    items: [
                        { label: 'Blank Document', icon: 'pi pi-file' },
                        { label: 'From Template', icon: 'pi pi-clone' },
                        { label: 'Import', icon: 'pi pi-upload' }
                    ]
                },
                { label: 'Recent', icon: 'pi pi-clock' },
                { label: 'Favorites', icon: 'pi pi-star' }
            ]
        },
        {
            label: 'Reports',
            icon: 'pi pi-chart-bar',
            items: [
                { label: 'Sales Report', icon: 'pi pi-dollar' },
                { label: 'Analytics', icon: 'pi pi-chart-line' },
                { label: 'User Activity', icon: 'pi pi-users' }
            ]
        },
        { separator: true },
        {
            label: 'Settings',
            icon: 'pi pi-cog',
            items: [
                { label: 'General', icon: 'pi pi-sliders-h' },
                { label: 'Security', icon: 'pi pi-shield' },
                { label: 'Notifications', icon: 'pi pi-bell' }
            ]
        },
        { label: 'Sign Out', icon: 'pi pi-sign-out' }
    ];

    // PanelMenu Items
    panelMenuItems: MenuItem[] = [
        {
            label: 'Dashboard',
            icon: 'pi pi-home',
            items: [
                { label: 'Overview', icon: 'pi pi-chart-pie' },
                { label: 'Analytics', icon: 'pi pi-chart-line' },
                { label: 'Performance', icon: 'pi pi-bolt' }
            ]
        },
        {
            label: 'Data Management',
            icon: 'pi pi-database',
            items: [
                { label: 'Entities', icon: 'pi pi-table' },
                { label: 'Imports', icon: 'pi pi-upload' },
                { label: 'Exports', icon: 'pi pi-download' },
                { label: 'Migrations', icon: 'pi pi-arrows-alt' }
            ]
        },
        {
            label: 'Users & Security',
            icon: 'pi pi-users',
            items: [
                { label: 'User Management', icon: 'pi pi-user' },
                { label: 'Roles', icon: 'pi pi-id-card' },
                { label: 'Permissions', icon: 'pi pi-lock' },
                { label: 'Audit Log', icon: 'pi pi-history' }
            ]
        },
        {
            label: 'Configuration',
            icon: 'pi pi-cog',
            items: [
                { label: 'General Settings', icon: 'pi pi-sliders-h' },
                { label: 'Integrations', icon: 'pi pi-link' },
                { label: 'API Keys', icon: 'pi pi-key' }
            ]
        }
    ];

    // MegaMenu Items
    megaMenuItems: MegaMenuItem[] = [
        {
            label: 'Data',
            icon: 'pi pi-database',
            items: [
                [
                    {
                        label: 'Entities',
                        items: [
                            { label: 'Browse Entities', icon: 'pi pi-table' },
                            { label: 'Create Entity', icon: 'pi pi-plus' },
                            { label: 'Entity Fields', icon: 'pi pi-list' },
                            { label: 'Relationships', icon: 'pi pi-sitemap' }
                        ]
                    }
                ],
                [
                    {
                        label: 'Queries',
                        items: [
                            { label: 'Saved Queries', icon: 'pi pi-bookmark' },
                            { label: 'Query Builder', icon: 'pi pi-filter' },
                            { label: 'SQL Editor', icon: 'pi pi-code' }
                        ]
                    }
                ]
            ]
        },
        {
            label: 'AI',
            icon: 'pi pi-microchip-ai',
            items: [
                [
                    {
                        label: 'Models',
                        items: [
                            { label: 'Manage Models', icon: 'pi pi-box' },
                            { label: 'Model Vendors', icon: 'pi pi-building' },
                            { label: 'Cost Tracking', icon: 'pi pi-dollar' }
                        ]
                    }
                ],
                [
                    {
                        label: 'Agents',
                        items: [
                            { label: 'Agent List', icon: 'pi pi-android' },
                            { label: 'Agent Runs', icon: 'pi pi-play' },
                            { label: 'Prompts', icon: 'pi pi-comment' }
                        ]
                    }
                ]
            ]
        },
        {
            label: 'Reports',
            icon: 'pi pi-chart-bar',
            items: [
                [
                    {
                        label: 'Analytics',
                        items: [
                            { label: 'Dashboards', icon: 'pi pi-chart-pie' },
                            { label: 'Charts', icon: 'pi pi-chart-line' },
                            { label: 'Exports', icon: 'pi pi-download' }
                        ]
                    }
                ]
            ]
        }
    ];

    // Dock Items
    dockItems: MenuItem[] = [
        { label: 'Home', icon: 'pi pi-home', tooltipOptions: { tooltipLabel: 'Home' } },
        { label: 'Search', icon: 'pi pi-search', tooltipOptions: { tooltipLabel: 'Search' } },
        { label: 'Entities', icon: 'pi pi-table', tooltipOptions: { tooltipLabel: 'Entities' } },
        { label: 'Reports', icon: 'pi pi-chart-bar', tooltipOptions: { tooltipLabel: 'Reports' } },
        { label: 'Messages', icon: 'pi pi-envelope', tooltipOptions: { tooltipLabel: 'Messages' } },
        { label: 'Calendar', icon: 'pi pi-calendar', tooltipOptions: { tooltipLabel: 'Calendar' } },
        { label: 'Users', icon: 'pi pi-users', tooltipOptions: { tooltipLabel: 'Users' } },
        { label: 'Settings', icon: 'pi pi-cog', tooltipOptions: { tooltipLabel: 'Settings' } }
    ];

    // Steps Items
    stepsItems: MenuItem[] = [
        { label: 'Personal', icon: 'pi pi-user' },
        { label: 'Account', icon: 'pi pi-key' },
        { label: 'Payment', icon: 'pi pi-credit-card' },
        { label: 'Confirmation', icon: 'pi pi-check-circle' }
    ];

    activeStepIndex = 1;

    OnContextMenu(event: MouseEvent) {
        event.preventDefault();
        this.contextMenu.show(event);
    }

    OnActiveStepChange(index: number) {
        this.activeStepIndex = index;
    }

}
