import { Component } from '@angular/core';
import { hubspotcustom_coded_actionsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Custom Coded Actions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcustom_coded_actions-form',
    templateUrl: './hubspotcustom_coded_actions.form.component.html'
})
export class hubspotcustom_coded_actionsFormComponent extends BaseFormComponent {
    public record!: hubspotcustom_coded_actionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'actionDefinition', sectionName: 'Action Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

