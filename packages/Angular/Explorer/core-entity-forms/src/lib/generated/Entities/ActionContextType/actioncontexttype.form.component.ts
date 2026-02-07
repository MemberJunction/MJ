import { Component } from '@angular/core';
import { ActionContextTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Action Context Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-actioncontexttype-form',
    templateUrl: './actioncontexttype.form.component.html'
})
export class ActionContextTypeFormComponent extends BaseFormComponent {
    public record!: ActionContextTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'contextDefinition', sectionName: 'Context Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'actionContexts', sectionName: 'Action Contexts', isExpanded: false }
        ]);
    }
}

export function LoadActionContextTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
