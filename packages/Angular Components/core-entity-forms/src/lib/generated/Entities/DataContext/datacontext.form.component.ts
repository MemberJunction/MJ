import { Component } from '@angular/core';
import { DataContextEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadDataContextDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Data Contexts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-datacontext-form',
    templateUrl: './datacontext.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DataContextFormComponent extends BaseFormComponent {
    public record!: DataContextEntity;
} 

export function LoadDataContextFormComponent() {
    LoadDataContextDetailsComponent();
}
