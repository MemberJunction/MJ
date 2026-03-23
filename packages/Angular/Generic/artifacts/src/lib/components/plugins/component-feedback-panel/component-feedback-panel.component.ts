import { Component, Input, Output, EventEmitter, OnDestroy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Metadata } from '@memberjunction/core';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Flattened tree item for rendering the component hierarchy
 */
interface TreeItem {
  spec: ComponentSpec;
  depth: number;
  hasChildren: boolean;
}

/**
 * Component feedback panel that displays component hierarchy tree
 * and allows users to select components and provide star ratings with comments.
 * Registry-agnostic: works with any component registry (Skip, MJ Central, etc.)
 */
@Component({
  selector: 'mj-component-feedback-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './component-feedback-panel.component.html',
  styleUrls: ['./component-feedback-panel.component.css']
})
export class ComponentFeedbackPanelComponent implements OnDestroy {
  @Input() ComponentSpec: ComponentSpec | null = null;
  @Input() ReactContainerElement: HTMLElement | null = null;
  @Input() ConversationId: string | null = null;
  @Input() ConversationDetailId: string | null = null;

  @Output() Closed = new EventEmitter<void>();

  // Feedback form state
  public SelectedSpec: ComponentSpec | null = null;
  public StarRating = 0;
  public HoverRating = 0;
  public FeedbackComments = '';
  public IsSubmitting = false;
  public SubmitSuccess = false;
  public SubmitError = '';

  // Tree state
  public ExpandedNodes = new Set<string>();

  // Highlight overlays
  private highlightOverlay: HTMLElement | null = null;
  private hoverOverlay: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private containerClickHandler: ((e: MouseEvent) => void) | null = null;

  private cdr = inject(ChangeDetectorRef);

  // --- Tree Methods ---

  GetTreeItems(): TreeItem[] {
    if (!this.ComponentSpec) return [];
    if (!this.ExpandedNodes.has(this.ComponentSpec.name)) {
      this.ExpandedNodes.add(this.ComponentSpec.name);
    }
    return this.buildTree(this.ComponentSpec, 0);
  }

  private buildTree(spec: ComponentSpec, depth: number): TreeItem[] {
    const items: TreeItem[] = [{
      spec,
      depth,
      hasChildren: !!(spec.dependencies && spec.dependencies.length > 0)
    }];
    if (this.ExpandedNodes.has(spec.name) && spec.dependencies) {
      for (const child of spec.dependencies) {
        items.push(...this.buildTree(child, depth + 1));
      }
    }
    return items;
  }

  ToggleNode(spec: ComponentSpec, event: MouseEvent): void {
    event.stopPropagation();
    if (this.ExpandedNodes.has(spec.name)) {
      this.ExpandedNodes.delete(spec.name);
    } else {
      this.ExpandedNodes.add(spec.name);
    }
  }

  IsNodeExpanded(spec: ComponentSpec): boolean {
    return this.ExpandedNodes.has(spec.name);
  }

  SelectComponent(spec: ComponentSpec): void {
    this.SelectedSpec = spec;
    this.ResetForm();
    this.HighlightComponent(spec.name);
  }

  IsSelected(spec: ComponentSpec): boolean {
    return this.SelectedSpec?.name === spec.name;
  }

  GetIndentation(depth: number): string {
    return `${depth * 20}px`;
  }

  // --- Star Rating ---

  SetRating(stars: number): void {
    this.StarRating = stars;
  }

  SetHoverRating(stars: number): void {
    this.HoverRating = stars;
  }

  ClearHoverRating(): void {
    this.HoverRating = 0;
  }

  GetDisplayRating(): number {
    return this.HoverRating || this.StarRating;
  }

  IsStarFilled(index: number): boolean {
    return index <= this.GetDisplayRating();
  }

  // --- Form ---

  ResetForm(): void {
    this.StarRating = 0;
    this.HoverRating = 0;
    this.FeedbackComments = '';
    this.SubmitSuccess = false;
    this.SubmitError = '';
  }

  CanSubmit(): boolean {
    return !!this.SelectedSpec && this.StarRating > 0 && !this.IsSubmitting;
  }

