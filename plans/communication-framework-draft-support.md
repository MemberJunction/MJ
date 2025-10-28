# Communication Framework - Draft Message Support

## Overview

Add support for creating draft messages in the MemberJunction Communication Framework. This feature will allow applications to save messages as drafts in supported providers (Gmail, MS Graph) before sending them. Not all providers support drafts (e.g., SendGrid, Twilio), so this will be implemented as an optional capability.

## Branch Information

- **Branch**: `comms-framework-drafts-support`
- **Target**: `next` (via PR)
- **Created**: 2025-10-22

## Affected Packages

1. `packages/Communication/base-types` - Type definitions and base provider interface
2. `packages/Communication/engine` - Engine orchestration for draft creation
3. `packages/Communication/providers/gmail` - Gmail draft implementation
4. `packages/Communication/providers/MSGraph` - MS Graph draft implementation
5. `packages/Communication/providers/sendgrid` - Stub implementation (not supported)
6. `packages/Communication/providers/twilio` - Stub implementation (not supported)
7. `packages/Communication/README.md` - Documentation updates
8. `migrations/v2/` - Database schema migration

## Architecture Pattern

This implementation follows the existing Communication Framework patterns:

- **Capability Flags**: Database-driven provider capabilities (`SupportsDrafts`)
- **Base Types**: Abstract method in `BaseCommunicationProvider`
- **Engine Orchestration**: `CommunicationEngine.CreateDraft()` handles common logic
- **Provider Implementation**: Each provider implements draft creation (or returns error)
- **Type Safety**: Full TypeScript typing with result objects

## Database Changes

### Migration File

Create: `migrations/v2/VYYYYMMDDHHMM__v2.x_Add_Draft_Support.sql`

**Schema Changes**:

```sql
-- Add SupportsDrafts column to CommunicationProvider table
ALTER TABLE [${flyway:defaultSchema}].[CommunicationProvider]
ADD [SupportsDrafts] BIT NOT NULL DEFAULT 0;
GO

-- Add column description
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether or not the provider supports creating draft messages',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CommunicationProvider',
    @level2type = N'COLUMN', @level2name = N'SupportsDrafts';
GO

-- Add table-level validation rule (CodeGen will create the actual constraint)
-- Drafts can only be supported if sending is also supported
-- This will be enforced via CodeGen-generated validation in the entity class
```

**Notes**:
- MemberJunction CodeGen will automatically:
  - Add the field to `CommunicationProviderEntity`
  - Generate view updates
  - Create stored procedures
  - Add entity metadata to EntityField table
  - Generate validation methods if table-level rules are defined

## Type Definitions (base-types)

### File: `packages/Communication/base-types/src/BaseProvider.ts`

**New Types**:

```typescript
/**
 * Parameters for creating a draft message
 */
export type CreateDraftParams = {
    /**
     * The message to save as a draft
     */
    Message: ProcessedMessage;

    /**
     * Optional provider-specific context data
     */
    ContextData?: Record<string, any>;
};

/**
 * Result of creating a draft message
 */
export type CreateDraftResult<T = Record<string, any>> = BaseMessageResult & {
    /**
     * The ID of the created draft in the provider's system
     */
    DraftID?: string;

    /**
     * Optional provider-specific result data
     */
    Result?: T;
};
```

**Updated Base Class**:

```typescript
export abstract class BaseCommunicationProvider {
    // ... existing methods ...

    /**
     * Creates a draft message using the provider.
     * Providers that don't support drafts should return Success: false
     * with an appropriate error message.
     * @param params - Parameters for creating the draft
     * @returns Promise<CreateDraftResult> - Result containing draft ID if successful
     */
    public abstract CreateDraft(params: CreateDraftParams): Promise<CreateDraftResult>
}
```

**Export Updates**:

Add to `packages/Communication/base-types/src/index.ts`:
```typescript
export type { CreateDraftParams, CreateDraftResult };
```

## Engine Implementation

### File: `packages/Communication/engine/src/Engine.ts`

**New Method**:

