import { Component } from '@angular/core';
import { MJQueryDependencyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Query Dependencies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjquerydependency-form',
    templateUrl: './mjquerydependency.form.component.html'
})
export class MJQueryDependencyFormComponent extends BaseFormComponent {
    public record!: MJQueryDependencyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'dependencyRelationships', sectionName: 'Dependency Relationships', isExpanded: true },
            { sectionKey: 'compositionDetails', sectionName: 'Composition Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

