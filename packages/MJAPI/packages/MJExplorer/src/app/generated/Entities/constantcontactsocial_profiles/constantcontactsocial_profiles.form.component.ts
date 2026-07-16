import { Component } from '@angular/core';
import { constantcontactsocial_profilesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Social Profiles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactsocial_profiles-form',
    templateUrl: './constantcontactsocial_profiles.form.component.html'
})
export class constantcontactsocial_profilesFormComponent extends BaseFormComponent {
    public record!: constantcontactsocial_profilesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

