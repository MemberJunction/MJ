import { Component } from '@angular/core';
import { flyway_schema_historyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { Loadflyway_schema_historyDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'flyway _schema _histories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-flyway_schema_history-form',
    templateUrl: './flyway_schema_history.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class flyway_schema_historyFormComponent extends BaseFormComponent {
    public record!: flyway_schema_historyEntity;
} 

export function Loadflyway_schema_historyFormComponent() {
    Loadflyway_schema_historyDetailsComponent();
}
