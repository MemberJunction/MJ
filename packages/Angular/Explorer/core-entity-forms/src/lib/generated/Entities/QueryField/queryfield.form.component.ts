import { Component } from '@angular/core';
import { QueryFieldEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Query Fields') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-queryfield-form',
    templateUrl: './queryfield.form.component.html'
})
export class QueryFieldFormComponent extends BaseFormComponent {
    public record!: QueryFieldEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'fieldDefinitionPresentation', sectionName: 'Field Definition & Presentation', isExpanded: true },
            { sectionKey: 'dataTypeSourceMapping', sectionName: 'Data Type & Source Mapping', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadQueryFieldFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
