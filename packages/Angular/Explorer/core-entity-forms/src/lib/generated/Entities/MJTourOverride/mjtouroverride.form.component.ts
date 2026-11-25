import { Component } from '@angular/core';
import { MJTourOverrideEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Tour Overrides') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtouroverride-form',
    templateUrl: './mjtouroverride.form.component.html'
})
export class MJTourOverrideFormComponent extends BaseFormComponent {
    public record!: MJTourOverrideEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tourAndScopeConfiguration', sectionName: 'Tour and Scope Configuration', isExpanded: true },
            { sectionKey: 'customizationPayloads', sectionName: 'Customization Payloads', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

