import { Component } from '@angular/core';
import { hubspotcontractsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contracts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcontracts-form',
    templateUrl: './hubspotcontracts.form.component.html'
})
export class hubspotcontractsFormComponent extends BaseFormComponent {
    public record!: hubspotcontractsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'contractDetails', sectionName: 'Contract Details', isExpanded: true },
            { sectionKey: 'contractTimeline', sectionName: 'Contract Timeline', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

