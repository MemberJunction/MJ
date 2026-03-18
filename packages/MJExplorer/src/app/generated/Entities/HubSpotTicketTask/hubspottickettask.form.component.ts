import { Component } from '@angular/core';
import { HubSpotTicketTaskEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Ticket Tasks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspottickettask-form',
    templateUrl: './hubspottickettask.form.component.html'
})
export class HubSpotTicketTaskFormComponent extends BaseFormComponent {
    public record!: HubSpotTicketTaskEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'taskAssociation', sectionName: 'Task Association', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

