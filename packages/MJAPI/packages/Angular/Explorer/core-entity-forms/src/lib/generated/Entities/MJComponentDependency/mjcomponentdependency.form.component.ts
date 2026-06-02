import { Component } from '@angular/core';
import { MJComponentDependencyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Component Dependencies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcomponentdependency-form',
    templateUrl: './mjcomponentdependency.form.component.html'
})
export class MJComponentDependencyFormComponent extends BaseFormComponent {
    public record!: MJComponentDependencyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'componentRelationships', sectionName: 'Component Relationships', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

