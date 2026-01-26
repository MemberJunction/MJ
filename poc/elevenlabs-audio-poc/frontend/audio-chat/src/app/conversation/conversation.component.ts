import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, takeUntil } from 'rxjs';
import {
  ElevenLabsService,
  ConversationMessage,
  ConversationStatus
} from '../services/elevenlabs.service';

@Component({
  selector: 'app-conversation',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './conversation.component.html',
  styleUrls: ['./conversation.component.scss']
})
export class ConversationComponent implements OnDestroy {
  // Agent configuration
  private readonly AGENT_ID = 'agent_8501kfsjva8xezmr0zj4sjm57a3x';

  // UI state
  messages: ConversationMessage[] = [];
  status: ConversationStatus = {
    isConnected: false,
    isAgentSpeaking: false,
    statusText: 'Click Start to begin conversation'
  };

  // Audio monitoring
  inputVolume: number = 0;
  outputVolume: number = 0;

  private destroy$ = new Subject<void>();
  private volumeCheckInterval: any;

  constructor(private elevenLabsService: ElevenLabsService) {
    // Subscribe to messages
    this.elevenLabsService.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
        this.messages.push(message);
      });

    // Subscribe to status updates
    this.elevenLabsService.status$
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        this.status = status;
      });
  }

  async startConversation(): Promise<void> {
    try {
      await this.elevenLabsService.startConversation(this.AGENT_ID);

      // Start monitoring audio levels
      this.startVolumeMonitoring();
    } catch (error) {
      console.error('Failed to start conversation:', error);
    }
  }

  endConversation(): void {
    this.stopVolumeMonitoring();
    this.elevenLabsService.endConversation();
  }

  private startVolumeMonitoring(): void {
    this.volumeCheckInterval = setInterval(() => {
      this.inputVolume = this.elevenLabsService.getInputVolume();
      this.outputVolume = this.elevenLabsService.getOutputVolume();

      if (this.outputVolume > 0) {
        console.log('[Audio] Output volume detected:', this.outputVolume);
      }
    }, 100);
  }

  private stopVolumeMonitoring(): void {
    if (this.volumeCheckInterval) {
      clearInterval(this.volumeCheckInterval);
      this.volumeCheckInterval = null;
    }
    this.inputVolume = 0;
    this.outputVolume = 0;
  }

  ngOnDestroy(): void {
    this.stopVolumeMonitoring();
    this.elevenLabsService.endConversation();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
