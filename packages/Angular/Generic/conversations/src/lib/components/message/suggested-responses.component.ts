import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, ChangeDetectorRef, OnInit, AfterViewInit } from '@angular/core';
import { SuggestedResponse } from '../../models/conversation-state.model';

/**
 * Component for displaying suggested response options below AI messages
 * Provides quick reply buttons and optional text input for streamlined conversation flow
 */
@Component({
  standalone: false,
  selector: 'mj-suggested-responses',
  templateUrl: './suggested-responses.component.html',
  styleUrls: ['./suggested-responses.component.css']
})
export class SuggestedResponsesComponent implements OnInit, AfterViewInit {
  @Input() suggestedResponses: SuggestedResponse[] = [];
  @Input() disabled: boolean = false;
  @Input() isLastMessage: boolean = false;
  @Input() isConversationOwner: boolean = false;

  @Output() responseSelected = new EventEmitter<{text: string; customInput?: string}>();

  @ViewChild('inputField') inputField?: ElementRef<HTMLInputElement>;

  public customInputValue: string = '';

  constructor(private cdr: ChangeDetectorRef) {
    console.log('🏗️ SuggestedResponsesComponent constructed');
  }

  ngOnInit() {
    console.log('🎬 SuggestedResponsesComponent.ngOnInit', {
      suggestedResponses: this.suggestedResponses,
      disabled: this.disabled,
      isLastMessage: this.isLastMessage,
      isConversationOwner: this.isConversationOwner,
      isVisible: this.isVisible,
      regularResponses: this.regularResponses,
      regularResponsesLength: this.regularResponses.length
    });
  }

  ngAfterViewInit() {
    console.log('👁️ SuggestedResponsesComponent.ngAfterViewInit - component rendered');
  }

  /**
   * Get all regular button responses (not input fields)
   */
  public get regularResponses(): SuggestedResponse[] {
    return this.suggestedResponses.filter(r => !r.allowInput);
  }

  /**
   * Get the input response option (if any)
   * Only supports one input option per message
   */
  public get inputResponse(): SuggestedResponse | null {
    return this.suggestedResponses.find(r => r.allowInput) || null;
  }

  /**
   * Check if component should be visible
   */
  public get isVisible(): boolean {
    return this.isLastMessage && this.isConversationOwner && this.suggestedResponses.length > 0;
  }

  /**
   * Handle regular button click
   */
  public onResponseClick(response: SuggestedResponse): void {
    console.log('🖱️ BUTTON CLICKED!', {
      response,
      disabled: this.disabled,
      willEmit: !this.disabled
    });

    if (!this.disabled) {
      console.log('📤 Emitting responseSelected event');
      this.responseSelected.emit({ text: response.text });
      console.log('✅ Event emitted');
    } else {
      console.warn('⚠️ Button is disabled, not emitting');
    }
  }

  /**
   * Handle input submission (Enter key or submit button click)
   */
  public onInputSubmit(): void {
    const trimmedValue = this.customInputValue?.trim();
    if (!this.disabled && trimmedValue && this.inputResponse) {
      this.responseSelected.emit({
        text: this.inputResponse.text,
        customInput: trimmedValue
      });
      this.customInputValue = '';

      // Clear input field and trigger change detection
      Promise.resolve().then(() => {
        if (this.inputField) {
          this.inputField.nativeElement.value = '';
        }
        this.cdr.detectChanges();
      });
    }
  }

  /**
   * Handle Enter key in input field
   */
  public onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onInputSubmit();
    }
  }

  /**
   * Track by function for ngFor to help Angular track items
   */
  public trackByIndex(index: number): number {
    return index;
  }
}
