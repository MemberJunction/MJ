import { Component } from '@angular/core';
import { YourMembershipMembershipModifierEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Membership Modifiers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipmembershipmodifier-form',
    templateUrl: './yourmembershipmembershipmodifier.form.component.html'
})
export class YourMembershipMembershipModifierFormComponent extends BaseFormComponent {
    public record!: YourMembershipMembershipModifierEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'modifierConfiguration', sectionName: 'Modifier Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

