import { Directive, ElementRef, Renderer2, Input, OnInit } from '@angular/core';
import { EntityField, LogError } from '@memberjunction/core';
import { BaseLink } from './ng-base-link';

@Directive({
  standalone: false,
  selector: '[mjEmailLink]'
})
export class EmailLink extends BaseLink implements OnInit {
  @Input('field') field!: EntityField; // Input variable to get the fieldInfo

  constructor(private el: ElementRef, private renderer: Renderer2) {
    super();
  }

  ngOnInit() {
    const extendedType = this.field.EntityFieldInfo.ExtendedType;
    if (extendedType && extendedType.trim().toLowerCase() === 'email') 
        this.CreateLink(this.el, this.field, this.renderer, 'mailto:' + this.field.Value, true);
    else 
        LogError('Entity Field must have ExtendedType of URL to use the mjWebLink directive. Field:' + this.field.Name);
 }
}