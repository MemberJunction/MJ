import { Component } from '@angular/core';
import { TaggedItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadTaggedItemDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Tagged Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-taggeditem-form',
    templateUrl: './taggeditem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TaggedItemFormComponent extends BaseFormComponent {
    public record!: TaggedItemEntity;
} 

export function LoadTaggedItemFormComponent() {
    LoadTaggedItemDetailsComponent();
}
