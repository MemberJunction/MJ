import { Component } from '@angular/core';
import { MJTaskDependenciesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Task Dependencies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtaskdependencies-form',
    templateUrl: './mjtaskdependencies.form.component.html'
})
export class MJTaskDependenciesFormComponent extends BaseFormComponent {
    public record!: MJTaskDependenciesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'taskReference', sectionName: 'Task Reference', isExpanded: true },
            { sectionKey: 'dependencyLink', sectionName: 'Dependency Link', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

