import { Component } from '@angular/core';
import { MJComponentDependenciesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Component Dependencies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcomponentdependencies-form',
    templateUrl: './mjcomponentdependencies.form.component.html'
})
export class MJComponentDependenciesFormComponent extends BaseFormComponent {
    public record!: MJComponentDependenciesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'componentRelationships', sectionName: 'Component Relationships', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

