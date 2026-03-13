import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RunView } from '@memberjunction/core';
import { MJAIModelEntity } from '@memberjunction/core-entities';
import { ComponentStudioStateService, ComponentError } from '../../services/component-studio-state.service';

/**
 * Represents a single message in the AI assistant chat thread
 */
export interface ChatMessage {
  Role: 'user' | 'assistant' | 'system';
  Content: string;
  Timestamp: Date;
}

/**
 * Represents a quick action button in the AI assistant panel
 */
interface QuickAction {
  Label: string;
  Icon: string;
  Prompt: string;
  RequiresError: boolean;
}

/**
 * Represents an AI model option in the model selector dropdown
 */
interface AIModelOption {
  ID: string;
  Name: string;
  Vendor: string | null;
  DisplayLabel: string;
}

@Component({
  standalone: false,
  selector: 'mj-ai-assistant-panel',
  templateUrl: './ai-assistant-panel.component.html',
  styleUrls: ['./ai-assistant-panel.component.css']
})
export class AIAssistantPanelComponent implements OnInit, OnDestroy {

  @ViewChild('chatThread') chatThreadEl!: ElementRef<HTMLDivElement>;
  @ViewChild('chatInput') chatInputEl!: ElementRef<HTMLTextAreaElement>;

  // --- Chat State ---
  Messages: ChatMessage[] = [];
  InputText = '';
  IsWaitingForResponse = false;

  // --- Model Selector ---
  AvailableModels: AIModelOption[] = [];
  SelectedModelID: string | null = null;
  IsLoadingModels = false;

  // --- Quick Actions ---
  QuickActions: QuickAction[] = [
    { Label: 'Fix Errors', Icon: 'fa-bug', Prompt: 'Fix this error: ', RequiresError: true },
    { Label: 'Improve Code', Icon: 'fa-magic', Prompt: 'Review and improve the current component code. Suggest optimizations, better patterns, and cleaner structure.', RequiresError: false },
    { Label: 'Generate Code', Icon: 'fa-code', Prompt: 'Generate code for the current component based on its specification.', RequiresError: false },
    { Label: 'Explain', Icon: 'fa-question-circle', Prompt: 'Explain what the current component does, including its structure, data flow, and key behaviors.', RequiresError: false }
  ];

  private destroy$ = new Subject<void>();

