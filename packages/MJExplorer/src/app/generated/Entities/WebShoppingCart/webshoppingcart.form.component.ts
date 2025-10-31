import { Component } from '@angular/core';
import { WebShoppingCartEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadWebShoppingCartDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Web Shopping Carts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-webshoppingcart-form',
    templateUrl: './webshoppingcart.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class WebShoppingCartFormComponent extends BaseFormComponent {
    public record!: WebShoppingCartEntity;
} 

export function LoadWebShoppingCartFormComponent() {
    LoadWebShoppingCartDetailsComponent();
}
