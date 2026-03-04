import { Component } from '@angular/core';
import { VolunteerLogEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Volunteer Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-volunteerlog-form',
    templateUrl: './volunteerlog.form.component.html'
})
export class VolunteerLogFormComponent extends BaseFormComponent {
    public record!: VolunteerLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

