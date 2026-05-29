import { Component } from '@angular/core';
import { MJPublicLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Public Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjpubliclink-form',
    templateUrl: './mjpubliclink.form.component.html'
})
export class MJPublicLinkFormComponent extends BaseFormComponent {
    public record!: MJPublicLinkEntity;

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

