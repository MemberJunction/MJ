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
            { sectionKey: 'registrationContext', sectionName: 'Registration Context', isExpanded: true },
            { sectionKey: 'componentConfiguration', sectionName: 'Component Configuration', isExpanded: true },
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'layoutConfiguration', sectionName: 'Layout Configuration', isExpanded: true },
            { sectionKey: 'relatedDataMapping', sectionName: 'Related Data Mapping', isExpanded: true },
            { sectionKey: 'chromeAndPresentation', sectionName: 'Chrome and Presentation', isExpanded: true },
            { sectionKey: 'accessControl', sectionName: 'Access Control', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

