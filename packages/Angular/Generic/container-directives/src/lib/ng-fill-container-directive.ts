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


  public static DisableResize: boolean = false;
  public static OutputDebugInfo: boolean = false;
  protected static OutputDebugMessage(message: string): void {
    if (FillContainer.OutputDebugInfo) {
      console.log(message);
    }
  }

  constructor(private elementRef: ElementRef) {
  }

  private _resizeDebounceTime: number = 100;
  private _resizeEndDebounceTime: number = 500;

  private _resizeSubscription: Subscription | null = null;
  private _resizeImmediateSubscription: Subscription | null = null;

  ngOnInit(): void {
    const el = this.elementRef.nativeElement as HTMLElement;
    if (el && el.style) { 
      // initial resize
      FillContainer.OutputDebugMessage('');
      FillContainer.OutputDebugMessage('Initial resize event');
      this.resizeElement();

      // This will fire more frequently while the user is resizing so use a shorter debounce time
      this._resizeImmediateSubscription = fromEvent(window, 'resize')
        .pipe(debounceTime(this._resizeDebounceTime))
        .subscribe(() => {
          FillContainer.OutputDebugMessage('');
          FillContainer.OutputDebugMessage('RECEIVED resize event');
          this.resizeElement()
        });
  
      // This will fire once the user has stopped resizing for _resizeEndDebounceTime milliseconds
      this._resizeSubscription = fromEvent(window, 'resize')
        .pipe(debounceTime(this._resizeEndDebounceTime))
        .subscribe(() => {
          FillContainer.OutputDebugMessage('');
          FillContainer.OutputDebugMessage('RECEIVED resize end event');
          this.resizeElement()
        });

      // // Subscribe once but handle both scenarios
      // this._resizeSubscription = fromEvent(window, 'resize').pipe(
      //   throttleTime(this._resizeDebounceTime),  // handles frequent resizes
      //   tap(() => {
      //     this.resizeElement();
      //     FillContainer.OutputDebugMessage('RECEIVED resize event');
      //   }),
      //   debounceTime(this._resizeEndDebounceTime),  // handles end of resizing
      //   finalize(() => {
      //     this.resizeElement();
      //     FillContainer.OutputDebugMessage('RECEIVED resize end event');
      //   })
      // ).subscribe();
        
  
      // also subscribe to MJGlobal events so we can monitor for a manually invoked resize event request
      // from another component
      MJGlobal.Instance.GetEventListener(true)
        //.pipe(debounceTime(this._resizeDebounceTime))
        .subscribe((event) => {
        if (event.event === MJEventType.ManualResizeRequest) {
          FillContainer.OutputDebugMessage('');
          FillContainer.OutputDebugMessage('RECEIVED manual resize request');
          this.resizeElement();
        }
      });  
    }
  }


  ngOnDestroy(): void {
    this._resizeImmediateSubscription?.unsubscribe();
    this._resizeSubscription?.unsubscribe();
  }

  protected getParent(element: HTMLElement): HTMLElement | null {
    let curElement: HTMLElement | null = element;
    while (curElement && curElement.nodeName !== 'HTML') {
      if (curElement.parentElement && window.getComputedStyle(curElement.parentElement).display === 'block') {
        return curElement.parentElement;
      }
      curElement = curElement.parentElement;
    }
    return curElement;
  }
  

  protected resizeElement(): void {
    if (FillContainer.DisableResize) {
      // global disable flag
      return;
    }

    const element = this.elementRef.nativeElement as HTMLElement;
    try {
      if (element && element.style && !this.shouldSkipResize(element)) {
        const parent = this.getParent(element);
  
        if (parent && !this.elementBelowHiddenTab(element)) {      
          let parentStyle = window.getComputedStyle(parent);
          if (parentStyle.visibility === 'hidden' || parentStyle.display === 'none') {
            LogStatus('skipping hidden element: ' + parent.nodeName )
          }
          else {
            FillContainer.OutputDebugMessage('Resizing element: ' + element.nodeName + ' parent: ' + parent.nodeName);

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
              }
            }
  
            if (this.fillHeight) {
              const heightVariance = (elementRect.top - parentRect.top) + paddingTop + (paddingTop > 0 ? 1 : 0); // add 1 to account for rounding errors   
              const newHeight = Math.floor(parentRect.height - this.bottomMargin - heightVariance);          
              if (Math.floor(elementRect.height) !== newHeight) {
                element.style.height = newHeight + 'px';  
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

  // Function to check if element or its parents have the 'mjSkipResize' attribute or if a parent is within a grid
  protected shouldSkipResize(el: HTMLElement): boolean {
    let cur: HTMLElement | null = el;
    while (cur) {
        if (cur.hasAttribute('mjSkipResize') || cur.role === 'grid') {
            return true;
        }
        cur = cur.parentElement;
    }
    return false;
  };

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
  protected elementWithinGrid(element: HTMLElement): boolean {
    // check if the element is within a kendo grid 
    let parent = element.parentElement;
    while (parent) {
      if (parent.role === 'grid') {
        // element is below a grid
        return true;  
      }
      parent = parent.parentElement;
    }
    // not below a grid
    return false;
  }

}