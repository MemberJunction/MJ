import { Component } from '@angular/core';
import { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: External Data Sources') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjexternaldatasource-form',
    templateUrl: './mjexternaldatasource.form.component.html'
})
export class MJExternalDataSourceFormComponent extends BaseFormComponent {
    public record!: MJExternalDataSourceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJQueries', sectionName: 'Queries', isExpanded: false },
            { sectionKey: 'mJEntities', sectionName: 'Entities', isExpanded: false }
        ]);
    }
}

