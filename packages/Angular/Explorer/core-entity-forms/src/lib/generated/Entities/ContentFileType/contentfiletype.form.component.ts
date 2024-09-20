import { Component } from '@angular/core';
import { ContentFileTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContentFileTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Content File Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contentfiletype-form',
    templateUrl: './contentfiletype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContentFileTypeFormComponent extends BaseFormComponent {
    public record!: ContentFileTypeEntity;
} 

export function LoadContentFileTypeFormComponent() {
    LoadContentFileTypeDetailsComponent();
}
