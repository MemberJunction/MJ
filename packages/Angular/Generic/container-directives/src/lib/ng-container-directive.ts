import { Directive, ViewContainerRef } from '@angular/core';

/**
 * Directive that exposes a ViewContainerRef for dynamic component loading.
 * This is used to create a reference point for dynamically loading components
 * into the DOM without manually handling ViewContainerRef injection.
 * 
 * @example
 * <!-- In template -->
 * <div mjContainer></div>
 *
 * <!-- In component -->
 * @ViewChild(Container, { static: true }) container!: Container;
 * // Now you can use this.container.viewContainerRef for dynamic component creation
 */
@Directive({
  standalone: false,
  selector: '[mjContainer]',
})
export class Container {
  /**
   * Constructor that exposes the ViewContainerRef for the element
   * @param viewContainerRef The ViewContainerRef for the element this directive is applied to
   */
  constructor(public viewContainerRef: ViewContainerRef) { }
}
