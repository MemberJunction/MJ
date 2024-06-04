import { Component } from '@angular/core';
import { VectorDatabaseEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadVectorDatabaseDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Vector Databases') // Tell MemberJunction about this class
@Component({
    selector: 'gen-vectordatabase-form',
    templateUrl: './vectordatabase.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class VectorDatabaseFormComponent extends BaseFormComponent {
    public record!: VectorDatabaseEntity;
} 

export function LoadVectorDatabaseFormComponent() {
    LoadVectorDatabaseDetailsComponent();
}
