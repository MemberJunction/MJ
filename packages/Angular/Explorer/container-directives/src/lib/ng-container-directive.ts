import { Directive, ViewContainerRef } from '@angular/core';

@Directive({
  selector: '[mjContainer]',
})
export class Container {
  constructor(public viewContainerRef: ViewContainerRef) { }

}
