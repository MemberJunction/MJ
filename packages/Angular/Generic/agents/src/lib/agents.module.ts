import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { AgentPermissionsPanelComponent } from './components/agent-permissions-panel.component';
import { AgentPermissionsDialogComponent } from './components/agent-permissions-dialog.component';
import { AgentPermissionsSlideoverComponent } from './components/agent-permissions-slideover.component';
import { CreateAgentPanelComponent } from './components/create-agent-panel.component';
import { CreateAgentDialogComponent } from './components/create-agent-dialog.component';
import { CreateAgentSlideInComponent } from './components/create-agent-slidein.component';

/**
 * Module providing reusable AI Agent UI components.
 *
 * Components:
 * - `<mj-agent-permissions-panel>` — Embeddable permissions manager
 * - `<mj-agent-permissions-dialog>` — Centered modal dialog wrapper
 * - `<mj-agent-permissions-slideover>` — Right-side slide-over wrapper
 * - `<mj-create-agent-panel>` — Embeddable agent creation form
 * - `<mj-create-agent-dialog>` — Centered modal dialog for agent creation
 * - `<mj-create-agent-slidein>` — Right-side slide-in for agent creation
 *
 * Services:
 * - `CreateAgentService` — Programmatically open create agent dialogs/slide-ins
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
        AgentPermissionsSlideoverComponent,
        CreateAgentPanelComponent,
        CreateAgentDialogComponent,
        CreateAgentSlideInComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule
    ],
    exports: [
        AgentPermissionsPanelComponent,
        AgentPermissionsDialogComponent,
        AgentPermissionsSlideoverComponent,
        CreateAgentPanelComponent,
        CreateAgentDialogComponent,
        CreateAgentSlideInComponent
    ]
})
export class AgentsModule {}
