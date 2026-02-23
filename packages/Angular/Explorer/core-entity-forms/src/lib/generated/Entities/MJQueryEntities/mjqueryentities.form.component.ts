import { Component } from '@angular/core';
import { MJQueryEntitiesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Query Entities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjqueryentities-form',
    templateUrl: './mjqueryentities.form.component.html'
})
export class MJQueryEntitiesFormComponent extends BaseFormComponent {
    public record!: MJQueryEntitiesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiers', sectionName: 'Identifiers', isExpanded: true },
            { sectionKey: 'queryMapping', sectionName: 'Query Mapping', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

