import { Component } from '@angular/core';
import { MJGraphTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Graph Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjgraphtype-form',
    templateUrl: './mjgraphtype.form.component.html'
})
export class MJGraphTypeFormComponent extends BaseFormComponent {
    public record!: MJGraphTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJGraphs', sectionName: 'Graphs', isExpanded: false }
        ]);
    }
}

