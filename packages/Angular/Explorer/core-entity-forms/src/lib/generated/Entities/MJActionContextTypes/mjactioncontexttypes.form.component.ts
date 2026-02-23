import { Component } from '@angular/core';
import { MJActionContextTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Action Context Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjactioncontexttypes-form',
    templateUrl: './mjactioncontexttypes.form.component.html'
})
export class MJActionContextTypesFormComponent extends BaseFormComponent {
    public record!: MJActionContextTypesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'contextDefinition', sectionName: 'Context Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'actionContexts', sectionName: 'Action Contexts', isExpanded: false }
        ]);
    }
}