  constructor(
    public State: ComponentStudioStateService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    this.subscribeToErrorEvents();
    await this.LoadModels();
    this.addWelcomeMessage();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============================================================
  // MODEL LOADING
  // ============================================================

  async LoadModels(): Promise<void> {
    this.IsLoadingModels = true;
    try {
      const rv = new RunView();
      const result = await rv.RunView<MJAIModelEntity>({
        EntityName: 'MJ: AI Models',
        ExtraFilter: `IsActive = 1 AND AIModelTypeID IN (SELECT ID FROM __mj.vwAIModelTypes WHERE Name = 'LLM')`,
        OrderBy: 'PowerRank DESC, Name ASC',
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results) {
        this.AvailableModels = result.Results.map(model => ({
          ID: model.ID,
          Name: model.Name,
          Vendor: model.Vendor,
          DisplayLabel: model.Vendor ? `${model.Name} (${model.Vendor})` : model.Name
        }));

        if (this.AvailableModels.length > 0) {
          this.SelectedModelID = this.AvailableModels[0].ID;
        }
      }
    } catch (error) {
      console.error('Error loading AI models:', error);
    } finally {
      this.IsLoadingModels = false;
      this.cdr.detectChanges();
    }
  }

  // ============================================================
  // ERROR SUBSCRIPTION
  // ============================================================

  private subscribeToErrorEvents(): void {
    this.State.SendErrorToAI
      .pipe(takeUntil(this.destroy$))
      .subscribe((error: ComponentError) => {
        this.handleIncomingError(error);
      });
  }

  private handleIncomingError(error: ComponentError): void {
    const errorDetails = error.technicalDetails
      ? (typeof error.technicalDetails === 'string' ? error.technicalDetails : JSON.stringify(error.technicalDetails, null, 2))
      : '';

    const systemContent = `Error detected [${error.type}]: ${error.message}${errorDetails ? '\n\nDetails:\n' + errorDetails : ''}`;

    this.addMessage('system', systemContent);
    this.InputText = `Fix this error: ${error.type} - ${error.message}`;
    this.cdr.detectChanges();
    this.focusInput();
  }

  // ============================================================
  // WELCOME MESSAGE
  // ============================================================

  private addWelcomeMessage(): void {
    this.addMessage(
      'assistant',
      'Welcome to the Component Studio AI Assistant. I can help you fix errors, improve code, generate components, and explain how things work. Select a component and ask me anything!'
    );
  }

  // ============================================================
  // CHAT ACTIONS
  // ============================================================

  OnSendMessage(): void {
    const text = this.InputText.trim();
    if (!text || this.IsWaitingForResponse) return;

    this.addMessage('user', text);
    this.InputText = '';
    this.resetInputHeight();
    this.simulateResponse(text);
  }

  OnQuickAction(action: QuickAction): void {
    if (action.RequiresError && !this.State.CurrentError) return;

    if (action.RequiresError && this.State.CurrentError) {
      const errorContext = `${this.State.CurrentError.type} - ${this.State.CurrentError.message}`;
      this.InputText = `${action.Prompt}${errorContext}`;
    } else {
      this.InputText = action.Prompt;
    }

    this.cdr.detectChanges();
    this.focusInput();
  }

  OnInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.OnSendMessage();
    }
  }

  OnInputChange(): void {
    this.autoGrowTextarea();
  }

  OnCollapsePanel(): void {
    this.State.IsAIPanelCollapsed = true;
    this.State.StateChanged.emit();
  }

  IsQuickActionEnabled(action: QuickAction): boolean {
    if (action.RequiresError) {
      return this.State.CurrentError != null;
    }
    return true;
  }

  // ============================================================
  // MESSAGE MANAGEMENT
  // ============================================================

  private addMessage(role: 'user' | 'assistant' | 'system', content: string): void {
    this.Messages.push({
      Role: role,
      Content: content,
      Timestamp: new Date()
    });
    this.cdr.detectChanges();
    this.scrollToBottom();
  }

  private simulateResponse(userMessage: string): void {
    this.IsWaitingForResponse = true;
    this.cdr.detectChanges();
    this.scrollToBottom();

    setTimeout(() => {
      this.addMessage(
        'assistant',
        'AI assistant coming soon \u2014 agent integration in progress. Your message has been received and will be processed once the AI backend is connected.'
      );
      this.IsWaitingForResponse = false;
      this.cdr.detectChanges();
    }, 1000);
  }

  // ============================================================
  // UI HELPERS
  // ============================================================

  private scrollToBottom(): void {
    Promise.resolve().then(() => {
      if (this.chatThreadEl) {
        const el = this.chatThreadEl.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    });
  }

  private focusInput(): void {
    Promise.resolve().then(() => {
      if (this.chatInputEl) {
        this.chatInputEl.nativeElement.focus();
      }
    });
  }

  private autoGrowTextarea(): void {
    if (!this.chatInputEl) return;
    const textarea = this.chatInputEl.nativeElement;
    textarea.style.height = 'auto';
    const lineHeight = 20;
    const maxLines = 4;
    const maxHeight = lineHeight * maxLines;
    textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
  }

  private resetInputHeight(): void {
    if (!this.chatInputEl) return;
    this.chatInputEl.nativeElement.style.height = 'auto';
  }

  FormatTimestamp(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  TrackByTimestamp(index: number, message: ChatMessage): number {
    return message.Timestamp.getTime();
  }
}
