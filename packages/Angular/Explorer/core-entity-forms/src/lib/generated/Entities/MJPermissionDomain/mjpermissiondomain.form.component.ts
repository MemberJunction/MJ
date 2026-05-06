import { Component } from '@angular/core';
import { MJPermissionDomainEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Permission Domains') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjpermissiondomain-form',
    templateUrl: './mjpermissiondomain.form.component.html'
})
export class MJPermissionDomainFormComponent extends BaseFormComponent {
    public record!: MJPermissionDomainEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'domainConfiguration', sectionName: 'Domain Configuration', isExpanded: true },
            { sectionKey: 'providerImplementation', sectionName: 'Provider Implementation', isExpanded: true },
            { sectionKey: 'providerCapabilities', sectionName: 'Provider Capabilities', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

