import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AgentPermissionsPanelComponent } from './components/agent-permissions-panel.component';
import { AgentPermissionsDialogComponent } from './components/agent-permissions-dialog.component';
import { AgentPermissionsSlideoverComponent } from './components/agent-permissions-slideover.component';

/**
 * Module providing reusable AI Agent UI components.
 *
 * Components:
 * - `<mj-agent-permissions-panel>` — Embeddable permissions manager
 * - `<mj-agent-permissions-dialog>` — Centered modal dialog wrapper
 * - `<mj-agent-permissions-slideover>` — Right-side slide-over wrapper
 *
 * Usage:
 * ```typescript
 * import { AgentsModule } from '@memberjunction/ng-agents';
 *
 * @NgModule({ imports: [AgentsModule] })
 * export class MyModule {}
 * ```
 */
@NgModule({
    declarations: [
        AgentPermissionsPanelComponent,
        AgentPermissionsDialogComponent,
        AgentPermissionsSlideoverComponent
    ],
    imports: [
        CommonModule,
        FormsModule
    ],
    exports: [
        AgentPermissionsPanelComponent,
        AgentPermissionsDialogComponent,
        AgentPermissionsSlideoverComponent
    ]
})
export class AgentsModule {}
