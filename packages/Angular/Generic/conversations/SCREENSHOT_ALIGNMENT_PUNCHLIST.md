# Screenshot Alignment Punch List

## Goal
Achieve pixel-perfect match between production (Screenshot 1) and prototype (Screenshot 2).

---

## P0 - CRITICAL CHANGES (Must Do First)

### 1. Message Avatar Shape & Styling
**Current**: All avatars are circles (36px)
**Target**: User avatars = circles, Agent avatars = squares with rounded corners
**Files**: `message-item.component.css`, `message-item.component.html`
**CSS Classes**: `.user-avatar`, `.agent-avatar`
```css
.avatar-circle.user-avatar {
  border-radius: 50%; /* Keep circular */
}

.avatar-circle.agent-avatar {
  border-radius: 8px; /* Square with rounded corners */
}
```

### 2. Agent Role Badges
**Current**: Missing entirely
**Target**: Show role badge next to agent name ("AI Assistant", "Code Expert", etc.)
**Files**: `message-item.component.html`, `message-item.component.css`
**HTML**: Add badge element in message-header
```html
<span class="agent-badge" *ngIf="isAIMessage">{{ aiAgentInfo?.role || 'AI Assistant' }}</span>
```
```css
.agent-badge {
  display: inline-block;
  padding: 2px 8px;
  background: #F3F4F6;
  border-radius: 10px;
  font-size: 11px;
  color: #6B7280;
  font-weight: 500;
  margin-left: 8px;
}
```

### 3. Message Background Colors
**Current**: AI messages have rgba(0,118,182,0.05) tint
**Target**: All messages have white/transparent background (no tint)
**Files**: `message-item.component.css`
```css
.message-item.ai-message {
  background-color: transparent; /* Remove tint */
}

.message-item.user-message {
  background-color: transparent; /* Already correct */
}
```

### 4. Reaction Buttons
**Current**: Missing entirely
**Target**: Show 👍 and 💬 buttons below each message
**Files**: `message-item.component.html`, `message-item.component.css`
```html
<div class="message-reactions">
  <button class="reaction-btn">
    <i class="far fa-thumbs-up"></i>
    <span class="reaction-count">0</span>
  </button>
  <button class="reaction-btn">
    <i class="far fa-comment"></i>
    <span class="reaction-count">0</span>
  </button>
</div>
```
```css
.message-reactions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.reaction-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: transparent;
  border: 1px solid #E5E7EB;
  border-radius: 12px;
  font-size: 12px;
  color: #6B7280;
  cursor: pointer;
  transition: all 0.2s;
}

.reaction-btn:hover {
  background: #F9FAFB;
  border-color: #D1D5DB;
}

.reaction-btn.reacted {
  background: #EFF6FF;
  border-color: #3B82F6;
  color: #3B82F6;
}

.reaction-count {
  font-weight: 500;
}
```

### 5. Artifact Card Complete Redesign
**Current**: Simple card with icon + text + arrow
**Target**: Document-style card with preview, actions, badge
**Files**: `message-item.component.html`, `message-item.component.css`
```html
<div class="artifact-card">
  <div class="artifact-card-header">
    <div class="artifact-card-icon">
      <i class="fas fa-file-alt"></i>
    </div>
    <div class="artifact-card-title-area">
      <div class="artifact-card-title">{{ artifactTitle }}</div>
      <div class="artifact-card-badge">{{ artifactType }}</div>
    </div>
  </div>
  <div class="artifact-card-preview">
    <code>{{ artifactPreview }}</code>
  </div>
  <div class="artifact-card-actions">
    <button class="artifact-action-btn">
      <i class="far fa-save"></i> Save
    </button>
    <button class="artifact-action-btn">
      <i class="far fa-share-square"></i> Share
    </button>
    <button class="artifact-action-btn">
      <i class="far fa-download"></i> Export
    </button>
  </div>
</div>
```
```css
.artifact-card {
  display: flex;
  flex-direction: column;
  margin-top: 12px;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  background: #FAFAFA;
  overflow: hidden;
}

.artifact-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid #E5E7EB;
}

.artifact-card-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F3F4F6;
  border-radius: 6px;
  color: #6B7280;
}

.artifact-card-title-area {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.artifact-card-title {
  font-weight: 600;
  font-size: 14px;
  color: #111827;
}

.artifact-card-badge {
  display: inline-block;
  padding: 2px 8px;
  background: #3B82F6;
  color: white;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  text-transform: lowercase;
}

.artifact-card-preview {
  padding: 12px 16px;
  background: #F9FAFB;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #374151;
  max-height: 120px;
  overflow: hidden;
  position: relative;
}

.artifact-card-preview code {
  display: block;
  white-space: pre-wrap;
  word-break: break-all;
}

.artifact-card-actions {
  display: flex;
  gap: 16px;
  padding: 12px 16px;
  background: white;
  border-top: 1px solid #E5E7EB;
}

.artifact-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  background: transparent;
  border: none;
  color: #3B82F6;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.2s;
}

.artifact-action-btn:hover {
  color: #2563EB;
}

.artifact-action-btn i {
  font-size: 14px;
}
```

