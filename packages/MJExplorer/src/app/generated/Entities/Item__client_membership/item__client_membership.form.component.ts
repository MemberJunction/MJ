import { Component } from '@angular/core';
import { Item__client_membershipEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadItem__client_membershipDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Items__client_membership') // Tell MemberJunction about this class
@Component({
    selector: 'gen-item__client_membership-form',
    templateUrl: './item__client_membership.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class Item__client_membershipFormComponent extends BaseFormComponent {
    public record!: Item__client_membershipEntity;
} 

export function LoadItem__client_membershipFormComponent() {
    LoadItem__client_membershipDetailsComponent();
}
