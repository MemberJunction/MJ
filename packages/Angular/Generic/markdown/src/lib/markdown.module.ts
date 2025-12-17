import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarkdownComponent } from './components/markdown.component';
import { MarkdownService } from './services/markdown.service';

/**
 * MemberJunction Markdown Module
 *
 * A lightweight Angular module for rendering markdown content with:
 * - Prism.js syntax highlighting
 * - Mermaid diagram support
 * - Copy-to-clipboard for code blocks
 * - Collapsible heading sections
 * - GitHub-style alerts
 * - Heading anchor IDs
 *
 * Usage:
 * ```typescript
 * import { MarkdownModule } from '@memberjunction/ng-markdown';
 *
 * @NgModule({
 *   imports: [MarkdownModule]
 * })
 * export class YourModule { }
 * ```
 *
 * Then in your template:
 * ```html
 * <mj-markdown [data]="markdownContent"></mj-markdown>
 * ```
 *
 * Note: This module does NOT use forRoot(). Simply import it in any module
 * where you need markdown rendering. The MarkdownService is provided at root
 * level for efficient sharing across the application.
 */
@NgModule({
  declarations: [
    MarkdownComponent
  ],
  imports: [
    CommonModule
  ],
  exports: [
    MarkdownComponent
  ],
  providers: [
    // MarkdownService is providedIn: 'root', so no need to provide here
    // This ensures a single instance is shared across the app
  ]
})
export class MarkdownModule { }
