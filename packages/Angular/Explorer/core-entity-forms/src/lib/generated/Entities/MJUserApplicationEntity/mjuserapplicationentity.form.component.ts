import { Component } from '@angular/core';
import { MJUserApplicationEntityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: User Application Entities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjuserapplicationentity-form',
    templateUrl: './mjuserapplicationentity.form.component.html'
})
export class MJUserApplicationEntityFormComponent extends BaseFormComponent {
    public record!: MJUserApplicationEntityEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'linkIdentifiers', sectionName: 'Link Identifiers', isExpanded: true },
            { sectionKey: 'userPersonalization', sectionName: 'User Personalization', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