### 6. Sidebar Section Headers
**Current**: Flat list, no sections
**Target**: Organized with collapsible sections ("Direct Messages", "Channels", "Projects")
**Files**: `conversation-sidebar.component.ts`, `conversation-list.component.ts`
**New Component Structure Needed**:
```html
<div class="sidebar-sections">
  <div class="sidebar-section">
    <div class="section-header" (click)="toggleSection('dm')">
      <span class="section-title">
        <i class="fas fa-chevron-right" [class.expanded]="sections.dm"></i>
        Direct Messages
      </span>
    </div>
    <div class="chat-list" [class.expanded]="sections.dm">
      <!-- DM items here -->
    </div>
  </div>

  <div class="sidebar-section">
    <div class="section-header" (click)="toggleSection('channels')">
      <span class="section-title">
        <i class="fas fa-chevron-right" [class.expanded]="sections.channels"></i>
        Channels
      </span>
    </div>
    <div class="chat-list" [class.expanded]="sections.channels">
      <!-- Channel items here -->
    </div>
  </div>

  <div class="sidebar-section">
    <div class="section-header" (click)="toggleSection('projects')">
      <span class="section-title">
        <i class="fas fa-chevron-right" [class.expanded]="sections.projects"></i>
        Projects
      </span>
      <button class="section-action">
        <i class="fas fa-plus"></i>
      </button>
    </div>
    <div class="chat-list" [class.expanded]="sections.projects">
      <!-- Project items here -->
    </div>
  </div>
</div>
```

---

## P1 - IMPORTANT CHANGES

### 7. Sidebar Top Tabs
**Current**: Missing
**Target**: "Chats" | "Libraries" tabs at top of sidebar
**Files**: `conversation-sidebar.component.ts`, `conversation-sidebar.component.html`
```html
<div class="sidebar-tabs">
  <button class="sidebar-tab" [class.active]="sidebarTab === 'chats'" (click)="sidebarTab = 'chats'">
    <i class="fas fa-comments"></i>
    Chats
  </button>
  <button class="sidebar-tab" [class.active]="sidebarTab === 'libraries'" (click)="sidebarTab = 'libraries'">
    <i class="fas fa-book"></i>
    Libraries
  </button>
</div>
```
```css
.sidebar-tabs {
  display: flex;
  padding: 16px 16px 0;
  gap: 4px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.sidebar-tab {
  flex: 1;
  padding: 10px 16px;
  background: transparent;
  border: none;
  color: rgba(255,255,255,0.6);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-bottom: 2px solid transparent;
}

.sidebar-tab:hover {
  color: rgba(255,255,255,0.9);
}

.sidebar-tab.active {
  color: white;
  border-bottom-color: white;
}

.sidebar-tab i {
  font-size: 14px;
}
```

### 8. Active Users Indicator in Header
**Current**: Just shows "1 member"
**Target**: Shows "Active:" with colored avatar circles
**Files**: `conversation-chat-area.component.html`, `conversation-chat-area.component.ts`
```html
<div class="active-users">
  <span class="active-users-label">Active:</span>
  <div class="active-user-avatars">
    <div class="active-user-avatar" [style.background-color]="user.color" *ngFor="let user of activeUsers">
      {{ user.initials }}
    </div>
  </div>
</div>
```
```css
.active-users {
  display: flex;
  align-items: center;
  gap: 8px;
}

.active-users-label {
  font-size: 12px;
  color: #6B7280;
  font-weight: 500;
}

.active-user-avatars {
  display: flex;
  gap: 4px;
}

.active-user-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: white;
  border: 2px solid white;
}
```

### 9. Artifacts Button Styling in Header
**Current**: Gray button
**Target**: Blue badge-style button
**Files**: `conversation-chat-area.component.ts`
```css
.artifact-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #3B82F6; /* Bright blue */
  border: none;
  border-radius: 16px; /* More rounded */
  font-size: 13px;
  font-weight: 600;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.artifact-indicator:hover {
  background: #2563EB;
}

.artifact-indicator i {
  font-size: 12px;
}
```