```typescript
/**
 * Creates a draft message using the specified provider
 * @param message - The message to save as a draft
 * @param providerName - Name of the provider to use
 * @param contextUser - Optional user context for server-side operations
 * @returns Promise<CreateDraftResult> - Result containing draft ID if successful
 */
public async CreateDraft(
    message: Message,
    providerName: string,
    contextUser?: UserInfo
): Promise<CreateDraftResult> {
    try {
        // Get provider instance
        const provider = this.GetProvider(providerName);
        if (!provider) {
            return {
                Success: false,
                ErrorMessage: `Provider ${providerName} not found`
            };
        }

        // Check if provider supports drafts
        const providerEntity = this._Providers.find(p => p.Name === providerName);
        if (!providerEntity?.SupportsDrafts) {
            return {
                Success: false,
                ErrorMessage: `Provider ${providerName} does not support creating drafts`
            };
        }

        // Process message (render templates)
        const processedMessage = new ProcessedMessageServer(message);
        const processResult = await processedMessage.Process(false, contextUser);

        if (!processResult.Success) {
            return {
                Success: false,
                ErrorMessage: `Failed to process message: ${processResult.Message}`
            };
        }

        // Create draft via provider
        const result = await provider.CreateDraft({
            Message: processedMessage,
            ContextData: message.ContextData
        });

        if (result.Success) {
            LogStatus(`Draft created successfully via ${providerName}. Draft ID: ${result.DraftID}`);
        } else {
            LogError(`Failed to create draft via ${providerName}`, undefined, result.ErrorMessage);
        }

        return result;
    } catch (error: any) {
        LogError('Error creating draft', undefined, error);
        return {
            Success: false,
            ErrorMessage: error.message || 'Error creating draft'
        };
    }
}
```

## Provider Implementations

### Gmail Provider

**File**: `packages/Communication/providers/gmail/src/GmailProvider.ts`

**Implementation**:

```typescript
/**
 * Creates a draft message in Gmail
 */
public async CreateDraft(params: CreateDraftParams): Promise<CreateDraftResult> {
    try {
        const userEmail = await this.getUserEmail();
        if (!userEmail) {
            return {
                Success: false,
                ErrorMessage: 'Could not get user email'
            };
        }

        // Reuse existing email content creation logic
        const raw = this.createEmailContent(params.Message);

        // Create draft using Gmail API
        const result = await this.gmailClient.users.drafts.create({
            userId: 'me',
            requestBody: {
                message: { raw }
            }
        });

        if (result && result.status >= 200 && result.status < 300) {
            LogStatus(`Draft created via Gmail: ${result.data.id}`);
            return {
                Success: true,
                DraftID: result.data.id,
                Result: result.data
            };
        } else {
            LogError('Failed to create draft via Gmail', undefined, result);
            return {
                Success: false,
                ErrorMessage: `Failed to create draft: ${result?.statusText || 'Unknown error'}`
            };
        }
    } catch (error: any) {
        LogError('Error creating draft via Gmail', undefined, error);
        return {
            Success: false,
            ErrorMessage: error.message || 'Error creating draft'
        };
    }
}
```

**Notes**:
- Uses existing `createEmailContent()` helper method
- Gmail API: `users.drafts.create()` endpoint
- Draft ID is returned in `result.data.id`

### MS Graph Provider

**File**: `packages/Communication/providers/MSGraph/src/MSGraphProvider.ts`

**Implementation**:

```typescript
/**
 * Creates a draft message in Exchange/Outlook via MS Graph
 */
public async CreateDraft(params: CreateDraftParams): Promise<CreateDraftResult> {
    try {
        // Smart selection: use message.From if provided and different from default
        let senderEmail: string | undefined;
        if (params.Message.From &&
            params.Message.From.trim() !== '' &&
            params.Message.From !== Config.AZURE_ACCOUNT_EMAIL) {
            senderEmail = params.Message.From;
        }

        const user: User | null = await this.GetServiceAccount(senderEmail);
        if (!user) {
            return {
                Success: false,
                ErrorMessage: 'Service account not found'
            };
        }

        // Build message object (similar to SendSingleMessage but saved as draft)
        const draftMessage: Record<string, any> = {
            subject: params.Message.ProcessedSubject,
            body: {
                contentType: params.Message.ProcessedHTMLBody ? 'HTML' : 'Text',
                content: params.Message.ProcessedHTMLBody || params.Message.ProcessedBody
            },
            toRecipients: [{
                emailAddress: { address: params.Message.To }
            }],
            ccRecipients: params.Message.CCRecipients?.map(recipient => ({
                emailAddress: { address: recipient }
            })),
            bccRecipients: params.Message.BCCRecipients?.map(recipient => ({
                emailAddress: { address: recipient }
            }))
        };

        if (params.Message.Headers) {
            // Convert Headers (Record<string, string>) to internetMessageHeaders (Array[{key:value}])
            draftMessage.internetMessageHeaders = Object.entries(params.Message.Headers)
                .map(([key, value]) => ({
                    name: key.startsWith('X-') ? key : `X-${key}`,
                    value: value
                }));
        }

        // Create draft by POSTing to messages endpoint (not sendMail)
        const createDraftPath = `${Auth.ApiConfig.uri}/${user.id}/messages`;
        const result = await Auth.GraphClient.api(createDraftPath).post(draftMessage);

        LogStatus(`Draft created via MS Graph: ${result.id}`);
        return {
            Success: true,
            DraftID: result.id,
            Result: result
        };
    } catch (error: any) {
        LogError('Error creating draft via MS Graph', undefined, error);
        return {
            Success: false,
            ErrorMessage: error.message || 'Error creating draft'
        };
    }
}
```

