import { Component } from '@angular/core';
import { QueryEntityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Query Entities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-queryentity-form',
    templateUrl: './queryentity.form.component.html'
})
export class QueryEntityFormComponent extends BaseFormComponent {
    public record!: QueryEntityEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiers', sectionName: 'Identifiers', isExpanded: true },
            { sectionKey: 'queryMapping', sectionName: 'Query Mapping', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadQueryEntityFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
