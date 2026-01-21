import { Component } from '@angular/core';
import { flyway_schema_historyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Flyway _schema _histories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-flyway_schema_history-form',
    templateUrl: './flyway_schema_history.form.component.html'
})
export class flyway_schema_historyFormComponent extends BaseFormComponent {
    public record!: flyway_schema_historyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function Loadflyway_schema_historyFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