**Notes**:
- MS Graph automatically saves POSTed messages as drafts (isDraft = true by default)
- Uses `/messages` endpoint, NOT `/sendMail`
- Reuses existing logic from `SendSingleMessage()` for message structure

### SendGrid Provider (Not Supported)

**File**: `packages/Communication/providers/sendgrid/src/index.ts`

**Implementation**:

```typescript
/**
 * SendGrid does not support creating draft messages
 */
public async CreateDraft(params: CreateDraftParams): Promise<CreateDraftResult> {
    return {
        Success: false,
        ErrorMessage: 'SendGrid does not support creating draft messages. Drafts are only supported by email providers with mailbox access (Gmail, MS Graph).'
    };
}
```

### Twilio Provider (Not Supported)

**File**: `packages/Communication/providers/twilio/src/index.ts`

**Implementation**:

```typescript
/**
 * Twilio does not support creating draft messages
 */
public async CreateDraft(params: CreateDraftParams): Promise<CreateDraftResult> {
    return {
        Success: false,
        ErrorMessage: 'Twilio does not support creating draft messages. Drafts are only supported by email providers with mailbox access (Gmail, MS Graph).'
    };
}
```

## GraphQL API (Deferred for Now)

While we have an existing `EntityCommunicationsResolver` that could be extended with a draft mutation, this will be **deferred** for the initial implementation. The draft functionality will be server-side only for now.

**Future Enhancement** (not in this plan):

```typescript
@Mutation(() => CreateDraftResultType)
async CreateDraft(
    @Arg('message', () => CommunicationMessageInput) message: CommunicationMessageInput,
    @Arg('providerName', () => String) providerName: string,
    @Ctx() { userPayload }: AppContext
): Promise<CreateDraftResultType> {
    // Implementation here
}
```

This can be added in a future iteration when client-side access is needed.

## Documentation Updates

### File: `packages/Communication/README.md`

**Updates Required**:

1. **Add to Capabilities Matrix**:

```markdown
## Provider Capabilities

| Feature | SendGrid | Gmail | MS Graph | Twilio |
|---------|----------|-------|----------|--------|
| Send Single | ✅ | ✅ | ✅ | ✅ |
| Get Messages | ❌ | ✅ | ✅ | ✅ |
| Forward | ❌ | ✅ | ✅ | ✅ |
| Reply | ❌ | ✅ | ✅ | ✅ |
| **Create Draft** | **❌** | **✅** | **✅** | **❌** |
| Scheduled Send | ✅ | ❌ | ❌ | ❌ |
```

2. **Add Usage Example**:

```markdown
### Creating Draft Messages

Create a draft message that can be edited and sent later:

\`\`\`typescript
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message } from '@memberjunction/communication-types';

// Create a message
const message = new Message();
message.To = 'recipient@example.com';
message.From = 'sender@example.com';
message.Subject = 'Draft Message';
message.Body = 'This is a draft message';

// Create draft using Gmail
const result = await CommunicationEngine.Instance.CreateDraft(
    message,
    'Gmail',
    contextUser
);

if (result.Success) {
    console.log(`Draft created with ID: ${result.DraftID}`);
} else {
    console.error(`Failed to create draft: ${result.ErrorMessage}`);
}
\`\`\`

**Supported Providers**:
- **Gmail**: Drafts are created in the user's Gmail drafts folder
- **MS Graph**: Drafts are created in the user's Outlook/Exchange drafts folder
- **SendGrid**: Not supported (service-based email, no mailbox)
- **Twilio**: Not supported (SMS/messaging service, no draft concept)

**Note**: Only providers with mailbox access support drafts. Service-based providers (SendGrid, Twilio) return an error when `CreateDraft()` is called.
```

3. **Add to Base Provider Documentation**:

```markdown
### BaseCommunicationProvider Methods

All communication providers must implement these abstract methods:

- `SendSingleMessage(message)` - Send a single message
- `GetMessages(params)` - Retrieve messages from provider
- `ForwardMessage(params)` - Forward a message to other recipients
- `ReplyToMessage(params)` - Reply to a message
- **`CreateDraft(params)` - Create a draft message (NEW)**

Providers that don't support a feature should return `{ Success: false, ErrorMessage: '...' }` with a clear explanation.
```

