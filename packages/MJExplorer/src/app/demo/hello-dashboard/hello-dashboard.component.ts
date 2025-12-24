import { Component, OnDestroy, OnInit } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { CompositeKey, KeyValuePair, RunView } from '@memberjunction/core';
import { Subject, BehaviorSubject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { ResourceData } from '@memberjunction/core-entities';

/**
 * @fileoverview Hello Dashboard Component - A Comprehensive MemberJunction Dashboard Demo
 * 
 * OVERVIEW:
 * =========
 * This component serves as a comprehensive demonstration of how to create a fully custom dashboard
 * within the MemberJunction Explorer application. While the screensaver-style animation is intended to be a 
 * a bit playful, it showcases serious architectural patterns and integration techniques that are essential for
 * building production-quality business applications.
 * 
 * BUSINESS VALUE:
 * ===============
 * This example demonstrates how MemberJunction enables developers to create completely custom
 * user interfaces that can seamlessly integrate with the broader application ecosystem while
 * maintaining full control over user experience, data interaction, and business logic.
 * 
 * KEY ARCHITECTURAL PATTERNS DEMONSTRATED:
 * ========================================
 * 
 * 1. CUSTOM UI DEVELOPMENT:
 *    - Complete control over HTML, CSS, and TypeScript
 *    - Modern responsive design with CSS animations
 *    - Hardware-accelerated graphics for smooth performance
 *    - Custom event handling and user interactions
 * 
 * 2. MEMBERJUNCTION INTEGRATION:
 *    - Extends BaseDashboard for framework integration
 *    - Proper component registration with @RegisterClass
 *    - Lifecycle management (ngOnInit, ngOnDestroy, initDashboard, loadData, Refresh)
 *    - Event emission for container communication
 * 
 * 3. DATA ACCESS & PERSISTENCE:
 *    - RunView usage for querying entity data
 *    - UserState persistence for maintaining user preferences
 *    - RxJS-based debouncing to optimize database writes
 *    - Proper error handling and fallback mechanisms
 * 
 * 4. CONTAINER COMMUNICATION:
 *    - OpenEntityRecord.emit() for navigation requests
 *    - UserStateChanged.emit() for state persistence
 *    - Interaction.emit() for analytics and tracking
 *    - Proper event-driven architecture
 * 
 * 5. ADVANCED UI FEATURES:
 *    - Smooth 60fps animations using requestAnimationFrame
 *    - Time-based movement calculations for consistent performance
 *    - Responsive design that adapts to container resizing
 *    - Keyboard shortcuts for enhanced user experience
 *    - Visual feedback and accessibility considerations
 * 
 * 6. STATE MANAGEMENT:
 *    - Complex state object with multiple properties
 *    - Automatic state restoration on component load
 *    - Debounced updates to prevent database flooding
 *    - Proper cleanup and memory management
 * 
 * REAL-WORLD APPLICATIONS:
 * ========================
 * The patterns demonstrated here can be applied to build:
 * - Real-time monitoring dashboards
 * - Interactive data visualization components
 * - Custom form builders and editors
 * - Specialized business workflow interfaces
 * - Gaming or simulation interfaces
 * - Custom reporting and analytics views
 * 
 * SETUP INSTRUCTIONS:
 * ===================
 * To use this dashboard in your application:
 * 1. Create a record in the `Dashboard User Preferences` entity:
 *    INSERT INTO __mj.DashboardUserPreference (DashboardID, Scope, DisplayOrder) 
 *    VALUES ('61C9433E-F36B-1410-8DAB-00021F8B792E','Global',0)
 * 2. The DashboardID above corresponds to this HelloDemo component
 * 3. Adjust DisplayOrder to control positioning in the dashboard list
 * 
 * PERFORMANCE CONSIDERATIONS:
 * ===========================
 * - Uses requestAnimationFrame for optimal rendering performance
 * - Implements proper cleanup to prevent memory leaks
 * - Debounces database writes to reduce server load
 * - Uses CSS transforms for hardware-accelerated animations
 * - Minimizes DOM queries and caches element references
 * 
 * EXTENSIBILITY:
 * ==============
 * This component can be extended or modified to:
 * - Add more complex animations and interactions
 * - Integrate with different data sources
 * - Implement custom business logic
 * - Add real-time data updates via WebSockets
 * - Create multi-user collaborative features
 * 
 * @author MemberJunction Development Team
 * @since 2.0.x
 * @version 1.0.0
 * @category Dashboard Components
 * @example
 * // Register the component in your module
 * import { LoadHelloDashboard } from './path/to/hello-dashboard.component';
 * LoadHelloDashboard(); // Prevents tree-shaking
 */
@Component({
  selector: 'mj-hello-dashboard',
  templateUrl: './hello-dashboard.component.html',
  styleUrls: ['./hello-dashboard.component.scss']
})
@RegisterClass(BaseDashboard, 'HelloDemo')
/**
 * HelloDashboardComponent - A comprehensive demonstration dashboard for the MemberJunction framework.
 * 
 * This component showcases how to build completely custom dashboards that integrate seamlessly
 * with the MemberJunction ecosystem while providing full control over user experience and
 * business logic implementation.
 * 
 * @extends BaseDashboard - Provides core dashboard functionality and container communication
 * @implements OnInit - Angular lifecycle hook for component initialization
 * @implements OnDestroy - Angular lifecycle hook for proper cleanup
 * 
 * @example
 * ```typescript
 * // The component is automatically registered and available through the dashboard system
 * // No direct instantiation required - managed by the MemberJunction framework
 * ```
 */
export class HelloDashboardComponent extends BaseDashboard implements OnInit, OnDestroy {
  
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // COLOR MANAGEMENT PROPERTIES
  // ═══════════════════════════════════════════════════════════════════════════════════════
  
  /**
   * Array of vibrant colors used for the dynamic text color feature.
   * These colors are carefully chosen to provide good contrast and visual appeal.
   * 
   * @private
   * @readonly
   * @type {string[]}
   */
  private readonly colors: string[] = [
    '#FF5733', // Coral - Warm and inviting
    '#33FF57', // Lime - Bright and energetic  
    '#3357FF', // Blue - Professional and calm
    '#F033FF', // Magenta - Bold and creative
    '#FF33A6', // Pink - Playful and modern
    '#33FFF6', // Cyan - Cool and refreshing
    '#FFD133', // Gold - Luxury and premium
    '#9C33FF', // Purple - Innovative and unique
    '#FF8C33', // Orange - Enthusiastic and friendly
    '#FF6B6B', // Light Red - Soft and welcoming
    '#4ECDC4', // Teal - Modern and sophisticated
    '#45B7D1', // Sky Blue - Fresh and clean
    '#96CEB4', // Mint Green - Calming and natural
    '#FFEAA7', // Pastel Yellow - Cheerful and light
    '#DDA0DD', // Plum - Elegant and refined
    '#FFB6C1', // Light Pink - Gentle and sweet
    '#20B2AA', // Light Sea Green - Vibrant and lively
    '#87CEEB'  // Sky Blue - Peaceful and serene
  ];

  /**
   * The currently active text color for the main heading.
   * This value is bound to the template and changes when users interact with the color button.
   * 
   * @protected - Accessible in template binding
   * @type {string} - CSS color value (hex format)
   * @default First color from the colors array
   */
  protected textColor: string = this.colors[0];

  /**
   * The currently active theme color that affects multiple UI elements.
   * Used for buttons, icons, and background gradients throughout the component.
   * 
   * @protected - Accessible in template for theming multiple elements
   * @type {string} - CSS color value (hex format)
   * @default First color from the colors array
   */
  protected themeColor: string = this.colors[0];
  
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // ANIMATION SYSTEM PROPERTIES
  // ═══════════════════════════════════════════════════════════════════════════════════════
  
  /**
   * RequestAnimationFrame ID for the main animation loop.
   * Used to cancel the animation when the component is destroyed.
   * 
   * @private
   * @type {number}
   * @default 0
   */
  private animationFrame: number = 0;

  /**
   * Interval ID for the entity rotation timer.
   * Controls when the featured entity changes to a new random entity.
   * 
   * @private
   * @type {NodeJS.Timeout | null}
   */
  private entityChangeInterval: NodeJS.Timeout | null = null;

  /**
   * Flag indicating whether the screensaver animation is currently running.
   * Used to prevent multiple animation loops and manage lifecycle properly.
   * 
   * @private
   * @type {boolean}
   * @default false
   */
  private isAnimating: boolean = false;

  /**
   * Timestamp of the last animation frame for delta time calculations.
   * Essential for smooth, frame-rate independent movement calculations.
   * 
   * @private
   * @type {number} - Milliseconds since epoch (from performance.now())
   * @default 0
   */
  private lastTime: number = 0;
  
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // MOVEMENT AND POSITIONING PROPERTIES  
  // ═══════════════════════════════════════════════════════════════════════════════════════
  
  /**
   * Current position of the animated box in pixels relative to the container.
   * Updated every animation frame and bound to CSS transform in the template.
   * 
   * @protected - Accessible in template for transform binding
   * @type {{ x: number; y: number }}
   * @property {number} x - Horizontal position in pixels from left edge
   * @property {number} y - Vertical position in pixels from top edge
   */
  protected boxPosition = { x: 50, y: 50 };

  /**
   * Movement velocity in pixels per second for each axis.
   * Provides consistent movement speed regardless of frame rate variations.
   * 
   * @private
   * @type {{ x: number; y: number }}
   * @property {number} x - Horizontal velocity (pixels/second)
   * @property {number} y - Vertical velocity (pixels/second)
   */
  private velocity = { x: 80, y: 60 };

  /**
   * Speed multiplier for the animation (1.0 = normal speed).
   * User-controllable value that scales the base velocity for faster/slower movement.
   * Range: 0.25x (very slow) to 4.0x (very fast)
   * 
   * @protected - Accessible in template for speed display
   * @type {number}
   * @default 1.0
   */
  protected speed: number = 0.5;

  /**
   * Cached dimensions of the container element for bounce calculations.
   * Updated on resize events to ensure proper boundary detection.
   * 
   * @private
   * @type {{ width: number; height: number }}
   * @property {number} width - Container width in pixels
   * @property {number} height - Container height in pixels
   */
  private containerSize = { width: 800, height: 600 };

  /**
   * Cached dimensions of the animated box element for collision detection.
   * Used to calculate proper bounce boundaries within the container.
   * 
   * @private
   * @type {{ width: number; height: number }}
   * @property {number} width - Box width in pixels  
   * @property {number} height - Box height in pixels
   */
  private boxSize = { width: 400, height: 300 };
  
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // ENTITY SHOWCASE PROPERTIES
  // ═══════════════════════════════════════════════════════════════════════════════════════
  
  /**
   * Array of entity objects loaded from the database via RunView.
   * Contains all available entities that can be featured in the rotating display.
   * 
   * @protected - Used in template conditional rendering
   * @type {any[]} - Array of entity objects with Name/DisplayName properties
   * @default Empty array
   */
  protected entities: any[] = [];

  /**
   * Display name of the currently featured entity.
   * Rotates every 5 seconds to showcase different entities from the system.
   * 
   * @protected - Bound to template for display
   * @type {string}
   * @default 'Loading entities...'
   */
  protected featuredEntity: string = 'Loading entities...';

  /**
   * Full entity object for the currently featured entity.
   * Stored separately to enable the "Open" functionality with proper entity navigation.
   * 
   * @protected - Used in template for button state and click handling
   * @type {any | null} - Complete entity object or null if none selected
   * @default null
   */
  protected featuredEntityObject: any = null;
  
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // REACTIVE STATE MANAGEMENT PROPERTIES
  // ═══════════════════════════════════════════════════════════════════════════════════════
  
  /**
   * RxJS Subject for managing component destruction and cleanup.
   * Used with takeUntil operator to automatically unsubscribe from observables.
   * 
   * @private
   * @type {Subject<void>}
   */
  private destroy$ = new Subject<void>();

  /**
   * RxJS BehaviorSubject for debounced user state updates.
   * Prevents database flooding by batching rapid state changes into single updates.
   * 
   * @private
   * @type {BehaviorSubject<any>}
   * @default null
   */
  private userStateSubject = new BehaviorSubject<any>(null);
  
  /**
   * Flag indicating whether the user state persistence notification should be visible.
   * Shows a temporary message when state is successfully saved to the container.
   * 
   * @protected - Accessible in template for conditional display
   * @type {boolean}
   * @default false
   */
  protected showStateUpdateNotification: boolean = false;
  
  /**
   * Flag indicating whether the component is still loading initial state.
   * Used to show loading indicator and hide animation until ready.
   * 
   * @protected - Accessible in template for conditional display
   * @type {boolean}
   * @default true
   */
  protected isLoading: boolean = true;
  
  
  /**
   * Computed property that returns the current user state for persistence.
   * Only includes user preferences, not dynamic animation state like position.
   * 
   * @private
   * @readonly
   * @returns {object} User state object containing persistent preferences
   * @property {string} lastColor - The user's selected text color
   * @property {string} themeColor - The user's selected theme color  
   * @property {number} speed - Current animation speed multiplier
   * @property {string} featuredEntity - Currently displayed entity name
   */
  private get currentUserState() {
    return {
      lastColor: this.textColor,
      themeColor: this.themeColor,
      speed: this.speed,
      featuredEntity: this.featuredEntity
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // ANGULAR LIFECYCLE METHODS
  // ═══════════════════════════════════════════════════════════════════════════════════════

  /**
   * Angular OnInit lifecycle hook with MemberJunction integration.
   * Initializes the component by setting up all necessary systems for operation.
   * 
   * @override
   * @async
   * @returns {Promise<void>}
   * @throws {Error} If base class initialization fails
   * 
   * @example
   * ```typescript
   * // Called automatically by Angular - no manual invocation needed
   * // Sets up: state management, resize handling, keyboard controls
   * ```
   */
  override async ngOnInit(): Promise<void> {
    await super.ngOnInit();
    this.loadUserState();
    this.setupUserStateDebouncing();
    this.setupResizeListener();
    this.setupKeyboardListeners();
  }

  /**
   * Angular OnDestroy lifecycle hook with proper cleanup.
   * Ensures all resources are properly released to prevent memory leaks.
   * 
   * @override
   * @returns {void}
   * 
   * @example
   * ```typescript
   * // Called automatically by Angular when component is destroyed
   * // Cleans up: animations, event listeners, RxJS subscriptions
   * ```
   */
  override ngOnDestroy(): void {
    // Save any pending user state changes before destroying
    const currentState = this.currentUserState;
    if (currentState) {
      console.log('💾 HelloDashboard: Saving final user state on destroy:', currentState);
      this.UserStateChanged.emit(currentState);
    }
    
    
    super.ngOnDestroy();
    this.destroy$.next();
    this.destroy$.complete();
    this.stopAnimation();
    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('keydown', this.onKeyDown);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // INITIALIZATION AND SETUP METHODS
  // ═══════════════════════════════════════════════════════════════════════════════════════

  /**
   * Sets up RxJS-based debouncing for user state persistence with visual feedback.
   * Prevents database flooding by batching rapid state changes into single updates.
   * 
   * @private
   * @returns {void}
   * 
   * @example
   * ```typescript
   * // Automatically debounces state updates to every 3 seconds
   * this.updateUserState(); // Multiple rapid calls...
   * this.updateUserState(); // ...get batched into...  
   * this.updateUserState(); // ...single database write
   * ```
   */
  /**
   * Loads user state from Config.userState if available.
   * Only loads the 3 allowed values: speed, colors, and featured entity.
   * Cleans up any unwanted legacy values.
   */
  private loadUserState(): void {
    console.log('🔄 HelloDashboard: Loading user state during initialization');
    console.log('📋 HelloDashboard: Full Config object:', this.Config);
    
    const state = this.Config?.userState;
    console.log('💾 HelloDashboard: Retrieved user state:', state);
    
    if (state) {
      console.log('✅ HelloDashboard: Restoring state from saved data (only allowed values)');
      
      // Only restore these 3 values - ignore everything else
      // 1. Text color
      if (state.lastColor) {
        console.log(`🎨 HelloDashboard: Restoring text color: ${state.lastColor}`);
        this.textColor = state.lastColor;
      }
      
      // 2. Theme color (with fallback to text color for backward compatibility)
      if (state.themeColor) {
        console.log(`🎨 HelloDashboard: Restoring theme color: ${state.themeColor}`);
        this.themeColor = state.themeColor;
      } else if (state.lastColor) {
        console.log(`🎨 HelloDashboard: Using text color as theme fallback: ${state.lastColor}`);
        this.themeColor = state.lastColor; // Fallback for older saved states
      }
      
      // 3. Animation speed
      if (state.speed !== undefined) {
        console.log(`⚡ HelloDashboard: Restoring speed: ${state.speed}`);
        this.speed = state.speed;
      }
      
      // 4. Featured entity
      if (state.featuredEntity) {
        console.log(`🏢 HelloDashboard: Restoring featured entity: ${state.featuredEntity}`);
        this.featuredEntity = state.featuredEntity;
      }
      
      // Clean up user state by saving only the allowed values
      const cleanState = {
        lastColor: this.textColor,
        themeColor: this.themeColor,
        speed: this.speed,
        featuredEntity: this.featuredEntity
      };
      
      // If the current state has extra keys, clean it up
      if (Object.keys(state).length > 4 || 
          state.hasOwnProperty('boxPosition') || 
          state.hasOwnProperty('velocity') ||
          state.hasOwnProperty('curveMotion')) {
        console.log('🧪 HelloDashboard: Cleaning up legacy user state values');
        this.UserStateChanged.emit(cleanState);
      }
    } else {
      console.log('🆕 HelloDashboard: No saved state found, starting with slow speed and random colors');
      // Initialize with slow speed and random colors if no saved state
      this.speed = 0.5; // Start with slow speed
      this.setRandomColor();
    }
    
    console.log('🎯 HelloDashboard: Final component state after loading:', {
      textColor: this.textColor,
      themeColor: this.themeColor,
      speed: this.speed,
      featuredEntity: this.featuredEntity
    });
    
    // Mark loading as complete
    this.isLoading = false;
    this.NotifyLoadComplete();
    
    // Update container size after a delay to ensure DOM is fully rendered
    setTimeout(() => {
      console.log('🔄 HelloDashboard: Delayed container size update');
      this.updateContainerSize();
    }, 1000);
  }


  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return "Hello World Dashboard"
  }

  private setupUserStateDebouncing(): void {
    this.userStateSubject.pipe(
      debounceTime(3000), // Wait 3 seconds after last change
      takeUntil(this.destroy$) // Auto-cleanup on component destroy
    ).subscribe(state => {
      if (state) {
        console.log('🔄 HelloDashboard: Persisting user state to container:', state);
        
        // Emit the state change to the container
        this.UserStateChanged.emit(state);
        
        // Show notification that state was persisted
        this.showStateUpdateNotification = true;
        
        // Hide notification after 3 seconds
        setTimeout(() => {
          this.showStateUpdateNotification = false;
        }, 3000);
        
        // Debug: Log the current Config to see if container is responding
        setTimeout(() => {
          console.log('🔍 HelloDashboard: Current Config after state update:', this.Config);
        }, 1000);
      }
    });
  }
  
  /**
   * Sets up window resize event listener for responsive animation.
   * Ensures the animation boundaries adapt when the container size changes.
   * 
   * @private
   * @returns {void}
   */
  private setupResizeListener(): void {
    window.addEventListener('resize', this.onWindowResize);
  }
  
  /**
   * Handles window resize events with debounced container size updates.
   * Prevents excessive recalculations during continuous resize operations.
   * 
   * @private
   * @returns {void}
   */
  private onWindowResize = (): void => {
    if (this.isAnimating) {
      setTimeout(() => {
        this.updateContainerSize();
      }, 100); // Small delay to ensure DOM has updated
    }
  }
  
  /**
   * Sets up global keyboard event listeners for speed control shortcuts.
   * Enables users to control animation speed using +/- keys from anywhere in the app.
   * 
   * @private
   * @returns {void}
   */
  private setupKeyboardListeners(): void {
    window.addEventListener('keydown', this.onKeyDown);
  }
  
  /**
   * Handles keyboard events for animation speed control.
   * Provides keyboard shortcuts while respecting form input focus states.
   * 
   * @private
   * @param {KeyboardEvent} event - The keyboard event containing key information
   * @returns {void}
   * 
   * @example
   * ```typescript
   * // User presses '+' key -> calls this.speedUp()
   * // User presses '-' key -> calls this.slowDown()  
   * // Ignores keypresses when form inputs are focused
   * ```
   */
  private onKeyDown = (event: KeyboardEvent): void => {
    // Only handle keyboard events if the dashboard is visible and no input fields are focused
    if (document.activeElement?.tagName === 'INPUT' || 
        document.activeElement?.tagName === 'TEXTAREA') {
      return; // Don't interfere with form inputs
    }
    
    switch (event.key) {
      case '+':
      case '=': // Handle both + and = keys (+ requires shift)
        event.preventDefault();
        this.speedUp();
        break;
      case '-':
      case '_': // Handle both - and _ keys
        event.preventDefault();
        this.slowDown();
        break;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // STATE MANAGEMENT METHODS
  // ═══════════════════════════════════════════════════════════════════════════════════════

  /**
   * Triggers a debounced user state update through the RxJS pipeline.
   * Called frequently during animation but actual database writes are throttled.
   * 
   * @private
   * @returns {void}
   * 
   * @example
   * ```typescript
   * // Called during animation, color changes, speed adjustments
   * this.updateUserState(); // Queues update for debouncing
   * ```
   */
  private updateUserState(): void {
    const state = this.currentUserState;
    console.log('⏰ HelloDashboard: Queuing state update for debouncing:', state);
    this.userStateSubject.next(state);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // MEMBERJUNCTION DASHBOARD LIFECYCLE METHODS
  // ═══════════════════════════════════════════════════════════════════════════════════════

  /**
   * MemberJunction dashboard initialization hook.
   * Called after the base dashboard setup is complete to start component-specific functionality.
   * 
   * @protected
   * @override
   * @returns {void}
   * 
   * @example
   * ```typescript
   * // Called automatically by MemberJunction framework
   * // Starts the screensaver animation system
   * ```
   */
  protected override initDashboard(): void {
    // Only start animation if loading is complete
    if (!this.isLoading) {
      this.startAnimation();
    }
  }

  /**
   * MemberJunction data loading hook that demonstrates RunView usage.
   * Loads entity metadata to showcase in the rotating entity display.
   * 
   * @protected
   * @override
   * @async
   * @returns {Promise<void>}
   * @throws {Error} If RunView execution fails (handled gracefully with fallback data)
   * 
   * @example
   * ```typescript
   * // Called automatically by MemberJunction framework
   * // Demonstrates RunView for querying entity data
   * // Falls back to demo data if database is unavailable
   * ```
   */
  protected override async loadData(): Promise<void> {
    try {
      // NOTE: Normally, you would NOT use RunView to get Entity metadata as you can get it via the 
      // Metadata object as shown here: 
      //   const md = new Metadata();
      //   const allEntities = md.Entities;
      // However, this is a demo to show how you can use RunView to get data from an entity.
      // In a real application, you would use RunView to get data from a specific entity or view.
      // This is a demo, so we'll use RunView to get some entities
      // and then rotate through them as a screensaver-like feature.
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'Entities',
        OrderBy: 'Name',
        ExtraFilter: '', // You can specify any extra filter here if needed, any boolean expression that would work in a WHERE clause can go here
      });

      if (result && result.Success && result.Results) {
        this.entities = result.Results;
        if (this.entities.length > 0) {
          this.startEntityRotation();
        }
      }
    } catch (error) {
      console.error('Error loading entities:', error);
      // Fallback to demo data if database is unavailable
      this.entities = [
        { Name: 'Demo Entity 1', ID: '1' }, 
        { Name: 'Demo Entity 2', ID: '2' }, 
        { Name: 'Demo Entity 3', ID: '3' }
      ];
      this.startEntityRotation();
    }
  }

  /**
   * Start the classic screensaver animation
   */
  private startAnimation(): void {
    if (this.isAnimating) return;
    
    this.isAnimating = true;
    this.lastTime = performance.now();
    this.updateContainerSize();
    
    // Set random starting position within full container
    const maxWidth = this.containerSize.width - this.boxSize.width;
    const maxHeight = this.containerSize.height - this.boxSize.height;
    
    if (maxWidth > 0 && maxHeight > 0) {
      this.boxPosition.x = Math.random() * maxWidth;
      this.boxPosition.y = Math.random() * maxHeight;
    } else {
      // Fallback position if container is too small
      this.boxPosition.x = 50;
      this.boxPosition.y = 50;
    }
    
    // Always set initial velocity (classic screensaver style) - never load from state
    this.velocity.x = 80;
    this.velocity.y = 60;
    
    console.log('🎥 HelloDashboard: Starting animation with velocity:', this.velocity);
    console.log('📍 HelloDashboard: Starting position:', this.boxPosition);
    console.log('📏 HelloDashboard: Container size:', this.containerSize);
    console.log('📦 HelloDashboard: Box size:', this.boxSize);
    
    this.animate();
  }
  
  /**
   * Stop the animation
   */
  private stopAnimation(): void {
    this.isAnimating = false;
    
    if (this.entityChangeInterval) {
      clearInterval(this.entityChangeInterval);
    }
    
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }
  
  /**
   * Main animation loop using requestAnimationFrame for smooth 60fps
   */
  private animate = (currentTime: number = performance.now()): void => {
    if (!this.isAnimating) return;
    
    const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
    this.lastTime = currentTime;
    
    this.updateBoxPosition(deltaTime);
    
    this.animationFrame = requestAnimationFrame(this.animate);
  }
  
  /**
   * Update container and box sizes for responsive bouncing
   */
  private updateContainerSize(): void {
    const container = document.querySelector('.hello-dashboard-container') as HTMLElement;
    const box = document.querySelector('.greeting-box') as HTMLElement;
    
    if (container && box) {
      const containerRect = container.getBoundingClientRect();
      const boxRect = box.getBoundingClientRect();
      
      this.containerSize = {
        width: containerRect.width,
        height: containerRect.height
      };
      
      this.boxSize = {
        width: boxRect.width,
        height: boxRect.height
      };
    }
  }
  
  /**
   * Updates the animated box position with classic screensaver bouncing.
   * Simple velocity-based movement that reflects off edges using full container.
   * 
   * @private
   * @param {number} deltaTime - Time elapsed since last frame in seconds
   * @returns {void}
   */
  private updateBoxPosition(deltaTime: number): void {
    // Calculate movement based on time for consistent speed regardless of framerate
    const moveX = this.velocity.x * this.speed * deltaTime;
    const moveY = this.velocity.y * this.speed * deltaTime;
    
    // Update position
    this.boxPosition.x += moveX;
    this.boxPosition.y += moveY;
    
    // Calculate bounds using full container dimensions
    const minX = 0;
    const maxX = this.containerSize.width - this.boxSize.width;
    const minY = 0;
    const maxY = this.containerSize.height - this.boxSize.height;
    
    // Bounce off left and right edges
    if (this.boxPosition.x <= minX) {
      this.boxPosition.x = minX;
      this.velocity.x = Math.abs(this.velocity.x); // Bounce right
    } else if (this.boxPosition.x >= maxX) {
      this.boxPosition.x = maxX;
      this.velocity.x = -Math.abs(this.velocity.x); // Bounce left
    }
    
    // Bounce off top and bottom edges
    if (this.boxPosition.y <= minY) {
      this.boxPosition.y = minY;
      this.velocity.y = Math.abs(this.velocity.y); // Bounce down
    } else if (this.boxPosition.y >= maxY) {
      this.boxPosition.y = maxY;
      this.velocity.y = -Math.abs(this.velocity.y); // Bounce up
    }
  }
  
  /**
   * Start rotating featured entities
   */
  private startEntityRotation(): void {
    if (this.entities.length === 0) return;
    
    this.changeFeaturedEntity();
    
    // Change entity every 5 seconds
    this.entityChangeInterval = setInterval(() => {
      this.changeFeaturedEntity();
    }, 7500);
  }
  
  /**
   * Change to a random featured entity
   */
  private changeFeaturedEntity(): void {
    if (this.entities.length === 0) return;
    
    const randomIndex = Math.floor(Math.random() * this.entities.length);
    const entity = this.entities[randomIndex];
    this.featuredEntity = entity.Name || entity.DisplayName || 'Unknown Entity';
    this.featuredEntityObject = entity; // Store the full entity object for opening
    
    // Update user state (will be debounced)
    this.updateUserState();
  }
  
  /**
   * Open the featured entity record - demonstrates how to raise Open Entity Record event
   */
  openFeaturedEntity(): void {
    if (!this.featuredEntityObject) return;
    
    // This is how you tell the container to open an entity record
    // The container component will handle the actual navigation/opening
    this.OpenEntityRecord.emit({
      EntityName: 'Entities', // The entity type we're opening
      RecordPKey: CompositeKey.FromID(this.featuredEntityObject.ID),
    });
    
    // Emit interaction event for tracking
    this.Interaction.emit({ 
      type: 'openEntity', 
      entityName: this.featuredEntity,
      entityId: this.featuredEntityObject.ID 
    });
  }
  
  /**
   * Speed up the animation
   */
  speedUp(): void {
    this.speed = Math.min(this.speed + 0.25, 4); // Smaller increments, max 4x
    this.updateUserState();
  }
  
  /**
   * Slow down the animation
   */
  slowDown(): void {
    this.speed = Math.max(this.speed - 0.25, 0.25); // Smaller increments, min 0.25x
    this.updateUserState();
  }
  
  /**
   * Get user-friendly speed description
   */
  protected getSpeedDescription(): string {
    if (this.speed <= 0.5) return 'Very Slow';
    if (this.speed <= 1.0) return 'Slow';
    if (this.speed <= 1.5) return 'Normal';
    if (this.speed <= 2.5) return 'Fast';
    return 'Very Fast';
  }

  /**
   * Converts a hex color to a very light, subtle version for backgrounds.
   * Creates a more eye-friendly color palette by reducing saturation and increasing lightness.
   * 
   * @protected - Accessible in template for color calculations
   * @param {string} color - Hex color string (e.g., "#FF5733")
   * @param {number} opacity - Opacity level (0-1, default 0.1)
   * @returns {string} - RGBA color string for subtle backgrounds
   * 
   * @example
   * ```typescript
   * // Convert bright red to very subtle background
   * this.getLightColor('#FF5733', 0.05) // Returns "rgba(255, 87, 51, 0.05)"
   * ```
   */
  protected getLightColor(color: string, opacity: number = 0.1): string {
    // Remove # if present
    const hex = color.replace('#', '');
    
    // Parse RGB values using modern substring method
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // USER INTERACTION METHODS
  // ═══════════════════════════════════════════════════════════════════════════════════════

  /**
   * Manually triggers an immediate state save for testing purposes.
   * Bypasses debouncing to immediately test the state persistence mechanism.
   * 
   * @public - Called from template for testing
   * @returns {void}
   */
  testStateSave(): void {
    const state = this.currentUserState;
    console.log('🧪 HelloDashboard: Manual test state save triggered:', state);
    console.log('📋 HelloDashboard: Current Config before manual save:', this.Config);
    
    this.UserStateChanged.emit(state);
    this.showStateUpdateNotification = true;
    
    setTimeout(() => {
      this.showStateUpdateNotification = false;
      console.log('🔍 HelloDashboard: Config after manual state save:', this.Config);
    }, 3000);
  }

  /**
   * Changes the color theme of the entire component to a random vibrant color.
   * Updates text color, theme color, and triggers state persistence.
   * 
   * @public - Called from template button click
   * @returns {void}
   * 
   * @example
   * ```typescript
   * // Called when user clicks "Change Color" button
   * // Updates both text and theme colors simultaneously
   * this.changeColor();
   * ```
   */
  changeColor(): void {
    this.setRandomColor();

    // Emit interaction event for tracking and analytics
    this.Interaction.emit({ 
      type: 'colorChange', 
      color: this.textColor,
      themeColor: this.themeColor 
    });

    // Update user state (will be debounced)
    this.updateUserState();
  }

  /**
   * Selects a random color from the predefined palette for both text and theme.
   * Ensures the new color is different from the current one for visual variety.
   * 
   * @private
   * @returns {void}
   * 
   * @example
   * ```typescript
   * // Guarantees color change even with small color palettes
   * // Updates both textColor and themeColor properties
   * this.setRandomColor();
   * ```
   */
  private setRandomColor(): void {
    const currentColor = this.textColor;
    
    let newColor: string;
    do {
      const randomIndex = Math.floor(Math.random() * this.colors.length);
      newColor = this.colors[randomIndex];
    } while (newColor === currentColor && this.colors.length > 1);
    
    // Update both text and theme colors for comprehensive theming
    this.textColor = newColor;
    this.themeColor = newColor;
  }

  /**
   * MemberJunction refresh hook that restores user state and reinitializes the component.
   * Called when the dashboard needs to reload data or when user state is restored.
   * 
   * @public
   * @override
   * @returns {void}
   * 
   * @example
   * ```typescript
   * // Called automatically by MemberJunction framework
   * // Restores: colors, position, speed, featured entity
   * // Starts animation system
   * ```
   */
  public override Refresh(): void {
    super.Refresh();
    
    console.log('🔄 HelloDashboard: Refresh() called - reloading user state');
    
    // Stop any existing animation first
    this.stopAnimation();
    
    // Reload user state (Config may have been updated)
    this.loadUserState();
    
    // Start the animation system (loadUserState sets isLoading = false)
    this.startAnimation();
  }
}

/**
 * Utility function to prevent tree-shaking of the HelloDashboardComponent.
 * Must be called during module initialization to ensure the component remains available.
 * 
 * @export
 * @function LoadHelloDashboard
 * @returns {void}
 * 
 * @example
 * ```typescript
 * // In your module or main.ts file:
 * import { LoadHelloDashboard } from './hello-dashboard.component';
 * LoadHelloDashboard(); // Prevents tree-shaking
 * ```
 */
export function LoadHelloDashboard(): void {
  // Intentionally empty - existence prevents tree-shaking of the component
}