import { Component } from '@angular/core';
import { ProductAssemblyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductAssemblyDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Product Assemblies') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productassembly-form',
    templateUrl: './productassembly.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductAssemblyFormComponent extends BaseFormComponent {
    public record!: ProductAssemblyEntity;
} 

export function LoadProductAssemblyFormComponent() {
    LoadProductAssemblyDetailsComponent();
}
