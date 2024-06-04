import { Component } from '@angular/core';
import { DataContextItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDataContextItemDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Data Context Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-datacontextitem-form',
    templateUrl: './datacontextitem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DataContextItemFormComponent extends BaseFormComponent {
    public record!: DataContextItemEntity;
} 

export function LoadDataContextItemFormComponent() {
    LoadDataContextItemDetailsComponent();
}
