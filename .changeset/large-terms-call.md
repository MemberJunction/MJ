---
"@memberjunction/ng-auth-services": patch
"@memberjunction/ng-skip-chat": patch
"@memberjunction/server": patch
---

Skip Chat UI improvements and auth provider fixes

- **Skip Chat UI Enhancements**:

  - Fixed timer display persistence when switching between conversations
  - Prevented clock icon from disappearing when other conversations complete
  - Eliminated delay when displaying status messages on conversation switch
  - Fixed status message and timer persistence across page refreshes
  - Preserved whitespace formatting in chat messages
  - Updated chat input style to match MS Teams design
  - Fixed text overflow issues under buttons in chat input area

- **Auth Provider Improvements**:

  - Simplified Load function implementation across auth providers (Auth0, MSAL,
    Okta)

- **MJAPI Configuration**:
  - Added configurable public URL support for MJAPI callbacks to enable hybrid
    development scenarios
