import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { ButtonModule } from '@progress/kendo-angular-buttons';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { LayoutModule } from '@progress/kendo-angular-layout';

/**
 * Interface representing a component in the dependency hierarchy
 */
export interface ComponentNode {
  name: string;
  title: string;
  description?: string;
  location: 'embedded' | 'registry';
  dependencies?: ComponentNode[];
  namespace?: string;
  registry?: string;
}

/**
 * Interface for feedback submission
 */
export interface ComponentFeedback {
  componentName: string;
  componentNamespace: string;
  componentVersion?: string;
  rating: number;  // 0-100 scale
  comments?: string;
  conversationID?: string;
  conversationDetailID?: string;
  reportID?: string;
  dashboardID?: string;
}

/**
 * Component feedback panel that displays component hierarchy tree
 * and allows users to select components and provide star ratings with comments
 */
@Component({
  selector: 'skip-component-feedback-panel',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    InputsModule,
    DropDownsModule,
    LayoutModule
],
  templateUrl: './skip-component-feedback-panel.component.html',
  styleUrls: ['./skip-component-feedback-panel.component.css']
})
export class SkipComponentFeedbackPanelComponent implements OnInit, OnChanges {
  @Input() rootComponent: ComponentNode | null = null;
  @Input() conversationID?: string;
  @Input() conversationDetailID?: string;
  @Input() reportID?: string;
  @Input() dashboardID?: string;
  @Input() isVisible = false;

  @Output() feedbackSubmitted = new EventEmitter<ComponentFeedback>();
  @Output() componentSelected = new EventEmitter<ComponentNode>();
  @Output() closed = new EventEmitter<void>();

  selectedComponent: ComponentNode | null = null;
  starRating = 0;
  hoverRating = 0;
  feedbackComment = '';
  expandedNodes = new Set<string>();
  isSubmitting = false;
  submitSuccess = false;
  submitError = '';

  ngOnInit(): void {
    // Expand root node by default
    if (this.rootComponent) {
      this.expandedNodes.add(this.rootComponent.name);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rootComponent'] && this.rootComponent) {
      // Reset expanded nodes when component changes
      this.expandedNodes.clear();
      this.expandedNodes.add(this.rootComponent.name);
      this.selectedComponent = null;
      this.resetFeedbackForm();
    }
  }

  /**
   * Toggle node expansion in the tree
   */
  toggleNode(node: ComponentNode): void {
    const key = node.name;
    if (this.expandedNodes.has(key)) {
      this.expandedNodes.delete(key);
    } else {
      this.expandedNodes.add(key);
    }
  }

  /**
   * Check if a node is expanded
   */
  isNodeExpanded(node: ComponentNode): boolean {
    return this.expandedNodes.has(node.name);
  }

  /**
   * Select a component for feedback
   */
  selectComponent(node: ComponentNode, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }

    this.selectedComponent = node;
    this.resetFeedbackForm();
    this.componentSelected.emit(node);
  }

  /**
   * Check if a component is selected
   */
  isComponentSelected(node: ComponentNode): boolean {
    return this.selectedComponent?.name === node.name;
  }

  /**
   * Set star rating on click
   */
  setRating(rating: number): void {
    this.starRating = rating;
  }

  /**
   * Set hover rating for visual feedback
   */
  setHoverRating(rating: number): void {
    this.hoverRating = rating;
  }

  /**
   * Clear hover rating
   */
  clearHoverRating(): void {
    this.hoverRating = 0;
  }

  /**
   * Get the current displayed rating (hover or actual)
   */
  getDisplayRating(): number {
    return this.hoverRating || this.starRating;
  }

  /**
   * Check if a star should be filled
   */
  isStarFilled(index: number): boolean {
    return index <= this.getDisplayRating();
  }

  /**
   * Reset the feedback form
   */
  resetFeedbackForm(): void {
    this.starRating = 0;
    this.hoverRating = 0;
    this.feedbackComment = '';
    this.submitSuccess = false;
    this.submitError = '';
  }

  /**
   * Check if the form is valid for submission
   */
  canSubmit(): boolean {
    return !!this.selectedComponent && this.starRating > 0 && !this.isSubmitting;
  }

  /**
   * Submit the feedback
   */
  async submitFeedback(): Promise<void> {
    if (!this.canSubmit() || !this.selectedComponent) {
      return;
    }

    this.isSubmitting = true;
    this.submitError = '';
    this.submitSuccess = false;

    try {
      // Convert 0-5 star rating to 0-100 scale
      const scaledRating = this.starRating * 20;

      const feedback: ComponentFeedback = {
        componentName: this.selectedComponent.name,
        componentNamespace: this.selectedComponent.namespace || this.selectedComponent.registry || 'Skip',
        componentVersion: undefined, // Will use latest version if not specified
        rating: scaledRating,
        comments: this.feedbackComment.trim() || undefined,
        conversationID: this.conversationID,
        conversationDetailID: this.conversationDetailID,
        reportID: this.reportID,
        dashboardID: this.dashboardID
      };

      this.feedbackSubmitted.emit(feedback);

      // Show success message
      this.submitSuccess = true;

      // Reset form after a short delay
      setTimeout(() => {
        this.resetFeedbackForm();
        this.submitSuccess = false;
      }, 2000);

    } catch (error) {
      this.submitError = 'Failed to submit feedback. Please try again.';
      console.error('Error submitting feedback:', error);
    } finally {
      this.isSubmitting = false;
    }
  }

  /**
   * Close the panel
   */
  closePanel(): void {
    this.closed.emit();
  }

  /**
   * Get indentation level for a node (for visual hierarchy)
   */
  getNodeIndentation(depth: number): string {
    return `${depth * 20}px`;
  }

  /**
   * Recursively build the component tree HTML
   */
  buildComponentTree(node: ComponentNode, depth = 0): any[] {
    const items: any[] = [{
      node,
      depth,
      hasChildren: !!(node.dependencies && node.dependencies.length > 0)
    }];

    if (this.isNodeExpanded(node) && node.dependencies) {
      for (const child of node.dependencies) {
        items.push(...this.buildComponentTree(child, depth + 1));
      }
    }

    return items;
  }

  /**
   * Get all tree items for rendering
   */
  getTreeItems(): any[] {
    if (!this.rootComponent) {
      return [];
    }
    return this.buildComponentTree(this.rootComponent);
  }
}
