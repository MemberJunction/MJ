import { Component } from '@angular/core';
import { MJActionContextTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Action Context Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjactioncontexttype-form',
    templateUrl: './mjactioncontexttype.form.component.html'
})
export class MJActionContextTypeFormComponent extends BaseFormComponent {
    public record!: MJActionContextTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'contextDefinition', sectionName: 'Context Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJActionContexts', sectionName: 'Action Contexts', isExpanded: false }
        ]);
    }
}