  async SubmitFeedback(): Promise<void> {
    if (!this.CanSubmit() || !this.SelectedSpec) return;

    this.IsSubmitting = true;
    this.SubmitError = '';
    this.SubmitSuccess = false;
    this.cdr.detectChanges();

    try {
      // Dynamic import to avoid adding graphql-dataprovider as a package dependency.
      // At runtime in the browser, Metadata.Provider is always a GraphQLDataProvider.
      const { GraphQLComponentRegistryClient } = await import('@memberjunction/graphql-dataprovider');
      const provider = Metadata.Provider;
      const client = new GraphQLComponentRegistryClient(provider as ConstructorParameters<typeof GraphQLComponentRegistryClient>[0]);

      const response = await client.SendComponentFeedback({
        componentName: this.SelectedSpec.name,
        componentNamespace: this.SelectedSpec.namespace || this.SelectedSpec.registry || '',
        componentVersion: this.SelectedSpec.version,
        registryName: this.SelectedSpec.registry,
        rating: this.StarRating * 20, // 0-5 -> 0-100
        comments: this.FeedbackComments.trim() || undefined,
        conversationID: this.ConversationId || undefined,
        conversationDetailID: this.ConversationDetailId || undefined
      });

      if (response.success) {
        this.SubmitSuccess = true;
        setTimeout(() => {
          this.ResetForm();
          this.cdr.detectChanges();
        }, 2000);
      } else {
        this.SubmitError = response.error || 'Failed to submit feedback.';
      }
    } catch (error) {
      this.SubmitError = 'Failed to submit feedback. Please try again.';
      console.error('Error submitting component feedback:', error);
    } finally {
      this.IsSubmitting = false;
      this.cdr.detectChanges();
    }
  }

  // --- Hover Highlight (light preview on tree hover) ---

  HoverTreeItem(spec: ComponentSpec): void {
    if (!this.ReactContainerElement || this.IsSelected(spec)) return;
    this.showHoverOverlay(spec.name);
  }

  ClearTreeItemHover(): void {
    this.removeHoverOverlay();
  }

  private showHoverOverlay(componentName: string): void {
    if (!this.ReactContainerElement) return;

    const targetEl = this.ReactContainerElement.querySelector(
      `[data-mj-component="${componentName}"]`
    );
    if (!targetEl) {
      this.removeHoverOverlay();
      return;
    }

    this.ensureContainerPositioned();

    if (!this.hoverOverlay) {
      this.hoverOverlay = document.createElement('div');
      this.ReactContainerElement.appendChild(this.hoverOverlay);
    }

    this.positionOverlay(this.hoverOverlay, targetEl);
    this.hoverOverlay.style.border = '2px dashed var(--mj-brand-primary, #3B82F6)';
    this.hoverOverlay.style.background = 'color-mix(in srgb, var(--mj-brand-primary, #3B82F6) 5%, transparent)';
  }

  private removeHoverOverlay(): void {
    if (this.hoverOverlay?.parentNode) {
      this.hoverOverlay.parentNode.removeChild(this.hoverOverlay);
    }
    this.hoverOverlay = null;
  }

  // --- Region Highlighting (solid selection) ---

