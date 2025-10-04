---
"@memberjunction/a2aserver": patch
"@memberjunction/ai-agent-manager-actions": patch
"@memberjunction/ai-mcp-server": patch
"@memberjunction/ng-core-entity-forms": patch
---

entity name corrections

### Features

- **Resizable & Draggable Dialogs**: Converted all AI Agent dialog
  types from DialogService to WindowService
  - Added corner resizing and drag-and-drop movement capabilities for
    all 7 dialog types
  - Fixed z-index layering issues to render above MJExplorer banner
  - Improved dialog styling with enhanced CSS and layout fixes
- **Enhanced AI Agent Form**: Major improvements to
  ai-agent-form.component with expanded HTML layout and comprehensive
  styling

### Bug Fixes

- **Critical Entity Name Corrections**: Fixed entity references to use
  proper "MJ: " prefix for newer core entities
  - Fixed 'AI Agent Prompts' → 'MJ: AI Agent Prompts' (3 occurrences)
  - Fixed 'AI Agent Runs' → 'MJ: AI Agent Runs' (4 occurrences)
  - Ensures all entity references work correctly with the
    MemberJunction framework and prevents runtime errors

### Documentation

- Updated CLAUDE.md with comprehensive entity naming guidelines
- Added complete list of all 23 core entities requiring "MJ: " prefix
- Added warning section with code examples to prevent future entity
  naming issues

### Impact

- **Enhanced User Experience**: All AI Agent dialogs now provide
  modern, resizable, and draggable interfaces
- **Database Compatibility**: Ensures proper entity schema compliance
  across all AI services
- **Developer Guidance**: Comprehensive documentation prevents future
  entity naming conflicts
