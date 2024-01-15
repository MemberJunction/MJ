import { Component } from '@angular/core';
import { OutputFormatTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadOutputFormatTypeDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Output Format Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-outputformattype-form',
    templateUrl: './outputformattype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OutputFormatTypeFormComponent extends BaseFormComponent {
    public record!: OutputFormatTypeEntity;
} 

export function LoadOutputFormatTypeFormComponent() {
    LoadOutputFormatTypeDetailsComponent();
}
