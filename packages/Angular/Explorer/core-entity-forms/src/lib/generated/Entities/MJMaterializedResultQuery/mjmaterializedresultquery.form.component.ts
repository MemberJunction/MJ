import { Component } from '@angular/core';
import { MJMaterializedResultQueryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Materialized Result Queries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmaterializedresultquery-form',
    templateUrl: './mjmaterializedresultquery.form.component.html'
})
export class MJMaterializedResultQueryFormComponent extends BaseFormComponent {
    public record!: MJMaterializedResultQueryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

