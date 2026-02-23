import { Component } from '@angular/core';
import { MJEntityAIActionsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity AI Actions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityaiactions-form',
    templateUrl: './mjentityaiactions.form.component.html'
})
export class MJEntityAIActionsFormComponent extends BaseFormComponent {
    public record!: MJEntityAIActionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identificationRelationships', sectionName: 'Identification & Relationships', isExpanded: true },
            { sectionKey: 'aIActionConfiguration', sectionName: 'AI Action Configuration', isExpanded: true },
            { sectionKey: 'metadataNotes', sectionName: 'Metadata & Notes', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

