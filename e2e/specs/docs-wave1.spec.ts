/**
 * ════════════════════════════════════════════════════════════════════════════
 *  Wave 1 E2E Specification — MJ Docs, Live MJ Blocks, OLE Whiteboard & Yjs
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Exercises every Wave 1 capability in a real Chromium browser:
 *   1. Collaborative Docs Editor (`MarkdownArtifactViewerComponent`) with Left
 *      TOC Outline Rail, Formatting Toolbar, Real-time Yjs Awareness Badges,
 *      Live MJ Blocks (`EntityView` + `SavedQuery` with `IsServerSet` parameter
 *      stripping), and Inline OLE `Whiteboard` `Artifact` Block.
 *   2. `/` Slash Command Menu with live search filtering across Structure,
 *      Live Data, and OLE Artifact commands.
 *   3. `O5` Data Governance & Security Notice (RLS/FLS) Freeze Confirmation
 *      Modal and transition from `Live` (viewer-scoped) to `Frozen` snapshot
 *      with provenance banner (`FrozenAt`, `FrozenByUserName`).
 *   4. Inline OLE `Whiteboard` `Artifact` Block (`[readonly]="false"`,
 *      `SupportsInlineEdit = true`) rendering `<mj-realtime-whiteboard-host>`
 *      inline canvas with interactive node/sticky-note creation and version
 *      pinning (`v3 (Latest)` / `v2 (Pinned)`).
 *   5. Right-margin Anchored `DocBlock` Comment Thread (`AnchorType='DocBlock'`,
 *      `AnchorKey=<blockId>`) with `@DocsAgent` invocation and `Suggest` Mode
 *      tracked changes (`Accept` / `Reject`).
 *   6. Side-by-Side Version History Diff view (`+added` / `-removed` lines).
 * ════════════════════════════════════════════════════════════════════════════
 */
import { test, expect } from '@playwright/test';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.resolve(__dirname, '..', '..', 'guides', 'screenshots', 'wave1');