### 10. Date Separator
**Current**: Missing
**Target**: "Today" dropdown pill centered in chat
**Files**: `message-list.component.html`, `message-list.component.css`
```html
<div class="date-separator">
  <button class="date-separator-btn">
    Today
    <i class="fas fa-chevron-down"></i>
  </button>
</div>
```
```css
.date-separator {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

.date-separator-btn {
  padding: 6px 16px;
  background: #F3F4F6;
  border: 1px solid #E5E7EB;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  color: #6B7280;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.date-separator-btn:hover {
  background: #E5E7EB;
}

.date-separator-btn i {
  font-size: 10px;
}
```

### 11. Timestamp Position
**Current**: Separate line or block
**Target**: Inline with name, right-aligned
**Files**: `message-item.component.html`, `message-item.component.css`
```html
<div class="message-header">
  <span class="message-sender">{{ sender }}</span>
  <span class="agent-badge" *ngIf="isAI">{{ role }}</span>
  <span class="message-time">{{ time }}</span>
</div>
```
```css
.message-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px; /* Tighter */
}

.message-time {
  margin-left: auto; /* Push to right */
  font-size: 12px;
  color: #9CA3AF;
  font-weight: 400;
}
```

---

## P2 - POLISH CHANGES

### 12. Send Button Color
**Current**: Gray
**Target**: Blue
**Files**: `message-input.component.scss`
```css
.btn-send {
  background: #3B82F6; /* Blue instead of gray */
}

.btn-send:hover:not(:disabled) {
  background: #2563EB;
}
```

### 13. Project/Website Badges on Conversations
**Current**: Missing
**Target**: Small colored badges next to conversation names
**Files**: `conversation-list.component.html`, `conversation-list.component.ts`
```html
<span class="project-badge" *ngIf="conversation.projectName">
  {{ conversation.projectName }}
</span>
```
```css
.project-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  margin-left: auto;
  background-color: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-badge.project-website {
  background-color: #7ED321;
  color: white;
}
```

### 14. Icon Differences
**Current**: @ and # icons may be missing
**Target**: Use @ for DMs, # for channels
**Files**: `conversation-list.component.html`
```html
<i class="chat-icon" [ngClass]="conversation.type === 'dm' ? 'fa-at' : 'fa-hashtag'"></i>
```

### 15. Message Input Placeholder
**Current**: "Type a message... (Ctrl+Enter to send)"
**Target**: "Type your message... (Press Enter to send, Shift+Enter for new line)"
**Files**: `message-input.component.html`
```html
<textarea placeholder="Type your message... (Press Enter to send, Shift+Enter for new line)"></textarea>
```

---

## Implementation Order

### Phase 1: Critical Visual Changes (P0)
1. ✅ Message backgrounds → Remove AI tint
2. ✅ Avatar shapes → Square for agents
3. ✅ Agent badges → Add role indicators
4. ✅ Reaction buttons → Add 👍 💬
5. ✅ Artifact cards → Complete redesign
6. ✅ Sidebar sections → Add collapsible structure

### Phase 2: Important Features (P1)
7. ✅ Sidebar tabs → Add "Chats" | "Libraries"
8. ✅ Active users → Add colored avatars in header
9. ✅ Artifacts button → Blue badge styling
10. ✅ Date separator → Add "Today" dropdown
11. ✅ Timestamp position → Move inline with name

### Phase 3: Polish (P2)
12. ✅ Send button → Change to blue
13. ✅ Project badges → Add to conversations
14. ✅ Icons → @ for DMs, # for channels
15. ✅ Placeholder text → Update message

---

## CSS Class Name Mapping

### Use These Prototype Class Names:
```
sidebar, sidebar-content, sidebar-search, sidebar-section
section-header, section-title, section-action
chat-list, chat-item, chat-icon, chat-name
message, message-content, message-header, message-sender
message-time, message-body, message-text, message-reactions
reaction-btn, reaction-count
artifact-card, artifact-card-header, artifact-card-preview
artifact-card-actions, artifact-action-btn
active-users, active-users-label, active-user-avatar
date-separator, date-separator-btn
project-badge
agent-badge
```

---

*Punch List Created: 2025-10-03*
*Total Tasks: 15*
*Estimated Time: 4-6 hours*
*Priority: P0 (6 tasks), P1 (5 tasks), P2 (4 tasks)*
