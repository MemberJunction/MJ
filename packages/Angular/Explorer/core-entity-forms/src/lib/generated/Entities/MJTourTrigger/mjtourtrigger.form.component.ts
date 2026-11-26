import { Component } from '@angular/core';
import { MJTourTriggerEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Tour Triggers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtourtrigger-form',
    templateUrl: './mjtourtrigger.form.component.html'
})
export class MJTourTriggerFormComponent extends BaseFormComponent {
    public record!: MJTourTriggerEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tourAssociation', sectionName: 'Tour Association', isExpanded: true },
            { sectionKey: 'triggerRules', sectionName: 'Trigger Rules', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