## Testing Checklist

### Unit Tests (Future Enhancement)

While not included in this initial implementation, future testing should cover:

- ✅ Gmail provider creates drafts successfully
- ✅ MS Graph provider creates drafts successfully
- ✅ SendGrid returns appropriate error
- ✅ Twilio returns appropriate error
- ✅ Engine validates provider supports drafts
- ✅ Engine processes templates before draft creation
- ✅ Draft ID is returned in result

### Manual Testing

1. **Gmail Provider**:
   - Create draft with plain text message
   - Create draft with HTML message
   - Create draft with CC/BCC recipients
   - Create draft with custom headers
   - Verify draft appears in Gmail drafts folder

2. **MS Graph Provider**:
   - Create draft with plain text message
   - Create draft with HTML message
   - Create draft with CC/BCC recipients
   - Create draft with custom headers
   - Verify draft appears in Outlook/Exchange drafts folder

3. **Unsupported Providers**:
   - Verify SendGrid returns clear error message
   - Verify Twilio returns clear error message

4. **Engine Validation**:
   - Verify error when provider doesn't exist
   - Verify error when provider doesn't support drafts
   - Verify template processing occurs before draft creation

## Implementation Order

1. **Database Migration** (migrations/v2/)
   - Create migration file with column addition
   - Add extended property for column description
   - Run migration to update schema

2. **Run CodeGen**
   - Let MemberJunction generate entity updates
   - Verify `SupportsDrafts` field appears in `CommunicationProviderEntity`

3. **Base Types** (packages/Communication/base-types)
   - Add `CreateDraftParams` type
   - Add `CreateDraftResult` type
   - Add abstract `CreateDraft()` method to `BaseCommunicationProvider`
   - Update exports

4. **Provider Implementations**
   - Gmail: Implement working draft creation
   - MS Graph: Implement working draft creation
   - SendGrid: Add error-returning stub
   - Twilio: Add error-returning stub

5. **Engine Implementation** (packages/Communication/engine)
   - Add `CreateDraft()` method to `CommunicationEngine`
   - Include provider validation
   - Include template processing
   - Add logging

6. **Documentation** (packages/Communication/README.md)
   - Update capabilities matrix
   - Add usage examples
   - Document provider support

7. **Build & Compile**
   - Build all affected packages
   - Fix any TypeScript errors
   - Verify exports are correct

8. **Manual Testing**
   - Test Gmail draft creation
   - Test MS Graph draft creation
   - Verify unsupported providers return errors
   - Verify engine validation works

## Success Criteria

- ✅ Database migration completes successfully
- ✅ CodeGen generates proper entity updates
- ✅ All TypeScript code compiles without errors
- ✅ Gmail creates drafts successfully
- ✅ MS Graph creates drafts successfully
- ✅ SendGrid and Twilio return appropriate errors
- ✅ Engine validates provider capabilities
- ✅ Documentation is updated and accurate
- ✅ No breaking changes to existing functionality

## Future Enhancements (Out of Scope)

1. **GraphQL Mutations**: Add client-side API for draft creation
2. **Draft Management**: Edit, delete, and list drafts
3. **Entity Communications**: Bulk draft creation for multiple recipients
4. **Draft Logging**: Track draft creation in `CommunicationLog` table
5. **Draft Metadata**: Associate drafts with campaigns or tracking IDs

## Dependencies

- No new npm package dependencies required
- Uses existing provider SDKs:
  - `googleapis` (Gmail)
  - `@microsoft/microsoft-graph-client` (MS Graph)

## Backward Compatibility

This implementation is **fully backward compatible**:
- No changes to existing method signatures
- No changes to existing database data
- New column has default value (0 = not supported)
- Existing code continues to work unchanged
- New functionality is purely additive

## Rollback Plan

If issues arise:
1. Revert database migration (drop `SupportsDrafts` column)
2. Revert code changes in git
3. Rebuild packages
4. Re-run CodeGen to remove field from entities

## Notes

- Draft creation does NOT create `CommunicationLog` entries (drafts aren't sent)
- Draft IDs are provider-specific and cannot be used across providers
- Templates are processed before draft creation (same as sending)
- The `Message.SendAt` field is ignored for drafts (no scheduled send time)
- Drafts can be edited/sent later through the provider's native interface (Gmail, Outlook)

## Approval

Ready for implementation once reviewed and approved.
