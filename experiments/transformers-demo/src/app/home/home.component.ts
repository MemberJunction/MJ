import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="home-container">
      <header class="home-header">
        <h1>Transformers.js AI Demo</h1>
        <p class="subtitle">Run AI models entirely in your browser — no server, no API costs, complete privacy</p>
      </header>

      <div class="mode-cards">
        <a routerLink="/text-chat" class="mode-card">
          <div class="icon">💬</div>
          <h2>Text Chat</h2>
          <p>Interactive text conversation with language models</p>
          <ul class="features">
            <li>SmolLM2 & Phi models</li>
            <li>Token streaming</li>
            <li>WebGPU acceleration</li>
          </ul>
        </a>

        <a routerLink="/audio-chat" class="mode-card">
          <div class="icon">🎤</div>
          <h2>Audio Chat</h2>
          <p>Full voice-to-voice AI assistant pipeline</p>
          <ul class="features">
            <li>Speech-to-Text (Whisper)</li>
            <li>Language Model</li>
            <li>Text-to-Speech (SpeechT5)</li>
          </ul>
        </a>
      </div>

      <footer class="home-footer">
        <p>
          <strong>All processing happens on your device.</strong>
          Models are downloaded once and cached locally.
        </p>
        <p class="tech-stack">
          Built with <a href="https://huggingface.co/docs/transformers.js" target="_blank">Transformers.js</a>
          + <a href="https://angular.dev" target="_blank">Angular 18</a>
        </p>
      </footer>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      font-family: system-ui, -apple-system, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .home-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 20px;
      width: 100%;
    }

    .home-header {
      text-align: center;
      margin-bottom: 60px;
    }

    .home-header h1 {
      font-size: 48px;
      font-weight: 700;
      margin: 0 0 16px 0;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
    }

    .subtitle {
      font-size: 18px;
      opacity: 0.95;
      margin: 0;
      max-width: 600px;
      margin: 0 auto;
    }

    .mode-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 30px;
      margin-bottom: 60px;
    }

    .mode-card {
      background: white;
      color: #333;
      border-radius: 16px;
      padding: 32px;
      text-decoration: none;
      transition: transform 0.2s, box-shadow 0.2s;
      box-shadow: 0 8px 16px rgba(0,0,0,0.15);
      display: flex;
      flex-direction: column;
      cursor: pointer;
    }

    .mode-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 24px rgba(0,0,0,0.2);
    }

    .mode-card .icon {
      font-size: 64px;
      margin-bottom: 16px;
    }

    .mode-card h2 {
      margin: 0 0 12px 0;
      font-size: 28px;
      color: #667eea;
    }

    .mode-card > p {
      margin: 0 0 20px 0;
      color: #666;
      font-size: 16px;
      line-height: 1.5;
    }

    .features {
      list-style: none;
      padding: 0;
      margin: 0;
      border-top: 1px solid #e0e0e0;
      padding-top: 16px;
    }

    .features li {
      padding: 8px 0;
      font-size: 14px;
      color: #555;
      display: flex;
      align-items: center;
    }

    .features li:before {
      content: '✓';
      display: inline-block;
      width: 20px;
      height: 20px;
      background: #667eea;
      color: white;
      border-radius: 50%;
      text-align: center;
      line-height: 20px;
      margin-right: 10px;
      font-size: 12px;
      flex-shrink: 0;
    }

    .home-footer {
      text-align: center;
      opacity: 0.9;
      font-size: 14px;
    }

    .home-footer p {
      margin: 12px 0;
    }

    .tech-stack {
      font-size: 13px;
      opacity: 0.8;
    }

    .tech-stack a {
      color: white;
      text-decoration: underline;
    }

    @media (max-width: 768px) {
      .home-header h1 {
        font-size: 36px;
      }

      .mode-cards {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class HomeComponent {}
