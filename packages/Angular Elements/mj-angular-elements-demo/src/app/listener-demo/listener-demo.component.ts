import { Component, OnInit, Input  } from '@angular/core';
import { MJGlobal, MJEvent } from '@memberjunction/global'

@Component({
  templateUrl: './listener-demo.component.html',
  styleUrls: ['./listener-demo.component.css']
})
export class MJListenerDemo implements OnInit {
  @Input() displayString: string = '';

  async ngOnInit() {
    MJGlobal.Instance.GetEventListener(true).subscribe( (e: MJEvent) => {
      console.log ( 'MJListenerDemo: MJGlobal.RegisterEventListener: display: ', e.args )
    })
  }
}
