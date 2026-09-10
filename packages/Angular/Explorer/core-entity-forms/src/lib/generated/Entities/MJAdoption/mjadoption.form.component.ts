import { Component } from '@angular/core';
import { MJAdoptionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Adoptions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjadoption-form',
    templateUrl: './mjadoption.form.component.html'
})
export class MJAdoptionFormComponent extends BaseFormComponent {
    public record!: MJAdoptionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'adoptionParticipants', sectionName: 'Adoption Participants', isExpanded: true },
            { sectionKey: 'adoptionWorkflow', sectionName: 'Adoption Workflow', isExpanded: true },
            { sectionKey: 'financialDetails', sectionName: 'Financial Details', isExpanded: true },
            { sectionKey: 'adoptionDetails', sectionName: 'Adoption Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

