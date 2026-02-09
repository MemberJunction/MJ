import { Component } from '@angular/core';
import { UserApplicationEntityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'User Application Entities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-userapplicationentity-form',
    templateUrl: './userapplicationentity.form.component.html'
})
export class UserApplicationEntityFormComponent extends BaseFormComponent {
    public record!: UserApplicationEntityEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'linkIdentifiers', sectionName: 'Link Identifiers', isExpanded: true },
            { sectionKey: 'userPersonalization', sectionName: 'User Personalization', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

