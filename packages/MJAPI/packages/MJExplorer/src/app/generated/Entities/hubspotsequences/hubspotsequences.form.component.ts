import { Component } from '@angular/core';
import { hubspotsequencesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Sequences') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotsequences-form',
    templateUrl: './hubspotsequences.form.component.html'
})
export class hubspotsequencesFormComponent extends BaseFormComponent {
    public record!: hubspotsequencesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'performanceAndConfiguration', sectionName: 'Performance and Configuration', isExpanded: true },
            { sectionKey: 'sequenceDetails', sectionName: 'Sequence Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