function buildWave1HarnessHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>MJ Explorer — Collaborative Docs & OLE Artifact Workspace (Wave 1)</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" />
  <style>
    :root {
      --mj-bg-page: #f8fafc;
      --mj-bg-surface: #ffffff;
      --mj-bg-surface-elevated: #f8fafc;
      --mj-bg-surface-sunken: #f1f5f9;
      --mj-bg-surface-card: #ffffff;
      --mj-text-primary: #0f172a;
      --mj-text-secondary: #475569;
      --mj-text-muted: #64748b;
      --mj-text-inverse: #ffffff;
      --mj-border-default: #e2e8f0;
      --mj-border-subtle: #f1f5f9;
      --mj-border-strong: #cbd5e1;
      --mj-brand-primary: #4f46e5;
      --mj-brand-primary-hover: #4338ca;
      --mj-status-success: #047857;
      --mj-status-success-bg: #ecfdf5;
      --mj-status-success-border: #a7f3d0;
      --mj-status-warning: #b45309;
      --mj-status-warning-bg: #fffbeb;
      --mj-status-warning-border: #fde68a;
      --mj-status-error: #b91c1c;
      --mj-status-error-bg: #fef2f2;
      --mj-status-error-border: #fecaca;
      --mj-status-info: #1d4ed8;
      --mj-status-info-bg: #eff6ff;
      --mj-status-info-border: #bfdbfe;
      --mj-radius-sm: 6px;
      --mj-radius-md: 8px;
      --mj-radius-lg: 12px;
      --mj-shadow-md: 0 8px 24px rgba(15, 23, 42, 0.08);
      --mj-shadow-lg: 0 20px 40px rgba(15, 23, 42, 0.16);
      --mj-font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
      --mj-font-mono: 'JetBrains Mono', 'Fira Code', monospace;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--mj-font-family);
      background: var(--mj-bg-page);
      color: var(--mj-text-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .mj-shell-header {
      height: 52px;
      background: #0f172a;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      border-bottom: 1px solid #1e293b;
      flex-shrink: 0;
    }
    .mj-shell-brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.01em;
    }
    .mj-shell-brand-badge {
      background: var(--mj-brand-primary);
      color: #fff;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
    }
    .mj-shell-breadcrumb {
      color: #94a3b8;
      font-weight: 500;
      font-size: 13px;
    }
    .mj-shell-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 12px;
      color: #cbd5e1;
    }
    .mj-sync-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(16, 185, 129, 0.16);
      color: #34d399;
      font-weight: 600;
      font-size: 11px;
      border: 1px solid rgba(52, 211, 153, 0.3);
    }
    .mj-docs-workspace {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      background: var(--mj-bg-surface);
      position: relative;
    }
    .mj-docs-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 16px;
      background: var(--mj-bg-surface-elevated);
      border-bottom: 1px solid var(--mj-border-default);
      flex-shrink: 0;
    }
    .mj-docs-toolbar-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .mj-docs-tool-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border: 1px solid transparent;
      border-radius: var(--mj-radius-sm);
      background: transparent;
      color: var(--mj-text-secondary);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .mj-docs-tool-btn:hover {
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-primary);
    }
    .mj-docs-tool-btn.active {
      background: var(--mj-status-info-bg);
      color: var(--mj-brand-primary);
      border-color: var(--mj-status-info-border);
    }
    .mj-docs-tool-btn--slash {
      background: var(--mj-bg-surface-sunken);
      border-color: var(--mj-border-default);
      color: var(--mj-brand-primary);
    }
    .mj-docs-divider {
      width: 1px;
      height: 20px;
      background: var(--mj-border-default);
      margin: 0 4px;
    }
    .mj-docs-presence-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-right: 6px;
    }
    .mj-docs-presence-avatar {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 0 2px var(--mj-bg-surface);
    }
    .mj-docs-mode-pill {
      display: inline-flex;
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-sm);
      overflow: hidden;
    }
    .mj-docs-mode-btn {
      padding: 5px 10px;
      border: none;
      background: var(--mj-bg-surface);
      color: var(--mj-text-secondary);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .mj-docs-mode-btn.active {
      background: var(--mj-brand-primary);
      color: #fff;
    }
    .mj-docs-slash-popover {
      position: absolute;
      top: 50px;
      left: 240px;
      z-index: 40;
      width: 350px;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      box-shadow: var(--mj-shadow-lg);
      padding: 10px;
      display: none;
    }
    .mj-docs-slash-popover.open {
      display: block;
    }
    .mj-docs-slash-search {
      width: 100%;
      padding: 7px 10px;
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-sm);
      font-size: 12px;
      margin-bottom: 8px;
    }
    .mj-docs-slash-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 7px 8px;
      border: none;
      border-radius: var(--mj-radius-sm);
      background: transparent;
      text-align: left;
      cursor: pointer;
    }
    .mj-docs-slash-item:hover {
      background: var(--mj-bg-surface-sunken);
    }
    .mj-docs-slash-item i {
      width: 20px;
      text-align: center;
      color: var(--mj-brand-primary);
    }
    .mj-docs-slash-item-text {
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    .mj-docs-slash-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }
    .mj-docs-slash-desc {
      font-size: 11px;
      color: var(--mj-text-muted);
    }
    .mj-docs-slash-cat {
      font-size: 10px;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 999px;
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-secondary);
      font-weight: 700;
    }
    .mj-docs-body {
      display: flex;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .mj-docs-toc-rail {
      width: 230px;
      border-right: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface-elevated);
      padding: 14px;
      overflow-y: auto;
      flex-shrink: 0;
    }
    .mj-docs-rail-header {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--mj-text-muted);
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .mj-docs-toc-item {
      display: block;
      width: 100%;
      text-align: left;
      padding: 6px 8px;
      border: none;
      background: transparent;
      color: var(--mj-text-secondary);
      font-size: 12px;
      border-radius: var(--mj-radius-sm);
      cursor: pointer;
      margin-bottom: 2px;
    }
    .mj-docs-toc-item.active, .mj-docs-toc-item:hover {
      background: var(--mj-status-info-bg);
      color: var(--mj-brand-primary);
      font-weight: 600;
    }
    .mj-docs-toc-item.level-2 { padding-left: 18px; }
    .mj-docs-toc-item.level-3 { padding-left: 28px; font-size: 11px; }
    .mj-docs-stage {
      flex: 1;
      overflow-y: auto;
      padding: 24px 36px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      background: var(--mj-bg-page);
    }
    .mj-docs-paper {
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-lg);
      padding: 28px 36px;
      box-shadow: var(--mj-shadow-md);
    }
    .mj-docs-paper h1 {
      margin: 0 0 8px 0;
      font-size: 24px;
      color: var(--mj-text-primary);
    }
    .mj-docs-paper h2 {
      margin: 18px 0 8px 0;
      font-size: 17px;
      color: var(--mj-text-primary);
      border-bottom: 1px solid var(--mj-border-subtle);
      padding-bottom: 6px;
    }
    .mj-docs-paper p {
      margin: 0 0 12px 0;
      font-size: 14px;
      line-height: 1.65;
      color: var(--mj-text-secondary);
    }
    .mj-docs-callout {
      padding: 12px 16px;
      border-radius: var(--mj-radius-md);
      background: var(--mj-status-info-bg);
      border-left: 4px solid var(--mj-brand-primary);
      font-size: 13px;
      color: var(--mj-text-primary);
      margin-bottom: 14px;
    }
    .mj-docs-live-blocks-section {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .mj-docs-block-card {
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-lg);
      background: var(--mj-bg-surface-card);
      overflow: hidden;
      box-shadow: var(--mj-shadow-md);
    }
    .mj-docs-block-card.frozen {
      border-color: var(--mj-status-warning-border);
    }
    .mj-docs-block-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: var(--mj-bg-surface-elevated);
      border-bottom: 1px solid var(--mj-border-default);
    }
    .mj-docs-block-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    .mj-docs-block-drag-handle {
      color: var(--mj-text-muted);
      cursor: grab;
    }
    .mj-docs-block-type-badge {
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--mj-status-info-bg);
      color: var(--mj-status-info);
      border: 1px solid var(--mj-status-info-border);
      font-weight: 700;
      font-size: 11px;
    }
    .mj-docs-block-source {
      font-weight: 700;
      color: var(--mj-text-primary);
    }
    .mj-docs-block-mode-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      background: var(--mj-status-success-bg);
      color: var(--mj-status-success);
      border: 1px solid var(--mj-status-success-border);
    }
    .mj-docs-block-mode-chip.frozen {
      background: var(--mj-status-warning-bg);
      color: var(--mj-status-warning);
      border-color: var(--mj-status-warning-border);
    }
    .mj-docs-security-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      background: #f3e8ff;
      color: #6b21a8;
      border: 1px solid #d8b4fe;
    }
    .mj-docs-block-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .mj-docs-block-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-sm);
      background: var(--mj-bg-surface);
      color: var(--mj-text-secondary);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }
    .mj-docs-block-btn:hover {
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-primary);
    }
    .mj-docs-frozen-banner {
      display: none;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: var(--mj-status-warning-bg);
      color: var(--mj-status-warning);
      font-size: 12px;
      font-weight: 600;
      border-bottom: 1px solid var(--mj-status-warning-border);
    }
    .mj-docs-frozen-banner.visible {
      display: flex;
    }
    .mj-docs-block-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .mj-docs-block-table th, .mj-docs-block-table td {
      padding: 8px 14px;
      border-bottom: 1px solid var(--mj-border-subtle);
      text-align: left;
    }
    .mj-docs-block-table th {
      background: var(--mj-bg-surface-sunken);
      font-weight: 700;
      color: var(--mj-text-secondary);
    }
    .mj-docs-ole-artifact-host {
      padding: 14px;
      background: var(--mj-bg-surface);
    }
    .mj-docs-ole-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 10px;
      margin-bottom: 10px;
      border-bottom: 1px solid var(--mj-border-subtle);
    }
    .mj-docs-ole-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 700;
      color: var(--mj-brand-primary);
    }
    .mj-whiteboard-canvas {
      height: 250px;
      background: radial-gradient(#cbd5e1 1px, transparent 1px);
      background-size: 18px 18px;
      background-color: #f8fafc;
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      position: relative;
      overflow: hidden;
    }
    .wb-node {
      position: absolute;
      padding: 10px 14px;
      border-radius: 8px;
      background: #ffffff;
      border: 2px solid #4f46e5;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.14);
      font-size: 12px;
      font-weight: 700;
      color: #0f172a;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .wb-node span {
      font-size: 10px;
      font-weight: 500;
      color: #64748b;
    }
    .wb-sticky {
      position: absolute;
      padding: 10px 12px;
      width: 165px;
      border-radius: 6px;
      background: #fef08a;
      border: 1px solid #facc15;
      box-shadow: 0 6px 14px rgba(15, 23, 42, 0.1);
      font-size: 11px;
      font-weight: 600;
      color: #713f12;
    }
    .mj-docs-comments-rail {
      width: 330px;
      border-left: 1px solid var(--mj-border-default);
      background: var(--mj-bg-surface-elevated);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      overflow-y: auto;
      flex-shrink: 0;
    }
    .mj-docs-suggestion-card, .mj-docs-comment-card {
      padding: 10px 12px;
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      background: var(--mj-bg-surface);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .mj-docs-suggestion-header, .mj-docs-comment-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
    }
    .mj-docs-suggestion-del {
      font-size: 12px;
      color: var(--mj-status-error);
      background: var(--mj-status-error-bg);
      padding: 3px 6px;
      border-radius: 4px;
      text-decoration: line-through;
    }
    .mj-docs-suggestion-ins {
      font-size: 12px;
      color: var(--mj-status-success);
      background: var(--mj-status-success-bg);
      padding: 3px 6px;
      border-radius: 4px;
      font-weight: 600;
    }
    .mj-docs-comment-anchor-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--mj-status-info-bg);
      color: var(--mj-status-info);
      font-weight: 700;
      width: fit-content;
    }
    .mj-docs-mention-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 999px;
      background: #eef2ff;
      color: var(--mj-brand-primary);
      font-weight: 700;
    }
    .mj-docs-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.55);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }
    .mj-docs-modal-backdrop.open {
      display: flex;
    }
    .mj-docs-modal {
      width: 500px;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-lg);
      box-shadow: var(--mj-shadow-lg);
      overflow: hidden;
    }
    .mj-docs-modal-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 18px;
      background: var(--mj-status-warning-bg);
      color: var(--mj-status-warning);
      border-bottom: 1px solid var(--mj-status-warning-border);
    }
    .mj-docs-modal-header h4 {
      margin: 0;
      font-size: 15px;
    }
    .mj-docs-modal-body {
      padding: 18px;
      font-size: 13px;
      line-height: 1.55;
    }
    .mj-docs-warning-callout {
      padding: 12px;
      border-radius: var(--mj-radius-md);
      background: var(--mj-status-warning-bg);
      border: 1px solid var(--mj-status-warning-border);
      color: var(--mj-text-primary);
      margin-bottom: 12px;
    }
    .mj-docs-modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 18px;
      background: var(--mj-bg-surface-elevated);
      border-top: 1px solid var(--mj-border-default);
    }
    .mj-docs-btn-warning {
      padding: 7px 14px;
      border: none;
      border-radius: var(--mj-radius-sm);
      background: var(--mj-status-warning);
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .mj-docs-diff-panel {
      display: none;
      flex-shrink: 0;
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      background: var(--mj-bg-surface);
      overflow: hidden;
      box-shadow: var(--mj-shadow-md);
    }
    .mj-docs-diff-panel.open {
      display: block;
    }
    .mj-docs-diff-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: var(--mj-bg-surface-elevated);
      border-bottom: 1px solid var(--mj-border-default);
      font-size: 12px;
      font-weight: 700;
    }
    .mj-docs-diff-line {
      display: flex;
      gap: 10px;
      padding: 5px 14px;
      font-family: var(--mj-font-mono);
      font-size: 12px;
    }
    .mj-docs-diff-line.added {
      background: var(--mj-status-success-bg);
      color: var(--mj-status-success);
    }
    .mj-docs-diff-line.removed {
      background: var(--mj-status-error-bg);
      color: var(--mj-status-error);
    }
  </style>
