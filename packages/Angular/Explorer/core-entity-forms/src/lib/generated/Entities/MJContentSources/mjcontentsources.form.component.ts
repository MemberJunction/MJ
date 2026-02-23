import { Component } from '@angular/core';
import { MJContentSourcesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Content Sources') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontentsources-form',
    templateUrl: './mjcontentsources.form.component.html'
})
export class MJContentSourcesFormComponent extends BaseFormComponent {
    public record!: MJContentSourcesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'contentClassification', sectionName: 'Content Classification', isExpanded: true },
            { sectionKey: 'connectionDetails', sectionName: 'Connection Details', isExpanded: false },
            { sectionKey: 'contentItems', sectionName: 'Content Items', isExpanded: false },
            { sectionKey: 'contentProcessRuns', sectionName: 'Content Process Runs', isExpanded: false },
            { sectionKey: 'contentSourceParams', sectionName: 'Content Source Params', isExpanded: false }
        ]);
    }
}

