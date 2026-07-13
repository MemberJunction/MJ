import { Component } from '@angular/core';
import { MJAIRemoteBrowserProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Remote Browser Providers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjairemotebrowserprovider-form',
    templateUrl: './mjairemotebrowserprovider.form.component.html'
})
export class MJAIRemoteBrowserProviderFormComponent extends BaseFormComponent {
    public record!: MJAIRemoteBrowserProviderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'technicalConfiguration', sectionName: 'Technical Configuration', isExpanded: true },
            { sectionKey: 'operationalSettings', sectionName: 'Operational Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