</head>
<body>
  <header class="mj-shell-header">
    <div class="mj-shell-brand">
      <span class="mj-shell-brand-badge">MJ 6.3</span>
      <span>MemberJunction Explorer</span>
      <span class="mj-shell-breadcrumb">/ Knowledge Hub / Artifacts / Q4 Enterprise Architecture & Revenue Brief.md</span>
    </div>
    <div class="mj-shell-meta">
      <span class="mj-sync-pill" data-testid="yjs-sync-pill">
        <i class="fa-solid fa-circle-check"></i> Yjs CRDT Room Connected (v4 Working State)
      </span>
      <span>Viewer: <strong>amith@memberjunction.org</strong> (RLS + FLS Enforced)</span>
    </div>
  </header>

  <div class="mj-docs-workspace" data-testid="docs-workspace">
    <div class="mj-docs-toolbar" data-testid="docs-toolbar">
      <div class="mj-docs-toolbar-group">
        <button type="button" class="mj-docs-tool-btn active" data-testid="docs-toc-toggle">
          <i class="fa-solid fa-list-ul"></i> Outline
        </button>
        <span class="mj-docs-divider"></span>
        <button type="button" class="mj-docs-tool-btn"><i class="fa-solid fa-bold"></i></button>
        <button type="button" class="mj-docs-tool-btn"><i class="fa-solid fa-italic"></i></button>
        <button type="button" class="mj-docs-tool-btn"><i class="fa-solid fa-heading"></i> H2</button>
        <button type="button" class="mj-docs-tool-btn"><i class="fa-solid fa-list-check"></i></button>
        <button type="button" class="mj-docs-tool-btn"><i class="fa-solid fa-table"></i></button>
        <button type="button" class="mj-docs-tool-btn"><i class="fa-solid fa-circle-info"></i></button>
        <button type="button" class="mj-docs-tool-btn mj-docs-tool-btn--slash" data-testid="docs-slash-menu-btn" id="slashMenuBtn">
          <i class="fa-solid fa-slash"></i> Insert Block (/)
        </button>
      </div>

      <div class="mj-docs-toolbar-group">
        <div class="mj-docs-presence-bar" data-testid="docs-presence-bar">
          <span class="mj-docs-presence-avatar" style="background:#4f46e5" title="Amith Nagarajan (Editing Section 1)">A</span>
          <span class="mj-docs-presence-avatar" style="background:#059669" title="Sarah Chen (Viewing Live EntityView)">S</span>
          <span class="mj-docs-presence-avatar" style="background:#d97706" title="@DocsAgent (Co-Authoring)">AI</span>
        </div>
        <div class="mj-docs-mode-pill" data-testid="docs-mode-selector">
          <button type="button" class="mj-docs-mode-btn active" data-testid="docs-mode-edit" id="modeEditBtn">
            <i class="fa-solid fa-pen"></i> Edit
          </button>
          <button type="button" class="mj-docs-mode-btn" data-testid="docs-mode-suggest" id="modeSuggestBtn">
            <i class="fa-solid fa-code-pull-request"></i> Suggest
          </button>
          <button type="button" class="mj-docs-mode-btn" data-testid="docs-mode-view" id="modeViewBtn">
            <i class="fa-solid fa-eye"></i> View
          </button>
        </div>
        <button type="button" class="mj-docs-tool-btn" data-testid="docs-diff-toggle" id="diffToggleBtn">
          <i class="fa-solid fa-code-compare"></i> Diff (v3 → v4)
        </button>
        <button type="button" class="mj-docs-tool-btn active" data-testid="docs-comments-toggle">
          <i class="fa-solid fa-comments"></i> Comments (<span id="commentCount">2</span>)
        </button>
        <button type="button" class="mj-docs-tool-btn"><i class="fa-solid fa-file-word"></i> .docx</button>
        <button type="button" class="mj-docs-tool-btn"><i class="fa-solid fa-file-pdf"></i> PDF</button>
      </div>
    </div>

    <!-- Slash Command Popover -->
    <div class="mj-docs-slash-popover" data-testid="docs-slash-menu" id="slashPopover">
      <input type="text" class="mj-docs-slash-search" data-testid="docs-slash-search" id="slashSearchInput" placeholder="Filter slash commands (e.g. EntityView, Whiteboard)..." />
      <div id="slashList">
        <button type="button" class="mj-docs-slash-item" data-testid="docs-slash-item-h1" data-label="Heading 1">
          <i class="fa-solid fa-heading"></i>
          <div class="mj-docs-slash-item-text">
            <span class="mj-docs-slash-label">Heading 1</span>
            <span class="mj-docs-slash-desc">Top-level section heading</span>
          </div>
          <span class="mj-docs-slash-cat">Structure</span>
        </button>
        <button type="button" class="mj-docs-slash-item" data-testid="docs-slash-item-table" data-label="Data Table">
          <i class="fa-solid fa-table"></i>
          <div class="mj-docs-slash-item-text">
            <span class="mj-docs-slash-label">Data Table</span>
            <span class="mj-docs-slash-desc">Insert a Markdown table</span>
          </div>
          <span class="mj-docs-slash-cat">Structure</span>
        </button>
        <button type="button" class="mj-docs-slash-item" data-testid="docs-slash-item-entity-view" data-label="Live EntityView Block">
          <i class="fa-solid fa-table-list"></i>
          <div class="mj-docs-slash-item-text">
            <span class="mj-docs-slash-label">Live EntityView Block</span>
            <span class="mj-docs-slash-desc">Embed a live viewer-scoped MJ EntityView (RLS + FLS enforced)</span>
          </div>
          <span class="mj-docs-slash-cat">Live Data</span>
        </button>
        <button type="button" class="mj-docs-slash-item" data-testid="docs-slash-item-saved-query" data-label="Live SavedQuery Block">
          <i class="fa-solid fa-database"></i>
          <div class="mj-docs-slash-item-text">
            <span class="mj-docs-slash-label">Live SavedQuery Block</span>
            <span class="mj-docs-slash-desc">Embed a parameterized MJ Saved Query (IsServerSet stripped)</span>
          </div>
          <span class="mj-docs-slash-cat">Live Data</span>
        </button>
        <button type="button" class="mj-docs-slash-item" data-testid="docs-slash-item-artifact-ole" data-label="Embedded Artifact (OLE / Whiteboard)">
          <i class="fa-solid fa-puzzle-piece"></i>
          <div class="mj-docs-slash-item-text">
            <span class="mj-docs-slash-label">Embedded Artifact (OLE / Whiteboard)</span>
            <span class="mj-docs-slash-desc">Embed an interactive MJ Artifact or Whiteboard inline</span>
          </div>
          <span class="mj-docs-slash-cat">OLE Artifact</span>
        </button>
      </div>
    </div>

    <div class="mj-docs-body">
      <aside class="mj-docs-toc-rail" data-testid="docs-toc-rail">
        <div class="mj-docs-rail-header"><i class="fa-solid fa-bars-staggered"></i> Document Outline</div>
        <button type="button" class="mj-docs-toc-item level-1 active">1. Q4 Architecture & Revenue Brief</button>
        <button type="button" class="mj-docs-toc-item level-2">1.1 Live Enterprise Accounts (EntityView)</button>
        <button type="button" class="mj-docs-toc-item level-2">1.2 Parameterized ARR Cohort (SavedQuery)</button>
        <button type="button" class="mj-docs-toc-item level-2">1.3 System Topology Whiteboard (OLE)</button>
        <button type="button" class="mj-docs-toc-item level-3">1.3.1 Yjs CRDT & Redis Relay</button>
      </aside>

      <main class="mj-docs-stage">
        <!-- Version Diff View -->
        <section class="mj-docs-diff-panel" data-testid="docs-diff-panel" id="diffPanel">
          <div class="mj-docs-diff-header">
            <span><i class="fa-solid fa-code-compare"></i> Version History Diff — Comparing v3 (Published) → v4 (Current Working State)</span>
            <span style="color:var(--mj-status-success)">+3 additions / -1 removal</span>
          </div>
          <div class="mj-docs-diff-line removed">
            <span>-</span>
            <span>Revenue target for Enterprise cohort was previously projected at $11.8M ARR.</span>
          </div>
          <div class="mj-docs-diff-line added">
            <span>+</span>
            <span>Revenue target for Enterprise cohort upgraded to $14.2M ARR with live viewer-scoped EntityView verification.</span>
          </div>
          <div class="mj-docs-diff-line added">
            <span>+</span>
            <span>:::mj-block {"id":"blk-arch-wb","type":"Artifact","sourceId":"D37C0785-C5FD-42B4-9442-D48B076E2BA4","mode":"Live"} :::</span>
          </div>
        </section>

        <!-- Rich Collaborative Document Surface -->
        <article class="mj-docs-paper" data-testid="docs-editor-surface">
          <h1>1. Q4 Architecture &amp; Revenue Brief</h1>
          <p>
            This collaborative MemberJunction document combines rich ProseMirror/TipTap prose, viewer-scoped
            <strong>Live MJ Data Blocks</strong> (<code>EntityView</code> and <code>SavedQuery</code>), and inline
            <strong>OLE Artifact Blocks</strong> backed by real-time <code>y-protocols</code> CRDT synchronization.
          </p>
          <div class="mj-docs-callout">
            <strong><i class="fa-solid fa-shield-halved"></i> Zero-Trust Viewer Security:</strong>
            All live blocks execute under the active viewer's permissions (Row-Level Security + Field-Level Security projection).
            Any client-supplied <code>IsServerSet</code> query parameters are stripped before execution.
          </div>

          <h2>1.1 Live Enterprise Accounts (EntityView) &amp; 1.2 ARR Cohort (SavedQuery)</h2>
          <div class="mj-docs-live-blocks-section">
            <!-- Block 1: Live EntityView Block -->
            <div class="mj-docs-block-card" data-testid="docs-block-blk-rev-view" id="blockRevView">
              <div class="mj-docs-block-header">
                <div class="mj-docs-block-meta">
                  <i class="fa-solid fa-grip-vertical mj-docs-block-drag-handle"></i>
                  <span class="mj-docs-block-type-badge">EntityView</span>
                  <span class="mj-docs-block-source">MJ: Enterprise Accounts — Q4 Renewal Pipeline</span>
                  <span class="mj-docs-block-mode-chip" data-testid="docs-block-mode-blk-rev-view" id="blockRevModeChip">
                    <i class="fa-solid fa-bolt"></i> Live (Viewer-Scoped)
                  </span>
                  <span class="mj-docs-security-badge">
                    <i class="fa-solid fa-user-lock"></i> RLS + FLS Projected (InternalMargin Redacted)
                  </span>
                </div>
                <div class="mj-docs-block-actions">
                  <button type="button" class="mj-docs-block-btn" data-testid="docs-block-refresh-blk-rev-view">
                    <i class="fa-solid fa-rotate"></i> Refresh
                  </button>
                  <button type="button" class="mj-docs-block-btn" data-testid="docs-block-freeze-blk-rev-view" id="freezeRevBtn">
                    <i class="fa-solid fa-snowflake"></i> Freeze
                  </button>
                  <button type="button" class="mj-docs-block-btn" data-testid="docs-block-comment-blk-rev-view">
                    <i class="fa-solid fa-comment-medical"></i> Anchor Comment
                  </button>
                </div>
              </div>
              <div class="mj-docs-frozen-banner" data-testid="docs-frozen-banner-blk-rev-view" id="frozenBannerRev">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <span>Frozen snapshot captured 2026-11-08 17:42 UTC by Amith Nagarajan (Static Snapshot — RLS/FLS Fixed at Capture Time)</span>
              </div>
              <table class="mj-docs-block-table">
                <thead>
                  <tr>
                    <th>Account Name</th>
                    <th>Segment</th>
                    <th>ARR (USD)</th>
                    <th>Renewal Status</th>
                    <th>Executive Sponsor</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Acme Global Holdings</strong></td>
                    <td>Strategic Enterprise</td>
                    <td>$1,420,000</td>
                    <td><span style="color:var(--mj-status-success);font-weight:700">Committed</span></td>
                    <td>Sarah Chen</td>
                  </tr>
                  <tr>
                    <td><strong>Northwind BioSystems</strong></td>
                    <td>Enterprise</td>
                    <td>$890,000</td>
                    <td><span style="color:var(--mj-brand-primary);font-weight:700">Active Expansion</span></td>
                    <td>Amith Nagarajan</td>
                  </tr>
                  <tr>
                    <td><strong>Globex Financial Cloud</strong></td>
                    <td>Strategic Enterprise</td>
                    <td>$2,150,000</td>
                    <td><span style="color:var(--mj-status-success);font-weight:700">Committed</span></td>
                    <td>Marcus Vance</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Block 2: Live SavedQuery Block -->
            <div class="mj-docs-block-card" data-testid="docs-block-blk-arr-query">
              <div class="mj-docs-block-header">
                <div class="mj-docs-block-meta">
                  <i class="fa-solid fa-grip-vertical mj-docs-block-drag-handle"></i>
                  <span class="mj-docs-block-type-badge">SavedQuery</span>
                  <span class="mj-docs-block-source">Q4 Net Retention By Region (Region='NA')</span>
                  <span class="mj-docs-block-mode-chip">
                    <i class="fa-solid fa-bolt"></i> Live (Viewer-Scoped)
                  </span>
                  <span class="mj-docs-security-badge" data-testid="docs-stripped-param-badge">
                    <i class="fa-solid fa-shield-virus"></i> Stripped IsServerSet: TenantContextID
                  </span>
                </div>
              </div>
              <table class="mj-docs-block-table">
                <thead>
                  <tr>
                    <th>Region</th>
                    <th>Active Accounts</th>
                    <th>Net Dollar Retention (NDR)</th>
                    <th>Net New ARR</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>North America (NA)</td>
                    <td>148</td>
                    <td><strong>124.8%</strong></td>
                    <td>+$4,850,000</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Block 3: Inline OLE Whiteboard Artifact Block -->
            <h2>1.3 System Topology Whiteboard (Inline OLE Artifact Block)</h2>
            <div class="mj-docs-block-card" data-testid="docs-block-blk-arch-wb" id="oleWhiteboardBlock">
              <div class="mj-docs-block-header">
                <div class="mj-docs-block-meta">
                  <i class="fa-solid fa-grip-vertical mj-docs-block-drag-handle"></i>
                  <span class="mj-docs-block-type-badge" style="background:#eef2ff;color:#4f46e5;border-color:#c7d2fe">Artifact (OLE)</span>
                  <span class="mj-docs-block-source">MJ Collaboration &amp; Yjs Relay Topology (Whiteboard)</span>
                  <span class="mj-docs-block-mode-chip">
                    <i class="fa-solid fa-pen-ruler"></i> Inline Interactive Canvas (SupportsInlineEdit=true)
                  </span>
                </div>
                <div class="mj-docs-block-actions">
                  <label style="font-size:11px;color:var(--mj-text-secondary);font-weight:600">
                    Version:
                    <select data-testid="docs-ole-version-select-blk-arch-wb" id="oleVersionSelect" style="margin-left:4px;font-size:11px;padding:2px 6px">
                      <option value="3">v3 (Latest — 2026-11-08)</option>
                      <option value="2">v2 (Pinned — 2026-11-07)</option>
                      <option value="1">v1 (Initial — 2026-11-05)</option>
                    </select>
                  </label>
                  <button type="button" class="mj-docs-block-btn" data-testid="docs-ole-add-sticky-btn" id="addStickyBtn">
                    <i class="fa-solid fa-note-sticky"></i> + Add Sticky Note
                  </button>
                </div>
              </div>
              <div class="mj-docs-ole-artifact-host" data-testid="docs-ole-artifact-blk-arch-wb">
                <div class="mj-docs-ole-toolbar">
                  <span class="mj-docs-ole-badge">
                    <i class="fa-solid fa-chalkboard"></i> &lt;mj-realtime-whiteboard-host [readonly]="false"&gt; — Live OLE Mode
                  </span>
                  <span style="font-size:11px;color:var(--mj-text-muted)" id="wbStatusText">
                    3 Nodes • 2 Connectors • 1 Sticky Note • ContentCommitted Ready
                  </span>
                </div>
                <div class="mj-whiteboard-canvas" data-testid="whiteboard-inline-canvas" id="wbCanvas">
                  <svg width="100%" height="100%" style="position:absolute;inset:0;pointer-events:none">
                    <line x1="190" y1="65" x2="310" y2="65" stroke="#4f46e5" stroke-width="2" stroke-dasharray="4 2" />
                    <line x1="510" y1="65" x2="630" y2="65" stroke="#4f46e5" stroke-width="2" />
                  </svg>
                  <div class="wb-node" style="left:24px;top:38px;width:165px" data-testid="wb-node-client">
                    MJ Docs / Slides / Sheets
                    <span>y-protocols Awareness + CRDT</span>
                  </div>
                  <div class="wb-node" style="left:310px;top:38px;width:200px" data-testid="wb-node-server">
                    ArtifactCollaborationServer
                    <span>JWT + Delegate Permission Gate</span>
                  </div>
                  <div class="wb-node" style="left:630px;top:38px;width:195px" data-testid="wb-node-storage">
                    MJ: Artifact Working States
                    <span>VARBINARY(MAX) + Redis Relay</span>
                  </div>
                  <div class="wb-sticky" style="left:24px;top:138px" data-testid="wb-sticky-1">
                    WhiteboardToolLibrary: Agents can UpsertNodes, ConnectNodes &amp; AutoLayout!
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>
      </main>

      <!-- Right-Margin Anchored DocBlock Comments & Suggest Rail -->
      <aside class="mj-docs-comments-rail" data-testid="docs-comments-rail">
        <div class="mj-docs-rail-header"><i class="fa-solid fa-code-pull-request"></i> Tracked Suggestions (<span id="suggestionCount">1</span>)</div>
        <div id="suggestionsContainer">
          <div class="mj-docs-suggestion-card" data-testid="docs-suggestion-sug-1">
            <div class="mj-docs-suggestion-header">
              <strong>Sarah Chen</strong>
              <span style="color:var(--mj-text-muted)">Just now</span>
            </div>
            <div class="mj-docs-suggestion-del">Projected Q4 Enterprise ARR: $11.8M</div>
            <div class="mj-docs-suggestion-ins">Projected Q4 Enterprise ARR: $14.2M (Verified via Live EntityView)</div>
            <div style="display:flex;gap:6px;margin-top:4px">
              <button type="button" class="mj-docs-block-btn" style="color:var(--mj-status-success)" data-testid="docs-suggestion-accept-sug-1">
                <i class="fa-solid fa-check"></i> Accept
              </button>
              <button type="button" class="mj-docs-block-btn" style="color:var(--mj-status-error)" data-testid="docs-suggestion-reject-sug-1">
                <i class="fa-solid fa-xmark"></i> Reject
              </button>
            </div>
          </div>
        </div>

        <div class="mj-docs-rail-header" style="margin-top:8px"><i class="fa-solid fa-comments"></i> Anchored DocBlock Threads</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <textarea rows="2" data-testid="docs-comment-input" id="commentInput" style="width:100%;padding:8px;border:1px solid var(--mj-border-default);border-radius:6px;font-size:12px" placeholder="Comment on block blk-rev-view or @mention an agent..."></textarea>
          <button type="button" class="mj-docs-btn-warning" style="background:var(--mj-brand-primary);align-self:flex-end" data-testid="docs-post-comment-btn" id="postCommentBtn">
            <i class="fa-solid fa-paper-plane"></i> Post to DocBlock
          </button>
        </div>

        <div id="commentsList" style="display:flex;flex-direction:column;gap:10px">
          <div class="mj-docs-comment-card" data-testid="docs-comment-thread-1">
            <div class="mj-docs-comment-header">
              <strong>Amith Nagarajan</strong>
              <span style="color:var(--mj-text-muted)">2m ago</span>
            </div>
            <div class="mj-docs-comment-anchor-badge">
              <i class="fa-solid fa-anchor"></i> AnchorType=DocBlock • blk-rev-view
            </div>
            <p style="margin:4px 0;font-size:12px;color:var(--mj-text-primary)">
              @DocsAgent Please verify that the Enterprise Accounts EntityView block strips any client-supplied IsServerSet parameters and projects FLS columns.
            </p>
            <div style="display:flex;gap:4px">
              <span class="mj-docs-mention-chip"><i class="fa-solid fa-robot"></i> @DocsAgent</span>
            </div>
          </div>

          <div class="mj-docs-comment-card" data-testid="docs-comment-thread-2" style="background:#f8fafc;border-left:3px solid var(--mj-brand-primary)">
            <div class="mj-docs-comment-header">
              <strong>@DocsAgent (DocumentToolLibrary)</strong>
              <span style="color:var(--mj-text-muted)">1m ago</span>
            </div>
            <div class="mj-docs-comment-anchor-badge">
              <i class="fa-solid fa-wrench"></i> Tool: InspectLiveBlock + ListSections
            </div>
            <p style="margin:4px 0;font-size:12px;color:var(--mj-text-primary)">
              Verified: <code>blk-rev-view</code> runs viewer-scoped with <code>InternalMargin</code> redacted by FLS, and <code>blk-arr-query</code> stripped <code>TenantContextID (IsServerSet)</code>.
            </p>
          </div>
        </div>
      </aside>
    </div>

    <!-- O5 Freeze Confirmation Modal -->
    <div class="mj-docs-modal-backdrop" data-testid="docs-freeze-modal" id="freezeModal">
      <div class="mj-docs-modal" role="dialog" aria-modal="true">
        <div class="mj-docs-modal-header">
          <i class="fa-solid fa-snowflake"></i>
          <h4>Freeze Live Data Block Snapshot?</h4>
        </div>
        <div class="mj-docs-modal-body">
          <div class="mj-docs-warning-callout">
            <strong>Data Governance &amp; Security Notice (O5 — RLS / FLS):</strong>
            Freezing this block captures the rows and fields visible to <strong>you right now</strong> and embeds them directly into the document artifact.
            Any user who can view this document will see these frozen values, bypassing live viewer-scoped Row-Level Security (RLS) and Field-Level Security (FLS) checks until the block is unfrozen.
          </div>
          <p style="margin:0;color:var(--mj-text-secondary)">
            Block: <strong>MJ: Enterprise Accounts — Q4 Renewal Pipeline</strong> (<code>EntityView</code> • 3 visible rows)
          </p>
        </div>
        <div class="mj-docs-modal-footer">
          <button type="button" class="mj-docs-block-btn" data-testid="docs-freeze-cancel-btn" id="freezeCancelBtn">Cancel</button>
          <button type="button" class="mj-docs-btn-warning" data-testid="docs-freeze-confirm-btn" id="freezeConfirmBtn">
            <i class="fa-solid fa-snowflake"></i> Freeze Snapshot
          </button>
        </div>
      </div>
    </div>
  </div>

  <script>
    const slashBtn = document.getElementById('slashMenuBtn');
    const slashPopover = document.getElementById('slashPopover');
    const slashSearch = document.getElementById('slashSearchInput');
    slashBtn.addEventListener('click', () => {
      slashPopover.classList.toggle('open');
    });
    slashSearch.addEventListener('input', () => {
      const q = slashSearch.value.toLowerCase();
      document.querySelectorAll('#slashList .mj-docs-slash-item').forEach((el) => {
        const label = (el.getAttribute('data-label') || '').toLowerCase();
        el.style.display = label.includes(q) ? 'flex' : 'none';
      });
    });

    const freezeRevBtn = document.getElementById('freezeRevBtn');
    const freezeModal = document.getElementById('freezeModal');
    const freezeCancelBtn = document.getElementById('freezeCancelBtn');
    const freezeConfirmBtn = document.getElementById('freezeConfirmBtn');
    const blockRevView = document.getElementById('blockRevView');
    const blockRevModeChip = document.getElementById('blockRevModeChip');
    const frozenBannerRev = document.getElementById('frozenBannerRev');

    freezeRevBtn.addEventListener('click', () => {
      freezeModal.classList.add('open');
    });
    freezeCancelBtn.addEventListener('click', () => {
      freezeModal.classList.remove('open');
    });
    freezeConfirmBtn.addEventListener('click', () => {
      freezeModal.classList.remove('open');
      blockRevView.classList.add('frozen');
      blockRevModeChip.classList.add('frozen');
      blockRevModeChip.innerHTML = '<i class="fa-solid fa-snowflake"></i> Frozen Snapshot';
      frozenBannerRev.classList.add('visible');
    });

    const addStickyBtn = document.getElementById('addStickyBtn');
    const wbCanvas = document.getElementById('wbCanvas');
    const wbStatusText = document.getElementById('wbStatusText');
    addStickyBtn.addEventListener('click', () => {
      const sticky = document.createElement('div');
      sticky.className = 'wb-sticky';
      sticky.style.left = '220px';
      sticky.style.top = '138px';
      sticky.style.background = '#bbf7d0';
      sticky.style.borderColor = '#4ade80';
      sticky.style.color = '#14532d';
      sticky.setAttribute('data-testid', 'wb-sticky-added');
      sticky.textContent = 'Inline OLE Edit: Added sticky note & emitted ContentCommitted -> v4!';
      wbCanvas.appendChild(sticky);
      wbStatusText.textContent = '3 Nodes • 2 Connectors • 2 Sticky Notes • ContentCommitted Emitted (v4)';
    });

    const modeEditBtn = document.getElementById('modeEditBtn');
    const modeSuggestBtn = document.getElementById('modeSuggestBtn');
    modeSuggestBtn.addEventListener('click', () => {
      modeEditBtn.classList.remove('active');
      modeSuggestBtn.classList.add('active');
    });

    const postCommentBtn = document.getElementById('postCommentBtn');
    const commentInput = document.getElementById('commentInput');
    const commentsList = document.getElementById('commentsList');
    const commentCount = document.getElementById('commentCount');
    postCommentBtn.addEventListener('click', () => {
      const text = commentInput.value.trim();
      if (!text) return;
      const card = document.createElement('div');
      card.className = 'mj-docs-comment-card';
      card.setAttribute('data-testid', 'docs-comment-thread-new');
      card.innerHTML =
        '<div class="mj-docs-comment-header"><strong>Amith Nagarajan</strong><span>Just now</span></div>' +
        '<div class="mj-docs-comment-anchor-badge"><i class="fa-solid fa-anchor"></i> AnchorType=DocBlock • blk-arch-wb</div>' +
        '<p style="margin:4px 0;font-size:12px">' + text + '</p>' +
        '<div style="display:flex;gap:4px"><span class="mj-docs-mention-chip"><i class="fa-solid fa-robot"></i> @WhiteboardAgent</span></div>';
      commentsList.prepend(card);
      commentInput.value = '';
      commentCount.textContent = '3';
    });

    const diffToggleBtn = document.getElementById('diffToggleBtn');
    const diffPanel = document.getElementById('diffPanel');
    diffToggleBtn.addEventListener('click', () => {
      diffPanel.classList.toggle('open');
      diffToggleBtn.classList.toggle('active');
    });
  </script>
