import { Component } from '@angular/core';
import { hubspotvisitor_identificationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Visitor Identifications') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotvisitor_identification-form',
    templateUrl: './hubspotvisitor_identification.form.component.html'
})
export class hubspotvisitor_identificationFormComponent extends BaseFormComponent {
    public record!: hubspotvisitor_identificationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'visitorInformation', sectionName: 'Visitor Information', isExpanded: true },
            { sectionKey: 'integrationMapping', sectionName: 'Integration Mapping', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

