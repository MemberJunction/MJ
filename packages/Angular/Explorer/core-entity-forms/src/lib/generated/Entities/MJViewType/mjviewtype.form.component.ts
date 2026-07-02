import { Component } from '@angular/core';
import { MJViewTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: View Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjviewtype-form',
    templateUrl: './mjviewtype.form.component.html'
})
export class MJViewTypeFormComponent extends BaseFormComponent {
    public record!: MJViewTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJUserViews', sectionName: 'User Views', isExpanded: false }
        ]);
    }
}

