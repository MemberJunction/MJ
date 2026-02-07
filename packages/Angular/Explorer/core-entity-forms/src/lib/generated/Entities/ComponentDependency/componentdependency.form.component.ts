import { Component } from '@angular/core';
import { ComponentDependencyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Component Dependencies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-componentdependency-form',
    templateUrl: './componentdependency.form.component.html'
})
export class ComponentDependencyFormComponent extends BaseFormComponent {
    public record!: ComponentDependencyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'componentRelationships', sectionName: 'Component Relationships', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadComponentDependencyFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
