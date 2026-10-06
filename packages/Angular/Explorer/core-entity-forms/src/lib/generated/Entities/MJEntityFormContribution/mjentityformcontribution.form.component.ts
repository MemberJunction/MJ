import { Component } from '@angular/core';
import { MJEntityFormContributionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Form Contributions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityformcontribution-form',
    templateUrl: './mjentityformcontribution.form.component.html'
})
export class MJEntityFormContributionFormComponent extends BaseFormComponent {
    public record!: MJEntityFormContributionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'targetConfiguration', sectionName: 'Target Configuration', isExpanded: true },
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'overrideLogic', sectionName: 'Override Logic', isExpanded: true },
            { sectionKey: 'replacementLogic', sectionName: 'Replacement Logic', isExpanded: true },
            { sectionKey: 'displaySettings', sectionName: 'Display Settings', isExpanded: true },
            { sectionKey: 'accessControl', sectionName: 'Access Control', isExpanded: true },
            { sectionKey: 'lifecycleManagement', sectionName: 'Lifecycle Management', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

