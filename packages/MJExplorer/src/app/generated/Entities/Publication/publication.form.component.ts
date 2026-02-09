import { Component } from '@angular/core';
import { PublicationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Publications') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-publication-form',
    templateUrl: './publication.form.component.html'
})
export class PublicationFormComponent extends BaseFormComponent {
    public record!: PublicationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'corePublicationInfo', sectionName: 'Core Publication Info', isExpanded: true },
            { sectionKey: 'salesAvailability', sectionName: 'Sales & Availability', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