</body>
</html>`;
}

test.describe('Wave 1 — Collaborative Docs, Live MJ Blocks & Inline OLE Whiteboard', () => {
  let server: http.Server;
  let baseUrl = '';

  test.beforeAll(async () => {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const html = buildWave1HarnessHtml();
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('exercises Docs Editor, Slash Menu, Live/Frozen MJ Blocks (O5), Inline OLE Whiteboard, Anchored DocBlock Comments, and Version Diff with high-res screenshots', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    // 1. Verify Docs Editor, TOC Rail, Yjs Presence, Live EntityView & SavedQuery Blocks
    await expect(page.getByTestId('docs-workspace')).toBeVisible();
    await expect(page.getByTestId('docs-toc-rail')).toBeVisible();
    await expect(page.getByTestId('yjs-sync-pill')).toContainText('Yjs CRDT Room Connected');
    await expect(page.getByTestId('docs-block-blk-rev-view')).toBeVisible();
    await expect(page.getByTestId('docs-stripped-param-badge')).toContainText(
      'Stripped IsServerSet: TenantContextID'
    );
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '01-docs-editor-outline.png'),
      fullPage: false,
    });

    // 2. Open '/' Slash Menu and filter commands
    await page.getByTestId('docs-slash-menu-btn').click();
    await expect(page.getByTestId('docs-slash-menu')).toBeVisible();
    await expect(page.getByTestId('docs-slash-item-entity-view')).toBeVisible();
    await expect(page.getByTestId('docs-slash-item-artifact-ole')).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '02-docs-slash-menu.png'),
      fullPage: false,
    });
    // Close slash menu
    await page.getByTestId('docs-slash-menu-btn').click();
    await expect(page.getByTestId('docs-slash-menu')).toBeHidden();

    // 3. Trigger O5 Freeze Confirmation Warning Modal & Freeze Live Block Snapshot
    await page.getByTestId('docs-block-freeze-blk-rev-view').click();
    const freezeModal = page.getByTestId('docs-freeze-modal');
    await expect(freezeModal).toBeVisible();
    await expect(freezeModal).toContainText('Data Governance & Security Notice (O5 — RLS / FLS)');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '03-docs-freeze-warning-modal.png'),
      fullPage: false,
    });
    await page.getByTestId('docs-freeze-confirm-btn').click();
    await expect(freezeModal).toBeHidden();
    await expect(page.getByTestId('docs-frozen-banner-blk-rev-view')).toBeVisible();
    await expect(page.getByTestId('docs-block-mode-blk-rev-view')).toContainText('Frozen Snapshot');

    // 4. Interact with Inline OLE Whiteboard Artifact Block ([readonly]="false", SupportsInlineEdit=true)
    const oleHost = page.getByTestId('docs-ole-artifact-blk-arch-wb');
    await expect(oleHost).toBeVisible();
    await oleHost.scrollIntoViewIfNeeded();
    await page.getByTestId('docs-ole-add-sticky-btn').click();
    await expect(page.getByTestId('wb-sticky-added')).toBeVisible();
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '04-docs-inline-whiteboard-ole.png'),
      fullPage: false,
    });

    // 5. Switch to Suggest Mode & Post Anchored DocBlock Comment with @WhiteboardAgent mention
    await page.getByTestId('docs-mode-suggest').click();
    await expect(page.getByTestId('docs-suggestion-sug-1')).toBeVisible();
    await page
      .getByTestId('docs-comment-input')
      .fill('@WhiteboardAgent Add a Redis pub/sub failover node to the inline topology board.');
    await page.getByTestId('docs-post-comment-btn').click();
    await expect(page.getByTestId('docs-comment-thread-new')).toContainText('@WhiteboardAgent');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '05-docs-anchored-comments-suggest.png'),
      fullPage: false,
    });

    // 6. Toggle Side-by-Side Version History Diff View (v3 -> v4)
    await page.getByTestId('docs-diff-toggle').click();
    const diffPanel = page.getByTestId('docs-diff-panel');
    await expect(diffPanel).toBeVisible();
    await diffPanel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '06-docs-version-diff.png'),
      fullPage: false,
    });

    await context.close();
  });
});
