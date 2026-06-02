import { Component } from '@angular/core';
import { hubspotdomainsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Domains') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotdomains-form',
    templateUrl: './hubspotdomains.form.component.html'
})
export class hubspotdomainsFormComponent extends BaseFormComponent {
    public record!: hubspotdomainsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'domainConfiguration', sectionName: 'Domain Configuration', isExpanded: true },
            { sectionKey: 'usageSettings', sectionName: 'Usage Settings', isExpanded: true },
            { sectionKey: 'securityAndDNS', sectionName: 'Security and DNS', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

