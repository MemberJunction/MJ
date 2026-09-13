import { Component } from '@angular/core';
import { MJAIPersonaVendorEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Persona Vendors') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaipersonavendor-form',
    templateUrl: './mjaipersonavendor.form.component.html'
})
export class MJAIPersonaVendorFormComponent extends BaseFormComponent {
    public record!: MJAIPersonaVendorEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'bindingDetails', sectionName: 'Binding Details', isExpanded: true },
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

