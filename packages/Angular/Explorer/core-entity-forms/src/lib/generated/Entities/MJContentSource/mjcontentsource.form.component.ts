import { Component } from '@angular/core';
import { MJContentSourceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Content Sources') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontentsource-form',
    templateUrl: './mjcontentsource.form.component.html'
})
export class MJContentSourceFormComponent extends BaseFormComponent {
    public record!: MJContentSourceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'contentClassification', sectionName: 'Content Classification', isExpanded: true },
            { sectionKey: 'connectionDetails', sectionName: 'Connection Details', isExpanded: false },
            { sectionKey: 'mJContentItems', sectionName: 'Content Items', isExpanded: false },
            { sectionKey: 'mJContentProcessRuns', sectionName: 'Content Process Runs', isExpanded: false },
            { sectionKey: 'mJContentSourceParams', sectionName: 'Content Source Params', isExpanded: false }
        ]);
    }
}

