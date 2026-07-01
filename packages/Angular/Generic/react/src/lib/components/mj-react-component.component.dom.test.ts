import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { MJReactComponent } from './mj-react-component.component';
import { ReactBridgeService } from '../services/react-bridge.service';
import { AngularAdapterService } from '../services/angular-adapter.service';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ComponentRegistry } from '@memberjunction/react-runtime';

/**
 * DOM tests for MJReactComponent.
 *
 * MJReactComponent hosts a React component compiled at runtime via @babel/standalone.
 * The real React bootstrap (ReactBridgeService.getReactContext / babel compilation /
 * reactRootManager) is NOT exercisable in jsdom and is out of scope for a DOM unit
 * test — that is the live/integration surface. What IS unit-testable is the component's
 * own Angular *template contract*: the loading-overlay gating
 *   @if (!isInitialized && !hasError) { ...overlay... }
 * and the container's conditional class
 *   [class.loading]="!isInitialized"
 *
 * To isolate that template contract we stub ReactBridgeService at the DI seam with a
 * never-resolving getReactContext(), so ngAfterViewInit's async initializeComponent()
 * starts but never flips isInitialized — leaving the component in its deterministic
 * initial render state. The internal isInitialized / hasError state for the other two
 * states is set BEFORE the first detectChanges() per the zoneless CD rule
 * (guides/ANGULAR_TESTING_GUIDE.md §5).
 */
describe('MJReactComponent (DOM)', () => {
  beforeEach(() => {
    // Never-resolving promise so initializeComponent() begins but never completes,
    // keeping the component in its initial (isInitialized=false) render state.
    const bridgeStub: Pick<ReactBridgeService, 'getReactContext' | 'waitForReactReady'> = {
      // Promise<never> never resolves AND is assignable to the methods' Promise<RuntimeContext>/Promise<void> returns.
      getReactContext: vi.fn(() => new Promise<never>(() => {})),
      waitForReactReady: vi.fn(() => new Promise<never>(() => {})),
    };
    // getRegistry() is called during ngOnDestroy -> cleanup(); return a real
    // (empty) registry so teardown's registry.cleanup() runs harmlessly.
    const registry = new ComponentRegistry();
    const adapterStub: Pick<AngularAdapterService, 'isInitialized' | 'getRegistry'> = {
      isInitialized: vi.fn(() => false),
      getRegistry: vi.fn(() => registry),
    };
    const notificationStub: Partial<MJNotificationService> = {};

    TestBed.configureTestingModule({
      imports: [CommonModule],
      declarations: [MJReactComponent],
      providers: [
        { provide: ReactBridgeService, useValue: bridgeStub },
        { provide: AngularAdapterService, useValue: adapterStub },
        { provide: MJNotificationService, useValue: notificationStub },
      ],
    });
  });

  function createFixture(): ComponentFixture<MJReactComponent> {
    return TestBed.createComponent(MJReactComponent);
  }

  it('renders the loading overlay and marks the container loading in the initial state', () => {
    const fixture = createFixture();
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('.loading-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay!.querySelector('.loading-spinner')).not.toBeNull();
    expect(overlay!.querySelector('.loading-text')?.textContent).toContain('Loading component');

    const container = fixture.nativeElement.querySelector('.react-component-container');
    expect(container).not.toBeNull();
    expect(container!.classList.contains('loading')).toBe(true);
  });

  it('always renders the react-component-wrapper host structure', () => {
    const fixture = createFixture();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.react-component-wrapper')).not.toBeNull();
    // The #container ViewChild target is always present (static: true).
    expect(fixture.componentInstance.container?.nativeElement).toBeTruthy();
  });

  it('hides the loading overlay and clears the loading class once initialized', () => {
    const fixture = createFixture();
    // Set internal state BEFORE first CD (zoneless-safe).
    fixture.componentInstance.isInitialized = true;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.loading-overlay')).toBeNull();

    const container = fixture.nativeElement.querySelector('.react-component-container');
    expect(container!.classList.contains('loading')).toBe(false);
  });

  it('hides the loading overlay when an error occurs (even before initialization)', () => {
    const fixture = createFixture();
    // isInitialized stays false; hasError gates the overlay off.
    fixture.componentInstance.hasError = true;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.loading-overlay')).toBeNull();
    // Container is still in the loading (opacity:0) class because not yet initialized.
    const container = fixture.nativeElement.querySelector('.react-component-container');
    expect(container!.classList.contains('loading')).toBe(true);
  });
});
