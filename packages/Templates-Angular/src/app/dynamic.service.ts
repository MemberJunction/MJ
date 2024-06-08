// import {
//     Injectable,
//     Type,
//     Component,
//     ViewContainerRef,
//     ComponentRef,
//     EnvironmentInjector,
//   } from '@angular/core';
//   import { CommonModule } from '@angular/common';
//   import { createComponent } from '@angular/core';
  
//   @Injectable({
//     providedIn: 'root',
//   })
//   export class DELETE_DynsamicComponasdfsadfsadfasdfdsasafentServdice {
//     constructor(private injector: EnvironmentInjector) {}
  
//     async createComponent(
//       template: string,
//       styles: string[],
//       container: ViewContainerRef
//     ): Promise<ComponentRef<any>> {
//       const componentType = this.createComponentType(template, styles);
  
//       // Create an instance of the component
//       const componentRef = createComponent(componentType, {
//         environmentInjector: this.injector,
//         hostElement: container.element.nativeElement,
//       });
  
//       return componentRef;
//     }
  
//     private createComponentType(template: string, styles: string[]): Type<any> {
//       @Component({
//         template,
//         styles,
//       })
//       class DynamicComponent {}
  
//       return DynamicComponent;
//     }
//   }
  



  