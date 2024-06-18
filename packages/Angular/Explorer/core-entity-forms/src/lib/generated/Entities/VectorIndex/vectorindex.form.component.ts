import { Component } from '@angular/core';
import { VectorIndexEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadVectorIndexDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Vector Indexes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-vectorindex-form',
    templateUrl: './vectorindex.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class VectorIndexFormComponent extends BaseFormComponent {
    public record!: VectorIndexEntity;
} 

export function LoadVectorIndexFormComponent() {
    LoadVectorIndexDetailsComponent();
}
