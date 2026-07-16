import { Component } from '@angular/core';
import { constantcontactevents_registrationsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Events Registrations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactevents_registrations-form',
    templateUrl: './constantcontactevents_registrations.form.component.html'
})
export class constantcontactevents_registrationsFormComponent extends BaseFormComponent {
    public record!: constantcontactevents_registrationsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

