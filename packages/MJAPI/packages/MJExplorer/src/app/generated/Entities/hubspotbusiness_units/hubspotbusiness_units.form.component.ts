import { Component } from '@angular/core';
import { hubspotbusiness_unitsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Business Units') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotbusiness_units-form',
    templateUrl: './hubspotbusiness_units.form.component.html'
})
export class hubspotbusiness_unitsFormComponent extends BaseFormComponent {
    public record!: hubspotbusiness_unitsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'businessUnitOverview', sectionName: 'Business Unit Overview', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

