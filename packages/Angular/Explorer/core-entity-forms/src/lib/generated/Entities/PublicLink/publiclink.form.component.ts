import { Component } from '@angular/core';
import { PublicLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Public Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-publiclink-form',
    templateUrl: './publiclink.form.component.html'
})
export class PublicLinkFormComponent extends BaseFormComponent {
    public record!: PublicLinkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'resourceReference', sectionName: 'Resource Reference', isExpanded: true },
            { sectionKey: 'linkCore', sectionName: 'Link Core', isExpanded: true },
            { sectionKey: 'accessControls', sectionName: 'Access Controls', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadPublicLinkFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
