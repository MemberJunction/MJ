import { Directive, ElementRef, Input, OnDestroy, OnInit } from '@angular/core';
import { LogError, LogStatus } from '@memberjunction/core';
import { fromEvent, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { MJEventType, MJGlobal } from '@memberjunction/global';

@Directive({
  selector: '[mjFillContainer]'
})
export class FillContainer implements OnInit, OnDestroy {
  
  @Input() fillWidth: boolean = true;
  @Input() fillHeight: boolean = true;
  @Input() rightMargin: number = 0;
  @Input() bottomMargin: number = 0;

  constructor(private elementRef: ElementRef) {}

  private _resizeDebounceTime: number = 100;
  private _resizeEndDebounceTime: number = 500;
  ngOnInit(): void {
    const el = this.elementRef.nativeElement as HTMLElement;
    if (el && el.style) { 
      this.resizeElement();
      // This will fire more frequently while the user is resizing
      this.resizeImmediateSubscription = fromEvent(window, 'resize')
        .pipe(debounceTime(this._resizeDebounceTime))
        .subscribe(() => this.resizeElement());
  
      // This will fire once the user has stopped resizing for _resizeEndDebounceTime milliseconds
      this.resizeEndSubscription = fromEvent(window, 'resize')
        .pipe(debounceTime(this._resizeEndDebounceTime))
        .subscribe(() => this.resizeElement());
  
      // also subscribe to MJGlobal events so we can monitor for a manually invoked resize event request
      // from another component
      MJGlobal.Instance.GetEventListener(true).subscribe((event) => {
        if (event.event === MJEventType.ManualResizeRequest) {
          this.resizeElement();
        }
      });  
    }
  }

  private resizeImmediateSubscription: Subscription | null = null;
  private resizeEndSubscription: Subscription | null = null;

  ngOnDestroy(): void {
    this.resizeImmediateSubscription?.unsubscribe();
    this.resizeEndSubscription?.unsubscribe();
  }

  getParent(element: HTMLElement): HTMLElement | null {
    const parent = element.parentElement;
    if (parent && parent.nodeName === 'APP-ROOT') {
      let curElement = parent.parentElement;
      // go to root of the DOM to get HTML element as that has size info
      while (curElement && curElement.nodeName !== 'HTML') {
        curElement = curElement.parentElement;
      }
      return curElement;
    }
    else if (parent) {
      let style = window.getComputedStyle(parent);
      let display = style.getPropertyValue('display');
      
      if (display === 'block') {
        return parent;
      } else {
        return this.getParent(parent); // recursive call, need to go up the DOM until we find a block element
      }      
    }
    else
      return null; // no parent
  }
  resizeElement(): void {
    const element = this.elementRef.nativeElement as HTMLElement;
    try {
      if (element && element.style) {
        const parent = this.getParent(element);
  
        if (parent && !this.elementBelowHiddenTab(element)) {      
          let parentStyle = window.getComputedStyle(parent);
          if (parentStyle.visibility === 'hidden' || parentStyle.display === 'none') {
            LogStatus('skipping hidden element: ' + parent.nodeName )
          }
          else {
            const parentRect = parent.getBoundingClientRect();
            if (parent.nodeName === 'HTML') {
              parentRect.height = window.innerHeight;
            }
            const elementRect = element.getBoundingClientRect();
  
            
            let paddingTop = parseInt(parentStyle.getPropertyValue('padding-top'));
            let paddingLeft = parseInt(parentStyle.getPropertyValue('padding-left'));
  
            if (this.fillWidth) {
              const widthVariance = (elementRect.left - parentRect.left) + paddingLeft + (paddingLeft > 0 ? 1 : 0); // add 1 to account for rounding errors
              const newWidth = Math.floor(parentRect.width - this.rightMargin - widthVariance);
              if (Math.floor(elementRect.width) !== newWidth) {
                element.style.width = newWidth + 'px';
                //LogStatus('setting ' + element.nodeName + ' width to ' + newWidth + ' from ' + elementRect.width)  
              }
            }
  
            if (this.fillHeight) {
              const heightVariance = (elementRect.top - parentRect.top) + paddingTop + (paddingTop > 0 ? 1 : 0); // add 1 to account for rounding errors   
              const newHeight = Math.floor(parentRect.height - this.bottomMargin - heightVariance);          
              if (Math.floor(elementRect.height) !== newHeight) {
                element.style.height = newHeight + 'px';  
                //LogStatus('setting ' + element.nodeName + ' height to ' + newHeight + ' from ' + elementRect.height)  
              }
            }
          }
        }    
      }
    }
    catch (err) {
      LogError(err);
    }
  }

  protected elementBelowHiddenTab(element: HTMLElement): boolean {
    // check if the element is below a hidden tab, a hidden tab will have a class of .k-tabstrip-content and also have .k-active applied
    // we can go all the way up the tree to look for this
    let parent = element.parentElement;
    while (parent) {
      if (parent.role === 'tabpanel') {
        // element is below a tab
        if(!parent.classList.contains('k-active')) 
          return true; //  tab is NOT active
        else
          return false; // tab IS active
      }
      parent = parent.parentElement;
    }
    // not below a tab at all
    return false;
  }

}