import { Component } from '@angular/core';
import { ContentSourceTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContentSourceTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Content Source Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contentsourcetype-form',
    templateUrl: './contentsourcetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContentSourceTypeFormComponent extends BaseFormComponent {
    public record!: ContentSourceTypeEntity;
} 

export function LoadContentSourceTypeFormComponent() {
    LoadContentSourceTypeDetailsComponent();
}
