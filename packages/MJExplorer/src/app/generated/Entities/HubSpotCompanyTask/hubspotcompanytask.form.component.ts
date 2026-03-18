import { Component } from '@angular/core';
import { HubSpotCompanyTaskEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Company Tasks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcompanytask-form',
    templateUrl: './hubspotcompanytask.form.component.html'
})
export class HubSpotCompanyTaskFormComponent extends BaseFormComponent {
    public record!: HubSpotCompanyTaskEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'taskAssociation', sectionName: 'Task Association', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

