import { Component } from '@angular/core';
import { MJTaskDependencyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Task Dependencies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtaskdependency-form',
    templateUrl: './mjtaskdependency.form.component.html'
})
export class MJTaskDependencyFormComponent extends BaseFormComponent {
    public record!: MJTaskDependencyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'taskReference', sectionName: 'Task Reference', isExpanded: true },
            { sectionKey: 'dependencyLink', sectionName: 'Dependency Link', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

