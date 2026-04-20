import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AUDIO_MODEL_REGISTRY, type AudioModelConfig, type AudioModelDefinition } from '../../ai/audio-model-registry';

@Component({
  selector: 'app-model-config',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="model-config-panel">
      <h2>Configure Voice Chat Pipeline</h2>
      <p class="description">Select models for each stage of the voice chat pipeline</p>

      <div class="model-selectors">
        <div class="model-selector">
          <label for="stt-select">
            <span class="label-icon">🎤</span>
            <span class="label-text">Speech Recognition (STT):</span>
          </label>
          <select id="stt-select" [(ngModel)]="SelectedSTT">
            @for (model of AvailableSTTModels; track model.Id) {
              <option [value]="model.Id">
                {{ model.Name }} (~{{ model.ApproxSizeMB }} MB)
                @if (model.RequiresWebGPU) { · WebGPU }
              </option>
            }
          </select>
          <p class="model-description">Converts your speech to text</p>
        </div>

        <div class="arrow">↓</div>

        <div class="model-selector">
          <label for="llm-select">
            <span class="label-icon">🧠</span>
            <span class="label-text">Language Model:</span>
          </label>
          <select id="llm-select" [(ngModel)]="SelectedLLM">
            @for (model of AvailableLLMModels; track model.Id) {
              <option [value]="model.Id">
                {{ model.Name }} (~{{ model.ApproxSizeMB }} MB)
                @if (model.RequiresWebGPU) { · WebGPU }
              </option>
            }
          </select>
          <p class="model-description">Generates intelligent responses</p>
        </div>

        <div class="arrow">↓</div>

        <div class="model-selector">
          <label for="tts-select">
            <span class="label-icon">🔊</span>
            <span class="label-text">Text-to-Speech (TTS):</span>
          </label>
          <select id="tts-select" [(ngModel)]="SelectedTTS">
            @for (model of AvailableTTSModels; track model.Id) {
              <option [value]="model.Id">
                {{ model.Name }} (~{{ model.ApproxSizeMB }} MB)
              </option>
            }
          </select>
          <p class="model-description">Converts text back to speech</p>
        </div>
      </div>

      <div class="total-section">
        <div class="total-size">
          <strong>Total Download Size:</strong> ~{{ TotalSizeMB }} MB
        </div>
        <p class="download-note">
          @if (TotalSizeMB < 500) {
            ⚡ Fast download - should load in under a minute
          } @else if (TotalSizeMB < 1500) {
            ⏱️ Medium download - may take 1-2 minutes
          } @else {
            🐌 Large download - may take 2-5 minutes on slow connections
          }
        </p>
      </div>

      <button (click)="OnStartClick()" class="start-btn">
        🚀 Start Voice Chat
      </button>

      <div class="info-section">
        <p>💡 <strong>Privacy First:</strong> All models run locally in your browser. No data is sent to servers.</p>
        <p>💾 <strong>One-Time Download:</strong> Models are cached after first load for instant future use.</p>
      </div>
    </div>
  `,
  styles: [`
    .model-config-panel {
      max-width: 700px;
      margin: 40px auto;
      padding: 32px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.1);
    }

    h2 {
      margin: 0 0 8px 0;
      color: #333;
      font-size: 28px;
      text-align: center;
    }

    .description {
      text-align: center;
      color: #666;
      margin: 0 0 32px 0;
    }

    .model-selectors {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 32px;
    }

    .model-selector {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      color: #333;
      font-size: 16px;
    }

    .label-icon {
      font-size: 20px;
    }

    select {
      padding: 12px 16px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 14px;
      background: white;
      cursor: pointer;
      transition: border-color 0.2s;
    }

    select:hover {
      border-color: #667eea;
    }

    select:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .model-description {
      margin: 0;
      font-size: 13px;
      color: #888;
      padding-left: 28px;
    }

    .arrow {
      text-align: center;
      font-size: 24px;
      color: #667eea;
      margin: 8px 0;
    }

    .total-section {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 24px;
      text-align: center;
    }

    .total-size {
      font-size: 18px;
      color: #333;
      margin-bottom: 8px;
    }

    .download-note {
      margin: 0;
      font-size: 14px;
      color: #666;
    }

    .start-btn {
      width: 100%;
      padding: 16px 32px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 18px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    }

    .start-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
    }

    .start-btn:active {
      transform: translateY(0);
    }

    .info-section {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid #e0e0e0;
    }

    .info-section p {
      margin: 8px 0;
      font-size: 13px;
      color: #666;
      line-height: 1.6;
    }

    @media (max-width: 768px) {
      .model-config-panel {
        margin: 20px;
        padding: 24px;
      }

      h2 {
        font-size: 24px;
      }
    }
  `]
})
export class ModelConfigComponent {
  @Output() StartChat = new EventEmitter<AudioModelConfig>();

  SelectedSTT = AUDIO_MODEL_REGISTRY.STT[0].Id;
  SelectedLLM = AUDIO_MODEL_REGISTRY.LLM[0].Id;
  SelectedTTS = AUDIO_MODEL_REGISTRY.TTS[0].Id;

  AvailableSTTModels = AUDIO_MODEL_REGISTRY.STT;
  AvailableLLMModels = AUDIO_MODEL_REGISTRY.LLM;
  AvailableTTSModels = AUDIO_MODEL_REGISTRY.TTS;

  get TotalSizeMB(): number {
    const stt = this.AvailableSTTModels.find(m => m.Id === this.SelectedSTT);
    const llm = this.AvailableLLMModels.find(m => m.Id === this.SelectedLLM);
    const tts = this.AvailableTTSModels.find(m => m.Id === this.SelectedTTS);
    return (stt?.ApproxSizeMB ?? 0) + (llm?.ApproxSizeMB ?? 0) + (tts?.ApproxSizeMB ?? 0);
  }

  OnStartClick(): void {
    const config: AudioModelConfig = {
      STT: this.AvailableSTTModels.find(m => m.Id === this.SelectedSTT)!,
      LLM: this.AvailableLLMModels.find(m => m.Id === this.SelectedLLM)!,
      TTS: this.AvailableTTSModels.find(m => m.Id === this.SelectedTTS)!,
    };
    this.StartChat.emit(config);
  }
}
