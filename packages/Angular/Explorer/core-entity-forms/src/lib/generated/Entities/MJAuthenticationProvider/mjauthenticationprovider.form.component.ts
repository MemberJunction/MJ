import { Component } from '@angular/core';
import { MJAuthenticationProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Authentication Providers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjauthenticationprovider-form',
    templateUrl: './mjauthenticationprovider.form.component.html'
})
export class MJAuthenticationProviderFormComponent extends BaseFormComponent {
    public record!: MJAuthenticationProviderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'technicalConfiguration', sectionName: 'Technical Configuration', isExpanded: true },
            { sectionKey: 'authenticationSettings', sectionName: 'Authentication Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

