import { Component } from '@angular/core';
import { ScheduledActionParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Scheduled Action Params') // Tell MemberJunction about this class
@Component({
    selector: 'gen-scheduledactionparam-form',
    templateUrl: './scheduledactionparam.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ScheduledActionParamFormComponent extends BaseFormComponent {
    public record!: ScheduledActionParamEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadScheduledActionParamFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
