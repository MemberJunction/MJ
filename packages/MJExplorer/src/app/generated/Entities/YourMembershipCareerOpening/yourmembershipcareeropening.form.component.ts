import { Component } from '@angular/core';
import { YourMembershipCareerOpeningEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Career Openings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipcareeropening-form',
    templateUrl: './yourmembershipcareeropening.form.component.html'
})
export class YourMembershipCareerOpeningFormComponent extends BaseFormComponent {
    public record!: YourMembershipCareerOpeningEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'jobDetails', sectionName: 'Job Details', isExpanded: true },
            { sectionKey: 'locationContact', sectionName: 'Location & Contact', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

