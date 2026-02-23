import { Component } from '@angular/core';
import { MJPublicLinksEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Public Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjpubliclinks-form',
    templateUrl: './mjpubliclinks.form.component.html'
})
export class MJPublicLinksFormComponent extends BaseFormComponent {
    public record!: MJPublicLinksEntity;

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

