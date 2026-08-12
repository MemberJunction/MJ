import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { MJEmptyStateComponent, MJAlertComponent, MJAccordionModule, MJButtonDirective } from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';

import { AgentPermissionsPanelComponent } from './components/agent-permissions-panel.component';
import { AgentPermissionsDialogComponent } from './components/agent-permissions-dialog.component';
import { AgentPermissionsSlideoverComponent } from './components/agent-permissions-slideover.component';
import { SkillPermissionsPanelComponent } from './components/skill-permissions-panel.component';
import { SkillPermissionsDialogComponent } from './components/skill-permissions-dialog.component';
import { CreateAgentPanelComponent } from './components/create-agent-panel.component';
import { CreateAgentDialogComponent } from './components/create-agent-dialog.component';
import { CreateAgentSlideInComponent } from './components/create-agent-slidein.component';
import { AgentInvocationsComponent } from './components/agent-invocations.component';

/**
 * Module providing reusable AI Agent UI components.
 *
 * Components:
 * - `<mj-agent-permissions-panel>` — Embeddable permissions manager
 * - `<mj-agent-permissions-dialog>` — Centered modal dialog wrapper
 * - `<mj-agent-permissions-slideover>` — Right-side slide-over wrapper
 * - `<mj-skill-permissions-panel>` — Embeddable AI Skill permissions manager
 * - `<mj-skill-permissions-dialog>` — Centered modal dialog wrapper for skill permissions
 * - `<mj-create-agent-panel>` — Embeddable agent creation form
 * - `<mj-create-agent-dialog>` — Centered modal dialog for agent creation
 * - `<mj-create-agent-slidein>` — Right-side slide-in for agent creation
 * - `<mj-agent-invocations>` — Read-only index of every automated pathway that invokes an agent
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
        SkillPermissionsPanelComponent,
        SkillPermissionsDialogComponent,
        CreateAgentPanelComponent,
        CreateAgentDialogComponent,
        CreateAgentSlideInComponent,
        AgentInvocationsComponent
    ],
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        MJEmptyStateComponent,
        MJAlertComponent,
        MJAccordionModule,
        MJButtonDirective,
        SharedGenericModule
    ],
    exports: [
        AgentPermissionsPanelComponent,
        AgentPermissionsDialogComponent,
        AgentPermissionsSlideoverComponent,
        SkillPermissionsPanelComponent,
        SkillPermissionsDialogComponent,
        CreateAgentPanelComponent,
        CreateAgentDialogComponent,
        CreateAgentSlideInComponent,
        AgentInvocationsComponent
    ]
})
export class AgentsModule {}
