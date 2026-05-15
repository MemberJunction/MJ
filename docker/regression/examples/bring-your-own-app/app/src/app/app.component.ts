import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterOutlet],
  template: `
    <nav>
      <a routerLink="/counter">Counter</a>
      <a routerLink="/contact">Contact</a>
    </nav>
    <router-outlet></router-outlet>
  `,
})
export class AppComponent {}
