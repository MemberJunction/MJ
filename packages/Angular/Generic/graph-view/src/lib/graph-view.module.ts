import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GraphViewComponent } from './components/graph-view.component';

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        GraphViewComponent
    ],
    exports: [
        GraphViewComponent
    ]
})
export class GraphViewModule {}
