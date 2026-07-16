import { Component } from '@angular/core';
import { MJMLPortTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: ML Port Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlporttype-form',
    templateUrl: './mjmlporttype.form.component.html'
})
export class MJMLPortTypeFormComponent extends BaseFormComponent {
    public record!: MJMLPortTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJMLComponentSlots', sectionName: 'ML Component Slots', isExpanded: false },
            { sectionKey: 'mJMLComponentPorts', sectionName: 'ML Component Ports', isExpanded: false },
            { sectionKey: 'mJMLPortAdaptersToPortTypeID', sectionName: 'ML Port Adapters (To Port Type ID)', isExpanded: false },
            { sectionKey: 'mJMLPortAdaptersFromPortTypeID', sectionName: 'ML Port Adapters (From Port Type ID)', isExpanded: false }
        ]);
    }
}

