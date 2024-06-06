import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-root',
  template: '<h1>Hello, {{name}}</h1>'
})
export class AppComponent {
  @Input() name: string = 'World';
}
