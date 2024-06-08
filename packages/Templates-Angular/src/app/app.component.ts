// import { Component, OnInit } from '@angular/core';
// import { RouterOutlet } from '@angular/router';
// import { TemplateEngineService } from './templates';

// @Component({
//   selector: 'app-root',
//   standalone: true,
//   imports: [RouterOutlet],
//   templateUrl: './app.component.html'
// })
// export class AppComponent implements OnInit {
//   title = 'test';
//   counter = 0;

//   constructor(private templateEngine: TemplateEngineService) {
//   }
//   async ngOnInit() {
//     if (0 === this.counter++) {
//       const result = await this.templateEngine.render('B', { FirstName: 'John', LastName: 'Badass', Title: 'El Jefe' });
//       console.log(result); 
//     }
//   }
// }
