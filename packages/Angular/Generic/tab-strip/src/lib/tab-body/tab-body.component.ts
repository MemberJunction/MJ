
import { Component, ElementRef, Host, Input } from '@angular/core';
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

  /** @deprecated No longer read — the body sizes to content and the HOST owns region sizing. Kept only so existing bindings compile; remove on the next major. */
  @Input() FillWidth: boolean = true;
  /** @deprecated No longer read — the body sizes to content and the HOST owns region sizing. Kept only so existing bindings compile; remove on the next major. */
  @Input() FillHeight: boolean = true;
  
  constructor(@Host() private tabStrip: MJTabStripComponent, public elementRef: ElementRef) {
    super();
  }
}
