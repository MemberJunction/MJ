import { Component } from '@angular/core';
import { HubSpotDealTaskEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Deal Tasks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotdealtask-form',
    templateUrl: './hubspotdealtask.form.component.html'
})
export class HubSpotDealTaskFormComponent extends BaseFormComponent {
    public record!: HubSpotDealTaskEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'taskAssociation', sectionName: 'Task Association', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

