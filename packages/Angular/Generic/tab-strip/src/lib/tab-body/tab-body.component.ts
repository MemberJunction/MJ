
import { Component, Input, Host } from '@angular/core';
import { MJTabBase } from '../tab.base';
import { MJTabStripComponent } from '../tab-strip/tab-strip.component';

@Component({
  standalone: false,
  selector: 'mj-tab-body',
  templateUrl: './tab-body.component.html',
  styleUrl: './tab-body.component.css'
})
export class MJTabBodyComponent extends MJTabBase {
  @Input() TabVisible = false;

  @Input() FillWidth: boolean = true;
  @Input() FillHeight: boolean = true;
  
  constructor(@Host() private tabStrip: MJTabStripComponent) {
    super();
  }
}
