import { Component } from '@angular/core';
import { AssociationDemoEventRegistrationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Event Registrations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoeventregistration-form',
    templateUrl: './associationdemoeventregistration.form.component.html'
})
export class AssociationDemoEventRegistrationFormComponent extends BaseFormComponent {
    public record!: AssociationDemoEventRegistrationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

