import { Directive, ElementRef, Input, OnDestroy, OnInit } from '@angular/core';
import { LogError, LogStatus } from '@memberjunction/core';
import { fromEvent, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { MJEventType, MJGlobal } from '@memberjunction/global';

/**
 * Directive that automatically resizes an element to fill its parent container.
 * This directive calculates and sets dimensions based on the parent container's size,
 * accounting for the element's position within the parent and any specified margins.
 * 
 * It listens for window resize events and custom MJ application events to update dimensions.
 * The directive is context-aware and will automatically skip resizing in certain conditions.
 *
 * @example
 * <!-- Basic usage (fills both width and height) -->
 * <div >Content</div>
 *
 * <!-- With custom settings -->
 * <div  [fillWidth]="true" [fillHeight]="true" [rightMargin]="10" [bottomMargin]="20">
 *   Content with margins
 * </div>
 */
@Directive({
  standalone: false,
  selector: '[mjFillContainer]'
})
export class FillContainer implements OnInit, OnDestroy {
  /** Whether to fill the parent's width. Default is true. */
  @Input() fillWidth: boolean = true;
  
  /** Whether to fill the parent's height. Default is true. */
  @Input() fillHeight: boolean = true;
  
  /** Right margin in pixels. Default is 0. */
  @Input() rightMargin: number = 0;
  
  /** Bottom margin in pixels. Default is 0. */
  @Input() bottomMargin: number = 0;

  /** Flag to globally disable resize functionality for all instances */
  public static DisableResize: boolean = false;
  
  /** Flag to enable debug logging for resize operations */
  public static OutputDebugInfo: boolean = false;
  
  /**
   * Outputs a debug message if OutputDebugInfo is enabled
   * @param message The message to output
   */
  protected static OutputDebugMessage(message: string): void {
    if (FillContainer.OutputDebugInfo) {
      console.log(message);
    }
  }

  constructor(private elementRef: ElementRef) {
  }

  /** Debounce time for resize events during active resizing (milliseconds) */
  private _resizeDebounceTime: number = 100;
  
  /** Debounce time for resize end events (milliseconds) */
  private _resizeEndDebounceTime: number = 500;

  /** Subscription for resize end events */
  private _resizeSubscription: Subscription | null = null;
  
  /** Subscription for immediate resize events */
  private _resizeImmediateSubscription: Subscription | null = null;

  /**
   * Initializes the directive, sets up resize event listeners and performs initial resize
   */
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

  /**
   * Cleans up subscriptions when the directive is destroyed
   */
  ngOnDestroy(): void {
    this._resizeImmediateSubscription?.unsubscribe();
    this._resizeSubscription?.unsubscribe();
  }

  /**
   * Finds the nearest block-level parent element
   * @param element The element to find the parent for
   * @returns The parent element or null if none found
   */
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
  
  /**
   * Performs the actual resize calculation and applies dimensions to the element
   */
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

  /**
   * Determines if resizing should be skipped for this element
   * @param el The element to check
   * @returns True if resizing should be skipped, false otherwise
   */
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

  /**
   * Checks if element is below a hidden tab
   * @param element The element to check
   * @returns True if element is below a hidden tab, false otherwise
   */
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
  
  /**
   * Checks if element is within a grid
   * @param element The element to check
   * @returns True if element is within a grid, false otherwise
   */
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