  private HighlightComponent(componentName: string): void {
    if (!this.ReactContainerElement) {
      this.ClearHighlight();
      return;
    }

    const targetEl = this.ReactContainerElement.querySelector(
      `[data-mj-component="${componentName}"]`
    );
    if (!targetEl) {
      this.ClearHighlight();
      return;
    }

    this.ensureContainerPositioned();

    if (!this.highlightOverlay) {
      this.highlightOverlay = document.createElement('div');
      this.ReactContainerElement.appendChild(this.highlightOverlay);
    }

    this.positionOverlay(this.highlightOverlay, targetEl);
    this.highlightOverlay.style.border = '2px solid var(--mj-brand-primary, #3B82F6)';
    this.highlightOverlay.style.background = 'color-mix(in srgb, var(--mj-brand-primary, #3B82F6) 10%, transparent)';

    // Watch for resize/layout changes
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      if (this.highlightOverlay) {
        this.positionOverlay(this.highlightOverlay, targetEl);
      }
    });
    this.resizeObserver.observe(targetEl);
    this.resizeObserver.observe(this.ReactContainerElement);

    // Set up bidirectional click selection on container
    this.installContainerClickListener();
  }

  private ensureContainerPositioned(): void {
    if (!this.ReactContainerElement) return;
    const containerStyle = getComputedStyle(this.ReactContainerElement);
    if (containerStyle.position === 'static') {
      this.ReactContainerElement.style.position = 'relative';
    }
  }

  /**
   * Gets the effective bounding rect for a component marker element.
   * display:contents elements return zero-size rects, so we compute
   * the union bounding box of their children instead.
   */
  private getEffectiveRect(el: Element): DOMRect {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return rect;

    // display:contents wrapper — union the bounding rects of all children
    const children = el.children;
    if (children.length === 0) return rect;

    let top = Infinity, left = Infinity, bottom = -Infinity, right = -Infinity;
    for (let i = 0; i < children.length; i++) {
      const childRect = children[i].getBoundingClientRect();
      if (childRect.width === 0 && childRect.height === 0) continue;
      top = Math.min(top, childRect.top);
      left = Math.min(left, childRect.left);
      bottom = Math.max(bottom, childRect.bottom);
      right = Math.max(right, childRect.right);
    }

    if (top === Infinity) return rect; // no visible children
    return new DOMRect(left, top, right - left, bottom - top);
  }

  private positionOverlay(overlay: HTMLElement, targetEl: Element): void {
    if (!this.ReactContainerElement) return;

    const targetRect = this.getEffectiveRect(targetEl);
    const containerRect = this.ReactContainerElement.getBoundingClientRect();

    overlay.style.position = 'absolute';
    overlay.style.top = `${targetRect.top - containerRect.top + this.ReactContainerElement.scrollTop}px`;
    overlay.style.left = `${targetRect.left - containerRect.left + this.ReactContainerElement.scrollLeft}px`;
    overlay.style.width = `${targetRect.width}px`;
    overlay.style.height = `${targetRect.height}px`;
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '10';
    overlay.style.borderRadius = '4px';
    overlay.style.transition = 'all 0.2s ease';
  }

  // --- Bidirectional click: clicking a component region selects it in the tree ---

  private installContainerClickListener(): void {
    if (this.containerClickHandler || !this.ReactContainerElement) return;

    this.containerClickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Walk up from click target to find nearest [data-mj-component]
      const componentEl = target.closest('[data-mj-component]');
      if (!componentEl) return;

      const componentName = componentEl.getAttribute('data-mj-component');
      if (!componentName) return;

      // Find matching spec in the tree
      const matchingSpec = this.findSpecByName(componentName);
      if (matchingSpec && matchingSpec.name !== this.SelectedSpec?.name) {
        this.SelectComponent(matchingSpec);
        this.cdr.detectChanges();
      }
    };

    // Use capture phase so we observe the click without interfering with component handlers
    this.ReactContainerElement.addEventListener('click', this.containerClickHandler, true);
  }

  private removeContainerClickListener(): void {
    if (this.containerClickHandler && this.ReactContainerElement) {
      this.ReactContainerElement.removeEventListener('click', this.containerClickHandler, true);
    }
    this.containerClickHandler = null;
  }

  private findSpecByName(name: string): ComponentSpec | null {
    if (!this.ComponentSpec) return null;
    return this.walkSpecTree(this.ComponentSpec, name);
  }

  private walkSpecTree(spec: ComponentSpec, name: string): ComponentSpec | null {
    if (spec.name === name) return spec;
    if (spec.dependencies) {
      for (const child of spec.dependencies) {
        const found = this.walkSpecTree(child, name);
        if (found) return found;
      }
    }
    return null;
  }

  private ClearHighlight(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.highlightOverlay?.parentNode) {
      this.highlightOverlay.parentNode.removeChild(this.highlightOverlay);
    }
    this.highlightOverlay = null;
    this.removeHoverOverlay();
    this.removeContainerClickListener();
  }

  ClosePanel(): void {
    this.ClearHighlight();
    this.Closed.emit();
  }

  ngOnDestroy(): void {
    this.ClearHighlight();
  }
}
