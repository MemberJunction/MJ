import { Component } from '@angular/core';
import { UserApplicationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'User Applications') // Tell MemberJunction about this class
@Component({
    selector: 'gen-userapplication-form',
    templateUrl: './userapplication.form.component.html'
})
export class UserApplicationFormComponent extends BaseFormComponent {
    public record!: UserApplicationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiers', sectionName: 'Identifiers', isExpanded: true },
            { sectionKey: 'displaySettings', sectionName: 'Display Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entities', sectionName: 'Entities', isExpanded: false }
        ]);
    }
}

export function LoadUserApplicationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
