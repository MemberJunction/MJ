/**
 * Betty Action - Interface to organization's knowledge base assistant
 *
 * Provides access to Betty Bot, an AI assistant trained on your organization's
 * knowledge base including documentation, policies, procedures, and institutional knowledge.
 * Betty can answer questions, provide guidance, and help users find relevant information
 * from your company's internal knowledge repository.
 *
 * @module @memberjunction/actions
 */

import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { BettyBotLLM } from "@memberjunction/ai-betty-bot";
import { ChatParams, ChatMessageRole, ChatMessage, GetAIAPIKey } from "@memberjunction/ai";

/**
 * Betty Action - Queries your organization's knowledge base assistant
 *
 * This action provides access to Betty Bot, an AI assistant specifically trained on your
 * organization's knowledge base. Betty can answer questions about company policies, procedures,
 * documentation, and other institutional knowledge.
 *
 * Key features:
 * - Answers questions using your organization's knowledge base
 * - Provides contextual responses with optional reference links
 * - Supports full conversation history for context-aware interactions
 * - Returns structured responses with optional supporting documentation
 *
 * Response format:
 * - BettyResponse: Text answer from Betty
 * - BettyReferences: Array of reference objects (if available)
 *   - Each reference contains: { link: string, title: string, type: string }
 *
 * @example
 * ```typescript
 * // Simple question
 * await runAction({
 *   ActionName: 'Betty',
 *   Params: [{
 *     Name: 'UserPrompt',
 *     Value: 'What is our vacation policy?'
 *   }]
 * });
 *
 * // Question with full conversation context
 * await runAction({
 *   ActionName: 'Betty',
 *   Params: [{
 *     Name: 'ConversationMessages',
 *     Value: [
 *       { role: 'user', content: 'What is our vacation policy?' },
 *       { role: 'assistant', content: 'Our vacation policy...' },
 *       { role: 'user', content: 'How do I request time off?' }
 *     ]
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "BettyAction")
export class BettyAction extends BaseAction {

    /**
     * Executes Betty knowledge base query
     *
     * @param params - The action parameters containing:
     *   - UserPrompt: Direct question for Betty (alternative to ConversationMessages)
     *   - ConversationMessages: Full conversation history for context-aware responses (preferred)
     *
     * @returns Betty's response with optional reference links
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            const userPromptParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'userprompt');
            const conversationMessagesParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'conversationmessages');

            // Build conversation messages array
            let messages: ChatMessage[];

            if (conversationMessagesParam && conversationMessagesParam.Value) {
                // Use full conversation history if provided
                if (Array.isArray(conversationMessagesParam.Value)) {
                    messages = conversationMessagesParam.Value as ChatMessage[];
                } else {
                    return {
                        Success: false,
                        Message: "ConversationMessages parameter must be an array of ChatMessage objects",
                        ResultCode: "INVALID_PARAMETERS"
                    };
                }
            } else if (userPromptParam && userPromptParam.Value) {
                // Fallback to simple user prompt
                messages = [{
                    role: ChatMessageRole.user,
                    content: userPromptParam.Value.toString().trim()
                }];
            } else {
                return {
                    Success: false,
                    Message: "Either UserPrompt or ConversationMessages parameter is required",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            // Validate we have at least one message
            if (messages.length === 0) {
                return {
                    Success: false,
                    Message: "ConversationMessages cannot be empty",
                    ResultCode: "INVALID_PARAMETERS"
                };
            }

            // Get Betty API key using AI package standard approach
            const apiKey = GetAIAPIKey('BettyBotLLM');
            if (!apiKey) {
                return {
                    Success: false,
                    Message: "Betty API key not found. Set AI_VENDOR_API_KEY__BETTYBOTLLM environment variable",
                    ResultCode: "MISSING_API_KEY"
                };
            }

            // Create Betty LLM instance
            const betty = new BettyBotLLM(apiKey);

            // Prepare chat parameters
            const chatParams: ChatParams = {
                messages: messages,
                model: 'betty', // Betty doesn't use model selection, but required by interface
                temperature: 0.7, // Default temperature
                maxOutputTokens: 2000 // Reasonable default
            };

            // Execute chat completion
            const result = await betty.ChatCompletion(chatParams);

            // Check for errors
            if (!result.success || !result.data) {
                return {
                    Success: false,
                    Message: result.errorMessage || "Betty returned an error",
                    ResultCode: "BETTY_ERROR"
                };
            }

            // Extract response
            const assistantMessage = result.data.choices?.[0]?.message;
            if (!assistantMessage) {
                return {
                    Success: false,
                    Message: "Betty did not return a response",
                    ResultCode: "EMPTY_RESPONSE"
                };
            }

            const bettyResponse = assistantMessage.content;

            // Extract references if provided
            // Betty returns references in multiple formats:
            // - choice[1]: Formatted text (for display)
            // - choice[2]: Raw JSON structure (for programmatic access)
            let bettyReferences: any[] | undefined;
            if (result.data.choices.length > 2) {
                // Use the structured JSON from choice[2]
                const referencesJsonChoice = result.data.choices[2];
                if (referencesJsonChoice.message.content && referencesJsonChoice.finish_reason === 'references_json') {
                    try {
                        bettyReferences = JSON.parse(referencesJsonChoice.message.content);
                    } catch (parseError) {
                        // If JSON parsing fails, fall back to text parsing from choice[1]
                        if (result.data.choices.length > 1) {
                            bettyReferences = this.parseReferences(result.data.choices[1].message.content);
                        }
                    }
                }
            } else if (result.data.choices.length > 1) {
                // Backwards compatibility: parse text format from choice[1]
                const referencesChoice = result.data.choices[1];
                if (referencesChoice.message.content) {
                    bettyReferences = this.parseReferences(referencesChoice.message.content);
                }
            }

            // Add output parameters
            params.Params.push({
                Name: 'BettyResponse',
                Value: bettyResponse,
                Type: "Output"
            });

            if (bettyReferences && bettyReferences.length > 0) {
                params.Params.push({
                    Name: 'BettyReferences',
                    Value: bettyReferences,
                    Type: "Output"
                });
            }

            // Create formatted response with markdown reference links
            let formattedResponse = bettyResponse;
            if (bettyReferences && bettyReferences.length > 0) {
                formattedResponse += '\n\n**References:**\n';
                for (const ref of bettyReferences) {
                    if (ref.title && ref.link) {
                        formattedResponse += `- [${ref.title}](${ref.link})`;
                        if (ref.type && ref.type.trim().toLowerCase() !== 'unknown') {
                            formattedResponse += ` (${ref.type})`;
                        }
                        formattedResponse += '\n';
                    }
                }
            }

            params.Params.push({
                Name: 'FormattedResponse',
                Value: formattedResponse,
                Type: "Output"
            });

            // Return success with formatted message
            const resultData: any = {
                response: bettyResponse
            };

            if (bettyReferences && bettyReferences.length > 0) {
                resultData.references = bettyReferences;
            }

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(resultData, null, 2)
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            return {
                Success: false,
                Message: `Failed to query Betty: ${errorMessage}`,
                ResultCode: "FAILED"
            };
        }
    }

    /**
     * Parses Betty's reference text into structured reference objects.
     * This is a fallback method for backwards compatibility when structured JSON is not available.
     *
     * Normally, Betty returns structured references as JSON in choice[2], but if that's not
     * available (older API version or error), this method parses the formatted text from choice[1].
     *
     * @param referencesText - Formatted reference text from Betty
     * @returns Array of reference objects with title and link properties
     * @private
     */
    private parseReferences(referencesText: string): any[] {
        const references: any[] = [];

        // Betty formats references as "Title: URL"
        // Example: "Company Policy: https://example.com/policy"
        const lines = referencesText.split('\n');

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.toLowerCase().includes('here are some')) {
                continue; // Skip header or empty lines
            }

            const colonIndex = trimmedLine.lastIndexOf(':');
            if (colonIndex > 0) {
                const title = trimmedLine.substring(0, colonIndex).trim();
                const link = trimmedLine.substring(colonIndex + 1).trim();

                if (title && link) {
                    references.push({
                        title: title,
                        link: link
                    });
                }
            }
        }

        return references;
    }
}