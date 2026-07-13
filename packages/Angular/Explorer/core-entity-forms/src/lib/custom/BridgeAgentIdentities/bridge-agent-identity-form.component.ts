import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { MJAIBridgeAgentIdentityEntity } from '@memberjunction/core-entities';
import { MJAIBridgeAgentIdentityFormComponent } from '../../generated/Entities/MJAIBridgeAgentIdentity/mjaibridgeagentidentity.form.component';

/**
 * Custom form for 'MJ: AI Bridge Agent Identities' (Pattern 2). An identity
 * binds an agent to a stable address on a bridge provider (an account id, an
 * email, or a phone number) so the platform can route inbound calls / invites
 * to the right agent. Adds a short provisioning hint above the generated
 * field panels; the rest is the standard generated layout.
 */
@RegisterClass(BaseFormComponent, 'MJ: AI Bridge Agent Identities')
@Component({
    standalone: false,
    selector: 'mj-ai-bridge-agent-identity-form',
    templateUrl: './bridge-agent-identity-form.component.html',
    styleUrls: ['./bridge-agent-identity-form.component.css'],
})
export class MJAIBridgeAgentIdentityFormComponentExtended extends MJAIBridgeAgentIdentityFormComponent {
    public override record!: MJAIBridgeAgentIdentityEntity;

    /** Human-readable hint for the current IdentityType. */
    public get IdentityTypeHint(): string {
        switch (this.record?.IdentityType) {
            case 'Email':
                return 'An email address the provider treats as the agent. Invites sent here add the agent to the meeting; provision it as a real mailbox / calendar identity on the platform.';
            case 'PhoneNumber':
                return 'An E.164 phone number routed to the agent. Inbound calls to this number reach the agent; outbound dial uses it as the caller identity. Provision it with the telephony provider.';
            case 'AccountID':
                return "The provider's native account / bot id for the agent. Used when a host adds the agent from inside the platform's own UI. Provision it via the platform's marketplace app.";
            default:
                return 'Provision the identity with the bridge provider before activating it — inbound routing depends on the platform recognizing this value.';
        }
    }
}

/** Tree-shake guard — invoked from the custom-forms module loader. */
export function LoadMJAIBridgeAgentIdentityFormComponentExtended(): void {
    /* no-op marker */
}
