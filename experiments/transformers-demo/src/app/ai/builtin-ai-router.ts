// Router-probe definitions for the Chrome built-in AI (Prompt API / Gemma 4) experiment.
//
// This models the "client-side pre-processor" idea: a small local model classifies an
// incoming request (intent + target agent) BEFORE anything is sent to the server, so the
// server-side agent (Betty, Sage, ...) can skip a planning/research step or be routed directly.
// The schema below is enforced by the Prompt API's `responseConstraint` (JSON Schema).

export type RouterIntent =
  | 'answer_from_knowledge' // answerable from general knowledge / the conversation so far, no retrieval
  | 'needs_research'        // requires searching the organisation's knowledge base
  | 'needs_clarification'   // too vague to act on
  | 'smalltalk'             // greetings / thanks / chit-chat
  | 'out_of_scope';         // unrelated to the organisation

export type RouterAgent =
  | 'betty_research'  // knowledge-base retrieval agent
  | 'betty_direct'    // answer without retrieval
  | 'report_builder'  // export / report / PDF of the conversation
  | 'admin_help'      // configuring Betty, channels, users
  | 'none';           // no agent needed

export interface RouterDecision {
  Intent: RouterIntent;
  TargetAgent: RouterAgent;
  Confidence: number;
}

export const ROUTER_SYSTEM_PROMPT = `You are the request router for "Betty", an AI assistant for professional-association members. Betty answers questions using the association's private knowledge base (conference content, policies, membership, CE credits, governance).
Classify each incoming member message.
Intent: answer_from_knowledge = can be answered from general knowledge or the conversation so far, no retrieval needed; needs_research = requires searching the association knowledge base; needs_clarification = too vague to act on; smalltalk = greetings/thanks/chit-chat; out_of_scope = unrelated to the association.
TargetAgent: betty_research (knowledge-base retrieval), betty_direct (answer without retrieval), report_builder (export/report/PDF of the conversation), admin_help (configuring Betty, channels, users), none (no agent needed).
Confidence: 0-1.`;

/** JSON Schema passed as `responseConstraint` — the model output is guaranteed to validate against it. */
export const ROUTER_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    Intent: {
      type: 'string',
      enum: ['answer_from_knowledge', 'needs_research', 'needs_clarification', 'smalltalk', 'out_of_scope'],
    },
    TargetAgent: {
      type: 'string',
      enum: ['betty_research', 'betty_direct', 'report_builder', 'admin_help', 'none'],
    },
    Confidence: { type: 'number' },
  },
  required: ['Intent', 'TargetAgent', 'Confidence'],
  additionalProperties: false,
};

export interface RouterSampleRequest {
  Message: string;
  ExpectedIntent: RouterIntent;
  ExpectedAgent: RouterAgent;
}

/** Hand-labelled sample requests used by the probe UI to score the local model. */
export const ROUTER_SAMPLE_REQUESTS: RouterSampleRequest[] = [
  { Message: 'hi there!', ExpectedIntent: 'smalltalk', ExpectedAgent: 'none' },
  { Message: 'What were the key takeaways from the 2025 annual conference keynote?', ExpectedIntent: 'needs_research', ExpectedAgent: 'betty_research' },
  { Message: 'Can you summarize the CE credit requirements for renewal this year?', ExpectedIntent: 'needs_research', ExpectedAgent: 'betty_research' },
  { Message: "Thanks, that's all I needed.", ExpectedIntent: 'smalltalk', ExpectedAgent: 'none' },
  { Message: 'Make me a PDF report of this conversation.', ExpectedIntent: 'answer_from_knowledge', ExpectedAgent: 'report_builder' },
  { Message: 'How do I add a new channel for the marketing team in Betty?', ExpectedIntent: 'answer_from_knowledge', ExpectedAgent: 'admin_help' },
  { Message: "What's the weather in Chicago today?", ExpectedIntent: 'out_of_scope', ExpectedAgent: 'none' },
  { Message: 'Compare the membership tiers and tell me which one fits a small nonprofit.', ExpectedIntent: 'needs_research', ExpectedAgent: 'betty_research' },
  { Message: 'Do you have anything on that?', ExpectedIntent: 'needs_clarification', ExpectedAgent: 'none' },
  { Message: "Translate 'welcome members' into Spanish.", ExpectedIntent: 'answer_from_knowledge', ExpectedAgent: 'betty_direct' },
  { Message: 'Who is the current board chair?', ExpectedIntent: 'needs_research', ExpectedAgent: 'betty_research' },
  { Message: 'What is 15% of 240?', ExpectedIntent: 'answer_from_knowledge', ExpectedAgent: 'betty_direct' },
];
