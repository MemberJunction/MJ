import { Component } from '@angular/core';
import { MJEntityIndexEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Entity Indices') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityindex-form',
    templateUrl: './mjentityindex.form.component.html'
})
export class MJEntityIndexFormComponent extends BaseFormComponent {
    public record!: MJEntityIndexEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJEntityIndexFields', sectionName: 'Entity Index Fields', isExpanded: false }
        ]);
    }
}

