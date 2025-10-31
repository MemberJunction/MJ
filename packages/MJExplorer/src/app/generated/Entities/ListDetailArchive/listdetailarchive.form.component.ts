import { Component } from '@angular/core';
import { ListDetailArchiveEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadListDetailArchiveDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'List Detail Archives') // Tell MemberJunction about this class
@Component({
    selector: 'gen-listdetailarchive-form',
    templateUrl: './listdetailarchive.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ListDetailArchiveFormComponent extends BaseFormComponent {
    public record!: ListDetailArchiveEntity;
} 

export function LoadListDetailArchiveFormComponent() {
    LoadListDetailArchiveDetailsComponent();
}
