import { Component } from '@angular/core';
import { ContentItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContentItemDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Content Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contentitem-form',
    templateUrl: './contentitem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContentItemFormComponent extends BaseFormComponent {
    public record!: ContentItemEntity;
} 

export function LoadContentItemFormComponent() {
    LoadContentItemDetailsComponent();
}
