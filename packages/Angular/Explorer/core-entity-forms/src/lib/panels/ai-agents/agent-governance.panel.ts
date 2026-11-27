import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import { MJAIAgentEntity } from '@memberjunction/core-entities';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { AgentInvocationOpenRequestedEventArgs } from '@memberjunction/ng-agents';
import { SharedService } from '@memberjunction/ng-shared';
import { AGENT_SECTION_KEYS } from './agent-form-helpers';

/**
 * Invocations & Rubrics panel (`BaseFormPanel` — `after-fields`, `sortKey: 130`, `inclusion: 'Primary'`).
 *
 * Claims `MJ: AI Agent Rubrics` and combines both `<mj-agent-invocations>` ("what runs this
 * agent when I'm not looking?") and `<mj-agent-rubrics>` under one clean left-rail item with
 * segmented sub-tabs.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'ai-agents:governance',
    skipNullKeyWarning: true,
    metadata: {
        entity: 'MJ: AI Agents',
        slot: 'after-fields',
        sortKey: 130,
        contributionKey: AGENT_SECTION_KEYS.Governance,
        sectionKey: AGENT_SECTION_KEYS.Governance,
        relatedEntity: 'MJ: AI Agent Rubrics',
        relatedJoinField: 'AgentID',
        inclusion: 'Primary',
    },
})
@Component({
    standalone: false,
    selector: 'mj-ai-agent-governance-panel',
    templateUrl: './agent-governance.panel.html',
    styleUrls: ['./agent-governance.panel.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentGovernancePanel extends BaseFormPanel<MJAIAgentEntity> {
    public readonly SectionKey = AGENT_SECTION_KEYS.Governance;
    public ActiveTab: 'invocations' | 'rubrics' = 'invocations';

    public SetTab(tab: 'invocations' | 'rubrics'): void {
        this.ActiveTab = tab;
    }

    public OnInvocationOpenRequested(args: AgentInvocationOpenRequestedEventArgs): void {
        if (!args?.EntityName || !args?.RecordID) return;
        SharedService.Instance.OpenEntityRecord(args.EntityName, CompositeKey.FromID(args.RecordID));
    }
}

export function LoadAgentGovernancePanel(): void {
    /* no-op marker */
}
