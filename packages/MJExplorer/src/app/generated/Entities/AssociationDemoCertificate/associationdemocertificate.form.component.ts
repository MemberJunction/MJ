import { Component } from '@angular/core';
import { AssociationDemoCertificateEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Certificates') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemocertificate-form',
    templateUrl: './associationdemocertificate.form.component.html'
})
export class AssociationDemoCertificateFormComponent extends BaseFormComponent {
    public record!: AssociationDemoCertificateEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'certificateDetails', sectionName: 'Certificate Details', isExpanded: true },
            { sectionKey: 'validityPeriod', sectionName: 'Validity Period', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

