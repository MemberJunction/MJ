---
"@memberjunction/ng-skip-chat": patch
---

Improve Skip-Chat report viewer UI and functionality

### 🎯 Key Improvements

**Report Viewer Architecture**

- Refactored from toggle-based panels to clean nested tab
  structure
- Implemented proper tabs: Component, Functional,
  Technical, Data Spec, and Code
- Removed complex resize and toggle functionality for
  simpler, more maintainable code
- Improved tab formatting with better heights and spacing

**Save Report Functionality**

- Fixed "Save Report" button state management
- Added proper notification display using
  MJNotificationService
- Button now correctly updates to "Open Saved Report"
  after creation
- Fixed isCreatingReport flag reset on completion

**Print Report Enhancement**

- Implemented iframe-based printing to isolate component
  content
- Captures current DOM state using cloneNode(true) to
  preserve user interactions
- Prints exactly what user is viewing including toggles,
  filters, and view changes
- No new windows/tabs - seamless print experience

**Conversation Sync**

- Fixed conversation name synchronization when artifacts
  are created
- UI now updates immediately when Skip renames
  conversations
