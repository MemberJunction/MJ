---
"@memberjunction/ng-skip-chat": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
---

Persist Skip conversation status and add completion time display

  - Added 'Status' column to Conversation table with 'Processing' and 'Available' states
  - Added 'CompletionTime' column to ConversationDetail table to track processing duration
  - Updated AskSkipResolver to manage conversation status and track processing time
  - Enabled GraphQLDataProvider to cache and retrieve session IDs from IndexedDB 
  - Enhanced skip-chat component to poll for 'Processing' conversations after page refresh
  - Added CompletionTime display in the UI for completed AI messages
  - Fixed session persistence for conversation status across page reloads