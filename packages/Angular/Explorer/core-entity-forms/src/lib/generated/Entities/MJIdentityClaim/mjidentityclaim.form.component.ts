import { Component } from '@angular/core';
import { MJIdentityClaimEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Identity Claims') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjidentityclaim-form',
    templateUrl: './mjidentityclaim.form.component.html'
})
export class MJIdentityClaimFormComponent extends BaseFormComponent {
    public record!: MJIdentityClaimEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'claimDetails', sectionName: 'Claim Details', isExpanded: true },
            { sectionKey: 'targetResource', sectionName: 'Target Resource', isExpanded: true },
            { sectionKey: 'technicalConfiguration', sectionName: 'Technical Configuration', isExpanded: true },
            { sectionKey: 'claimLifecycle', sectionName: 'Claim Lifecycle', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

