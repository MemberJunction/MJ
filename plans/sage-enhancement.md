# Sage Enhancement Plan: Intelligent Agent Selection with Semantic Search

**Status**: Proposed - Minimal Enhancement Approach
**Created**: 2025-10-15
**Goal**: Make Sage consistently select the best agents for tasks using semantic search instead of manual description matching

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Current State](#current-state)
3. [Proposed Solution](#proposed-solution)
4. [Implementation Details](#implementation-details)
5. [Sage Prompt Updates](#sage-prompt-updates)
6. [Usage Examples](#usage-examples)
7. [Testing Strategy](#testing-strategy)
8. [Success Metrics](#success-metrics)
9. [Future Enhancements](#future-enhancements)

---

## Problem Statement

### Current Issues

1. **Manual Agent Matching**: Sage currently selects agents by manually comparing task descriptions with the `ALL_AVAILABLE_AGENTS` list, which relies on basic string/description matching.

2. **Inconsistent Agent Selection**: Without semantic understanding, Sage may:
   - Miss the best agent due to different wording
   - Select a less suitable agent
   - Fail to find agents for ambiguous tasks

3. **Underutilized Find Best Agent Action**: Sage HAS the Find Best Agent action (semantic similarity search with embeddings), but the prompt doesn't instruct Sage to use it consistently.

4. **User Knowledge Requirement**: Users must often specify which agent to use (e.g., "@Marketing Agent write a blog post") because Sage doesn't reliably find the right agent from natural language requests.

### What We Need

- Sage should understand **WHAT** the user wants (intent, task complexity)
- Sage should intelligently find the **BEST AGENT** to handle it using semantic search
- Sage should work well even when users don't know which agent exists or what it's called
- Sage should build high-quality task graphs with correct agent assignments

---

## Current State

### Sage's Decision Framework (Current)

```markdown
1. Use Agents First
   ↓ If available agent matches user request
   ↓ Return invokeAgent payload

2. When to Execute Actions (type: 'Actions')
   - Simple data queries
   - Permission checks
   - Basic CRUD operations
   - Scheduled job management

3. When to Respond Directly (type: 'Chat')
   - Simple informational questions
   - Navigation guidance

4. When to Stay Silent
   - Multi-party conversations
   - Other agents handling requests
```

### How Agent Selection Works Today

1. Sage receives `ALL_AVAILABLE_AGENTS` list (Name + Description)
2. Sage manually picks agent by matching descriptions to user request
3. Sage constructs task graph with hardcoded agent names
4. **Problem**: Basic string matching may pick wrong agent

### Find Best Agent Action (Available but Underused)

**Capabilities:**
- Uses local embeddings for fast semantic similarity search
- Returns top N agents ranked by similarity score (0-1)
- Can return up to 20 agents
- Includes agent details: name, description, systemPrompt, score

**Action Parameters:**
- `TaskDescription` (required): Description of task to match
- `MaxResults` (optional, default 5): Number of results (1-20)
- `MinimumSimilarityScore` (optional, default 0.5): Threshold for matches
- `IncludeInactive` (optional, default false): Include inactive agents

**Action Outputs:**
- `MatchedAgents`: Array of agents sorted by similarity (highest first)
- `BestAgent`: Single best match
- `MatchCount`: Total matches

**Each matched agent includes:**
```json
{
  "agentId": "uuid",
  "agentName": "Agent Name",
  "description": "Agent description",
  "similarityScore": 0.85,
  "systemPrompt": "Full system prompt...",
  "typeName": "Loop",
  "status": "Active"
}
```

---

## Proposed Solution

### Minimal Enhancement Approach

Instead of building a complex two-phased system with separate sub-agents, we enhance Sage's prompt with:

1. **Clear guidance to USE Find Best Agent for all agent selection**
2. **Instructions to request top 10 matches and intelligently evaluate them**
3. **Task complexity assessment framework**
4. **Reasoning guidelines for agent selection**

### Why This Approach?

✅ **Leverages existing infrastructure** - Find Best Agent already works well
✅ **Fast to implement and test** - Just prompt updates
✅ **Easy to iterate** - Can refine based on results
✅ **Minimal code changes** - No new sub-agents or complex orchestration
✅ **Proven concept** - Previous experiments with Find Best Agent showed good results

### When to Use Find Best Agent

**ALWAYS use Find Best Agent when:**
- Building single-agent task delegation
- Building multi-step task graphs (for EACH task)
- User request doesn't explicitly mention an agent by name
- Ambiguous requests where multiple agents might fit

**Can skip Find Best Agent when:**
- User explicitly mentions agent by name (e.g., "@Marketing Agent")
- You're executing your own actions (not delegating)
- Responding with direct chat (not delegating)

---

## Implementation Details

### Phase 1: Update Sage's Prompt

#### 1. Add "Agent Selection Strategy" Section

Location: After "Agent Orchestration" section, before "Decision Framework"

```markdown
## Agent Selection Strategy

When delegating work to agents, ALWAYS use the Find Best Agent action for intelligent selection.

### Standard Process for Agent Selection

1. **Call Find Best Agent with top 10 results**
   ```json
   {
     "name": "Find Best Agent",
     "params": {
       "TaskDescription": "detailed description of what needs to be done",
       "MaxResults": 10,
       "MinimumSimilarityScore": 0.5
     }
   }
   ```

2. **Review the top 10 recommendations**
   - Each agent has a similarityScore (0-1, higher is better)
   - Read the agent descriptions carefully
   - Consider the systemPrompt for capability details
   - Don't just pick the highest score - THINK about fit

3. **Evaluate and select the best agent**
   - **Primary factor**: Does the agent's capabilities match the task requirements?
   - **Consider similarity score**: Higher scores (>0.7) indicate strong semantic match
   - **Read descriptions**: Sometimes a slightly lower score has better actual fit
   - **Check specialization**: Prefer specialists over generalists for specific tasks
   - **Avoid Sage**: Don't delegate to yourself (agentName === "Sage")

4. **Fallback if no good matches**
   - If all scores are low (<0.6), consider:
     a) Breaking the task into smaller pieces
     b) Handling it yourself with your actions
     c) Asking user for clarification
   - If Find Best Agent returns error or no results, fall back to ALL_AVAILABLE_AGENTS list

### Examples of Good Agent Selection

**Example 1: Single clear match**
```
User: "Write a blog post about AI trends"
→ Call Find Best Agent("Write a blog post about AI trends", MaxResults=10)
→ Results: Marketing Agent (0.92), Content Agent (0.78), Research Agent (0.65)...
→ Decision: Marketing Agent - highest score AND perfect capability match
```

**Example 2: Multiple similar agents**
```
User: "Analyze sales data and find patterns"
→ Call Find Best Agent("Analyze sales data and find patterns", MaxResults=10)
→ Results: Analysis Agent (0.88), Data Agent (0.86), Research Agent (0.82)...
→ Review: Analysis Agent specializes in pattern detection
→ Decision: Analysis Agent - slight edge in score AND better specialization
```

**Example 3: Consider multiple factors**
```
User: "Research competitors and create comparison report"
→ Call Find Best Agent("Research competitors and create comparison report", MaxResults=10)
→ Results: Research Agent (0.85), Marketing Agent (0.75), Report Agent (0.70)...
→ Review: This task has two phases - research AND report creation
→ Decision: Build multi-step task graph:
   - Task 1: Research Agent (best for research)
   - Task 2: Report Agent (best for formatting/presentation)
```

### When to Build Multi-Step Task Graphs

If a user request has multiple distinct phases, break it down:

1. **Identify the phases**
   - "Research X and create Y" = 2 phases
   - "Gather data, analyze it, and present findings" = 3 phases

2. **Use Find Best Agent for EACH phase**
   ```
   Phase 1: "Research market data" → Find Best Agent → Research Agent
   Phase 2: "Analyze the research data" → Find Best Agent → Analysis Agent
   Phase 3: "Create presentation" → Find Best Agent → Marketing Agent
   ```

3. **Build the task graph**
   - Include dependencies (Phase 2 depends on Phase 1)
   - Pass outputs: `"data": "@task1.output"`
   - Use specific, clear task descriptions

### Agent Selection Decision Tree

```
User sends message
    ↓
Is this a simple task I can handle with my actions?
    YES → Execute actions, respond to user
    NO → Continue
    ↓
Does user explicitly mention an agent (@AgentName)?
    YES → Use that specific agent
    NO → Continue
    ↓
Call Find Best Agent(userRequest, MaxResults=10)
    ↓
Review top 10 results
    ↓
Best match score > 0.7 AND capability matches?
    YES → Use that agent (single task or task graph)
    NO → Check if scores 0.5-0.7 have good fit
        ↓
        Good fit found?
            YES → Use that agent with reasoning why
            NO → Either:
                a) Break task into smaller pieces and retry Find Best Agent
                b) Handle with your own actions
                c) Ask user for clarification
```
```

#### 2. Update "Decision Framework" Section

Replace current "Use Agents First" section with:

```markdown
## Decision Framework

### 1. Assess Task Complexity First

**Simple Tasks** (handle yourself with Actions):
- Single data query or CRUD operation
- Web search with immediate response
- Scheduling job management (Query/Create/Update/Delete/Execute jobs)
- Permission checks
- Entity record lookups
- Tasks that require <30 seconds and no complex reasoning
→ Execute your actions, respond to user

**Single-Agent Tasks** (delegate to one specialist):
- Clearly defined, self-contained request
- One agent can handle end-to-end
- Examples: "write blog post", "analyze sales data", "create email campaign"
→ Use Find Best Agent (MaxResults=10), select best match, create single-task graph

**Multi-Agent Tasks** (build task graph workflow):
- Multiple distinct phases or steps
- Different expertise needed for each phase
- Dependencies between steps
- Examples: "Research market, analyze data, create strategy", "Gather feedback, summarize insights, draft recommendations"
→ Break into phases, use Find Best Agent for EACH phase, build task graph

### 2. Agent Selection Process

For EVERY delegation decision (single or multi-task):

1. **Call Find Best Agent**
   - Use the user's request or specific phase description
   - Request MaxResults=10 to see options
   - Set MinimumSimilarityScore=0.5 for broad search

2. **Intelligently evaluate top 10**
   - Don't just pick highest score
   - Read descriptions and system prompts
   - Consider specialization vs generalist
   - Match capabilities to actual requirements

3. **Make informed decision**
   - Select agent with best fit (may not be #1 by score)
   - Include reasoning in your response
   - If no good fit, consider breaking down task or handling yourself

### 3. When to Execute Actions vs Delegate

**Execute your own actions when:**
- Task is simple and you have the right action
- Examples: Get Weather, Web Search, CRUD operations, Scheduled Job management
- No agent delegation needed
→ Use type: 'Actions' with your available actions

**Delegate to specialist agent when:**
- Task requires domain expertise
- Complex reasoning or multi-step process within one domain
- Creative work (writing, design, analysis)
→ Use Find Best Agent, create task graph

### 4. When to Respond with Chat vs Delegate

**Respond directly (type: 'Chat') when:**
- Simple informational questions
- Navigation guidance
- Quick clarifications
- Acknowledgments

**Delegate when:**
- Task requires action or creation of deliverables
- Expertise beyond your capabilities
- User expects substantive work product
```

#### 3. Add Task Graph Best Practices

After Decision Framework, add:

```markdown
## Multi-Step Task Graph Best Practices

### Building High-Quality Task Graphs

When user request requires multiple steps:

1. **Break down the work clearly**
   ```
   User: "Research AI companies, analyze market, create GTM strategy"

   Breakdown:
   - Phase 1: Research AI companies in target segment
   - Phase 2: Analyze market data and trends
   - Phase 3: Create go-to-market strategy based on analysis
   ```

2. **Use Find Best Agent for EACH phase independently**
   ```
   Phase 1 → Find Best Agent("Research AI companies in target segment", 10)
            → Select: Research Agent (0.89)

   Phase 2 → Find Best Agent("Analyze market data and trends", 10)
            → Select: Analysis Agent (0.92)

   Phase 3 → Find Best Agent("Create go-to-market strategy", 10)
            → Select: Marketing Agent (0.87)
   ```

3. **Build the task graph with correct dependencies**
   ```json
   {
     "newElements": {
       "taskGraph": {
         "workflowName": "AI Market Research & GTM Strategy",
         "reasoning": "Complex request requiring research, analysis, and strategic planning",
         "tasks": [
           {
             "tempId": "task1",
             "name": "Research AI Companies",
             "description": "Research AI companies in target segment with focus on size and technology stack",
             "agentName": "Research Agent",
             "dependsOn": [],
             "inputPayload": {
               "industry": "AI",
               "filters": "target segment criteria"
             }
           },
           {
             "tempId": "task2",
             "name": "Analyze Market Data",
             "description": "Analyze the research data to identify trends and opportunities",
             "agentName": "Analysis Agent",
             "dependsOn": ["task1"],
             "inputPayload": {
               "researchData": "@task1.output",
               "analysisType": "market trends"
             }
           },
           {
             "tempId": "task3",
             "name": "Create GTM Strategy",
             "description": "Develop go-to-market strategy based on research and analysis",
             "agentName": "Marketing Agent",
             "dependsOn": ["task2"],
             "inputPayload": {
               "marketAnalysis": "@task2.output",
               "researchData": "@task1.output",
               "product": "our AI solution"
             }
           }
         ]
       }
     }
   }
   ```

### Task Graph Design Principles

1. **Clear task boundaries**
   - Each task should have one clear output
   - Avoid tasks that try to do too much

2. **Explicit dependencies**
   - Use dependsOn to enforce order
   - Pass outputs: `"data": "@taskX.output"`

3. **Rich input payloads**
   - Give agents context they need
   - Reference prior task outputs
   - Include relevant user preferences

4. **Descriptive task names**
   - User sees these in progress updates
   - Make them clear and professional
```

---

## Sage Prompt Updates

### Files to Modify

**Primary File**: `/metadata/prompts/templates/conversations/conversation-manager-agent.template.md`

### Specific Changes

1. **After line 138** (after "Available Agents" section), insert:
   - New "Agent Selection Strategy" section (see above)

2. **Replace lines 139-166** (current "Decision Framework"):
   - With new "Decision Framework" (see above)

3. **After new Decision Framework**, insert:
   - "Multi-Step Task Graph Best Practices" section (see above)

### Summary of Changes

- **Added**: Agent Selection Strategy (how to use Find Best Agent)
- **Added**: Task complexity assessment
- **Enhanced**: Decision framework with Find Best Agent integration
- **Added**: Multi-step task graph best practices
- **Added**: Decision trees and examples

### Testing the Updates

After updating the prompt:

1. **Test simple delegation**
   - "Write a blog post about AI"
   - Verify Sage calls Find Best Agent with MaxResults=10
   - Check if correct agent selected (likely Marketing Agent)

2. **Test multi-step tasks**
   - "Research competitors and create comparison report"
   - Verify Sage breaks into phases
   - Verify Find Best Agent called for each phase
   - Check task graph structure

3. **Test edge cases**
   - Ambiguous requests
   - Requests with no good agent match
   - Requests that Sage should handle itself

---

## Usage Examples

### Example 1: Simple Blog Post Request

**User Message:**
```
"Write a blog post about the future of AI in healthcare"
```

**Sage's Process:**

1. **Assess complexity**: Single-agent task (content creation)

2. **Call Find Best Agent**:
   ```json
   {
     "name": "Find Best Agent",
     "params": {
       "TaskDescription": "Write a blog post about the future of AI in healthcare",
       "MaxResults": 10,
       "MinimumSimilarityScore": 0.5
     }
   }
   ```

3. **Review top 10 results**:
   ```
   1. Marketing Agent (0.91) - Creates marketing content, blog posts, campaigns
   2. Content Writer Agent (0.88) - Specialized in long-form content
   3. Research Agent (0.72) - Gathers and synthesizes information
   4. Healthcare Agent (0.68) - Domain expertise in healthcare
   5. ...
   ```

4. **Evaluate options**:
   - Marketing Agent: High score, perfect for blog posts
   - Content Writer: Slightly lower but specialized in writing
   - Research + Healthcare: Lower scores, better for research phase

5. **Decision**: Select **Marketing Agent**
   - Highest score AND best capability match for blog writing

6. **Build task graph**:
   ```json
   {
     "newElements": {
       "taskGraph": {
         "workflowName": "Create AI Healthcare Blog Post",
         "reasoning": "Marketing Agent is best suited for creating engaging blog content",
         "tasks": [
           {
             "tempId": "task1",
             "name": "Write Blog Post",
             "description": "Write a comprehensive blog post about the future of AI in healthcare",
             "agentName": "Marketing Agent",
             "dependsOn": [],
             "inputPayload": {
               "topic": "AI in healthcare",
               "tone": "professional yet accessible",
               "targetLength": "1000-1500 words"
             }
           }
         ]
       }
     }
   }
   ```

---

### Example 2: Complex Multi-Phase Request

**User Message:**
```
"Research the top AI companies in the US, analyze their market positioning, and create a competitive landscape report"
```

**Sage's Process:**

1. **Assess complexity**: Multi-agent task (research → analysis → reporting)

2. **Break into phases**:
   - Phase 1: Research top AI companies
   - Phase 2: Analyze market positioning
   - Phase 3: Create competitive landscape report

3. **Call Find Best Agent for Phase 1**:
   ```json
   {
     "name": "Find Best Agent",
     "params": {
       "TaskDescription": "Research top AI companies in the US",
       "MaxResults": 10
     }
   }
   ```
   **Result**: Research Agent (0.94) ← Select this

4. **Call Find Best Agent for Phase 2**:
   ```json
   {
     "name": "Find Best Agent",
     "params": {
       "TaskDescription": "Analyze market positioning of AI companies",
       "MaxResults": 10
     }
   }
   ```
   **Result**: Analysis Agent (0.91) ← Select this

5. **Call Find Best Agent for Phase 3**:
   ```json
   {
     "name": "Find Best Agent",
     "params": {
       "TaskDescription": "Create competitive landscape report",
       "MaxResults": 10
     }
   }
   ```
   **Result**: Marketing Agent (0.87), Report Agent (0.84)
   **Decision**: Marketing Agent ← Better for market-facing reports

6. **Build task graph**:
   ```json
   {
     "newElements": {
       "taskGraph": {
         "workflowName": "AI Companies Competitive Analysis",
         "reasoning": "Complex request requiring research, analysis, and professional reporting",
         "tasks": [
           {
             "tempId": "task1",
             "name": "Research AI Companies",
             "description": "Research and compile data on top AI companies in the US",
             "agentName": "Research Agent",
             "dependsOn": [],
             "inputPayload": {
               "location": "United States",
               "industry": "Artificial Intelligence",
               "dataPoints": ["revenue", "employees", "products", "market focus"]
             }
           },
           {
             "tempId": "task2",
             "name": "Analyze Market Positioning",
             "description": "Analyze the competitive positioning and market segments of researched companies",
             "agentName": "Analysis Agent",
             "dependsOn": ["task1"],
             "inputPayload": {
               "companyData": "@task1.output",
               "analysisType": "competitive positioning",
               "frameworks": ["Porter's Five Forces", "Market segmentation"]
             }
           },
           {
             "tempId": "task3",
             "name": "Create Landscape Report",
             "description": "Create a professional competitive landscape report with insights and visualizations",
             "agentName": "Marketing Agent",
             "dependsOn": ["task1", "task2"],
             "inputPayload": {
               "researchData": "@task1.output",
               "analysis": "@task2.output",
               "format": "executive report with visualizations"
             }
           }
         ]
       }
     }
   }
   ```

---

### Example 3: Ambiguous Request

**User Message:**
```
"Help me understand our customer churn"
```

**Sage's Process:**

1. **Assess complexity**: Ambiguous - could be simple info or complex analysis

2. **Call Find Best Agent**:
   ```json
   {
     "name": "Find Best Agent",
     "params": {
       "TaskDescription": "Understand and analyze customer churn patterns",
       "MaxResults": 10
     }
   }
   ```

3. **Review results**:
   ```
   1. Analysis Agent (0.82) - Data analysis and pattern detection
   2. Data Agent (0.78) - Database queries and data extraction
   3. Customer Success Agent (0.72) - Customer relationship insights
   4. Research Agent (0.65) - Research and synthesis
   5. ...
   ```

4. **Evaluate**:
   - All scores are moderate (0.65-0.82)
   - Analysis Agent best fit, but task unclear
   - User might just want quick info vs full analysis

5. **Decision**: Ask for clarification first
   ```json
   {
     "nextStep": {
       "type": "Chat"
     },
     "message": "I can help you understand customer churn. Would you like me to:

1. **Quick overview**: Pull recent churn data and show trends (I can do this with my data actions)
2. **Deep analysis**: Have the Analysis Agent perform a comprehensive churn analysis with patterns, segments, and predictions
3. **Strategic recommendations**: Build a multi-step workflow with analysis followed by strategic recommendations

What level of insight are you looking for?",
     "taskComplete": false
   }
   ```

---

### Example 4: Simple Task Sage Should Handle

**User Message:**
```
"What's the weather in New York?"
```

**Sage's Process:**

1. **Assess complexity**: Simple action execution

2. **Check available actions**: Has "Get Weather" action

3. **Decision**: Handle directly, no agent needed
   ```json
   {
     "nextStep": {
       "type": "Actions",
       "actions": [
         {
           "name": "Get Weather",
           "params": {
             "location": "New York"
           }
         }
       ]
     },
     "reasoning": "Simple weather query - can handle with Get Weather action",
     "taskComplete": false
   }
   ```

4. **After action executes**: Respond with weather info
   ```json
   {
     "taskComplete": true,
     "message": "The weather in New York is currently 72°F and partly cloudy with a high of 78°F expected today."
   }
   ```

---

## Testing Strategy

### Phase 1: Unit Testing

Test individual components of the enhancement:

1. **Test Find Best Agent action directly**
   - Verify it returns top 10 results
   - Check similarity scores are reasonable
   - Confirm agent details are complete

2. **Test various TaskDescription inputs**
   - Simple tasks: "write blog post"
   - Complex tasks: "research, analyze, report"
   - Ambiguous tasks: "help with marketing"
   - Domain-specific: "analyze sales data"

### Phase 2: Integration Testing

Test Sage with the new prompt:

1. **Simple delegation scenarios**
   ```
   Test cases:
   - "Write a blog post about AI"
   - "Analyze last quarter's sales"
   - "Create a marketing email"
   - "Research competitors"
   ```

   **Expected behavior**:
   - Sage calls Find Best Agent with MaxResults=10
   - Sage reviews top results
   - Sage selects appropriate agent
   - Single-task graph created

2. **Multi-step task scenarios**
   ```
   Test cases:
   - "Research market and create strategy"
   - "Gather feedback, analyze it, and create recommendations"
   - "Study competitors, analyze strengths/weaknesses, suggest improvements"
   ```

   **Expected behavior**:
   - Sage breaks into clear phases
   - Find Best Agent called for EACH phase
   - Well-structured task graph with dependencies
   - Appropriate agents for each phase

3. **Edge cases**
   ```
   Test cases:
   - Ambiguous requests
   - No good agent match
   - Tasks Sage should handle itself
   - User explicitly mentions agent
   ```

   **Expected behavior**:
   - Graceful fallback strategies
   - Asks for clarification when needed
   - Correctly handles self-service tasks
   - Respects user agent preferences

### Phase 3: User Acceptance Testing

Real-world scenarios with actual users:

1. **Observe natural usage patterns**
   - What do users actually request?
   - How does Sage respond?
   - Are agents selected correctly?

2. **Measure quality**
   - Agent selection accuracy
   - Task breakdown quality
   - User satisfaction with results

3. **Collect feedback**
   - Were the right agents used?
   - Were task graphs well-structured?
   - Did results meet expectations?

---

## Success Metrics

### Quantitative Metrics

1. **Agent Selection Accuracy**
   - Target: >90% of agent selections deemed "appropriate" by reviewers
   - Measure: Review 50 random agent selections per week

2. **Find Best Agent Usage**
   - Target: 100% of delegation decisions use Find Best Agent
   - Measure: Log analysis of Sage actions

3. **Task Graph Quality**
   - Target: >85% of task graphs have logical structure and dependencies
   - Measure: Manual review of task graphs

4. **User Satisfaction**
   - Target: Users don't need to specify agent by name >80% of time
   - Measure: Track @mention usage vs natural language

### Qualitative Metrics

1. **Reasoning Quality**
   - Are Sage's agent selection explanations clear?
   - Does Sage show understanding of task requirements?

2. **Fallback Handling**
   - Does Sage gracefully handle ambiguous requests?
   - Are clarification questions helpful?

3. **Task Breakdown**
   - Are complex tasks broken into logical phases?
   - Are dependencies correctly identified?

---

## Future Enhancements

If the minimal enhancement works well, consider these additions:

### 1. Dynamic Similarity Threshold

Instead of fixed 0.5 threshold, adjust based on task:
- Critical tasks: Require higher threshold (0.7+)
- Exploratory tasks: Accept lower threshold (0.5+)

### 2. Multi-Agent Consensus

For ambiguous tasks, consider top 2-3 agents:
- Run quick assessment with each
- Compare approaches
- Select best approach or combine

### 3. Agent Performance Tracking

Track which agents succeed/fail at which tasks:
- Build performance history
- Use to adjust agent selection
- Identify agents that need improvement

### 4. Learning from User Corrections

When user corrects agent selection:
- Record the correction
- Analyze why wrong agent was chosen
- Adjust selection logic

### 5. Two-Phased Architecture (Future)

If complexity grows, implement original vision:
- **Phase 1**: Quick intent assessment (current Sage)
- **Phase 2a**: WBS builder (sub-agent with 120B+ model)
- **Phase 2b**: Agent assignment (Loop agent with Find Best Agent)

### 6. Human-in-Loop Support

Enable mixed AI/human workflows:
- Assign tasks to humans
- Pause task graph execution at human steps
- Resume after human completes work
- Notification system for human tasks

---

## Implementation Checklist

### Preparation

- [ ] Review current Sage prompt thoroughly
- [ ] Test Find Best Agent action independently
- [ ] Identify test scenarios
- [ ] Prepare test data

### Prompt Updates

- [ ] Back up current prompt file
- [ ] Add "Agent Selection Strategy" section
- [ ] Update "Decision Framework" section
- [ ] Add "Multi-Step Task Graph Best Practices" section
- [ ] Review for consistency and clarity
- [ ] Sync prompt to database with `mj-sync push`

### Testing

- [ ] Unit test Find Best Agent with various inputs
- [ ] Test simple delegation scenarios
- [ ] Test multi-step task scenarios
- [ ] Test edge cases and fallbacks
- [ ] User acceptance testing with real scenarios

### Monitoring

- [ ] Set up logging for Find Best Agent calls
- [ ] Track agent selection decisions
- [ ] Monitor task graph structures
- [ ] Collect user feedback

### Iteration

- [ ] Review metrics after 1 week
- [ ] Identify areas for improvement
- [ ] Refine prompt based on learnings
- [ ] Repeat testing cycle

---

## Rollback Plan

If the enhancement causes issues:

1. **Immediate rollback**
   - Restore previous prompt from backup
   - Run `mj-sync push` to revert
   - Notify team

2. **Analyze issues**
   - What went wrong?
   - Was it prompt wording?
   - Was it Find Best Agent behavior?
   - Was it task complexity assessment?

3. **Iterate and retry**
   - Fix identified issues
   - Test more thoroughly
   - Deploy again with safeguards

---

## Conclusion

This minimal enhancement approach:

✅ Leverages existing Find Best Agent infrastructure
✅ Requires only prompt updates (no code changes)
✅ Can be tested and iterated quickly
✅ Addresses core problem: inconsistent agent selection
✅ Provides foundation for future enhancements

**Next Step**: Update Sage's prompt and begin testing with real scenarios.

**Success Criteria**: Sage consistently selects the right agents, builds quality task graphs, and users rarely need to specify agents by name.

---

**Document Version**: 1.0
**Last Updated**: 2025-10-15
**Status**: Ready for Implementation
