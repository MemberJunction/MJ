import { Component } from '@angular/core';
import { AssociationDemoEmailClickEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Email Clicks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoemailclick-form',
    templateUrl: './associationdemoemailclick.form.component.html'
})
export class AssociationDemoEmailClickFormComponent extends BaseFormComponent {
    public record!: AssociationDemoEmailClickEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'emailEngagement', sectionName: 'Email Engagement', isExpanded: true },
            { sectionKey: 'clickDetails', sectionName: 'Click Details', isExpanded: true },
            { sectionKey: 'technicalContext', sectionName: 'Technical Context', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

