import { BaseAgent, IAgentFactory, AgentDecisionInput, AgentDecisionResponse, ToolDescription, SubAgentDescription, ExecutionStep } from '../base-agent';
import { UserInfo } from '@memberjunction/core';

/**
 * Example demonstrations of the enhanced BaseAgent framework.
 * 
 * This file shows how the CONDUCTOR and DATA_GATHER agent examples from the requirements
 * would work with the new system prompt template and decision-driven approach.
 */
export class EnhancedAgentExamples {
  /**
   * Example: CONDUCTOR Agent
   * 
   * Template Name: "Skip::Conductor Template"  
   * Agent Name: "CONDUCTOR"
   * Description: "When messages come in, this is the first step: identifying the intent of the user..."
   * 
   * The agent template would contain the specific prompt instructions:
   * ```
   * Your name is Skip. You are an AI assistant who runs a team of AI data scientists, 
   * AI business analysts and AI data visualization experts. Your job is to coordinate 
   * work between those groups...
   * ```
   * 
   * With the enhanced system, this becomes:
   * 1. System prompt template provides the operational framework
   * 2. Agent-specific template is dynamically embedded
   * 3. Available tools and sub-agents are listed
   * 4. Decision-making loop determines next actions
   */
  static async CreateConductorExample(factory: IAgentFactory, contextUser?: UserInfo): Promise<BaseAgent | null> {
    // The agent would be created from database metadata
    return await factory.CreateAgent("CONDUCTOR", contextUser);
    
    // Usage example:
    // const result = await conductorAgent.Execute({
    //   data: { userMessage: "I need to analyze sales data and create a report" },
    //   conversationMessages: [
    //     { role: 'user', content: 'I need to analyze sales data and create a report' }
    //   ]
    // });
    // 
    // The enhanced system will:
    // 1. Use the system prompt template with CONDUCTOR-specific instructions
    // 2. List available sub-agents (DATA_GATHER, REPORT_GENERATOR, etc.)
    // 3. Make decisions about which sub-agents to invoke
    // 4. Coordinate execution based on decisions
    // 5. Continue until task completion
  }

  /**
   * Example: DATA_GATHER Agent  
   * 
   * Template Name: "Data Gather Template"
   * Agent Name: "DATA_GATHER"
   * Description: "Reducing a large list of possible entities down to only the ones that are relevant..."
   * 
   * The agent template would contain the specific instructions for data gathering,
   * entity evaluation, and SQL generation as shown in the example.
   * 
   * With the enhanced system:
   * 1. System prompt provides the framework
   * 2. Data gathering instructions are embedded
   * 3. Available tools (database queries, entity analyzers) are listed
   * 4. Decision loop determines which entities to query and how
   */
  static ExampleDataGatherDecisionFlow(): AgentDecisionResponse {
    // Example decision that DATA_GATHER agent might make using the new execution plan approach:
    return {
      decision: 'execute_tool',
      reasoning: 'Based on the user request for sales data analysis, I need to first identify relevant entities and then query the database for specific information. I\'ll execute entity analysis first, then use those results to generate optimized SQL queries.',
      executionPlan: [
        {
          type: 'tool',
          targetId: 'entity-analyzer',
          parameters: { 
            domain: 'sales',
            keywords: ['revenue', 'customers', 'products'],
            timeframe: 'last_quarter'
          },
          executionOrder: 1,
          allowParallel: true,
          description: 'Analyze domain entities to identify relevant data sources'
        },
        {
          type: 'tool', 
          targetId: 'sql-generator',
          parameters: {
            entities: ['Sales', 'Customers', 'Products'],
            aggregations: ['SUM', 'COUNT', 'AVG'],
            filters: { date_range: 'Q4_2024' }
          },
          executionOrder: 2,
          allowParallel: false,
          description: 'Generate optimized SQL queries based on entity analysis'
        },
        {
          type: 'tool',
          targetId: 'data-validator',
          parameters: {
            validateSchema: true,
            checkConstraints: true
          },
          executionOrder: 3,
          allowParallel: true,
          description: 'Validate data integrity and query results'
        }
      ],
      isTaskComplete: false,
      confidence: 0.85,
      metadata: {
        estimatedDuration: 15000,
        riskLevel: 'low',
        expectedOutcomes: ['entity_list', 'optimized_queries', 'validated_data'],
        alternatives: ['manual_entity_selection', 'predefined_query_templates'],
        failureStrategy: 'retry_with_fallback_queries'
      },
      nextEvaluationCriteria: ['Data quality assessment', 'Query performance metrics', 'Coverage completeness'],
      executionPriority: 'high'
    };
  }

  /**
   * Example of enhanced decision input that would be provided to agents
   */
  static CreateExampleDecisionInput(): AgentDecisionInput {
    return {
      messages: [
        { role: 'user', content: 'I need to analyze Q4 sales performance and create a comprehensive report' }
      ],
      availableTools: [
        {
          id: 'sql-generator',
          name: 'SQL Query Generator',
          description: 'Generates optimized SQL queries based on entity analysis',
          parameters: [
            { name: 'entities', type: 'string[]', description: 'Database entities to query', required: true },
            { name: 'aggregations', type: 'string[]', description: 'Aggregation functions', required: false },
            { name: 'filters', type: 'object', description: 'Query filters', required: false }
          ],
          supportsParallel: true,
          metadata: {
            estimatedDuration: 3000,
            reliability: 0.95,
            costLevel: 'low',
            categories: ['database', 'analysis']
          }
        },
        {
          id: 'report-generator',
          name: 'Report Generator',
          description: 'Creates formatted reports from analyzed data',
          parameters: [
            { name: 'data', type: 'object', description: 'Analyzed data to include', required: true },
            { name: 'format', type: 'string', description: 'Output format (PDF, HTML, etc.)', required: false }
          ],
          supportsParallel: false,
          metadata: {
            estimatedDuration: 8000,
            reliability: 0.92,
            costLevel: 'medium',
            categories: ['reporting', 'visualization']
          }
        }
      ],
      availableSubAgents: [
        {
          id: 'data-gather',
          name: 'Data Gather Agent',
          description: 'Reduces large lists of possible entities to relevant ones for analysis',
          supportsParallel: false,
          executionOrder: 1,
          metadata: {
            specializations: ['entity_analysis', 'sql_generation', 'data_filtering'],
            performanceRating: 0.92,
            expectedResponseTime: 8000,
            availabilityStatus: 'available',
            capabilities: ['stored_query_analysis', 'entity_relationship_mapping', 'query_optimization'],
            executionContext: 'Default execution order: 1. Mode: Sequential'
          }
        },
        {
          id: 'data-analyst',
          name: 'Data Analyst Agent',
          description: 'Specialized in statistical analysis and trend identification',
          supportsParallel: true,
          executionOrder: 2,
          metadata: {
            specializations: ['statistical_analysis', 'trend_detection', 'forecasting'],
            performanceRating: 0.88,
            expectedResponseTime: 12000,
            availabilityStatus: 'available',
            capabilities: ['regression_analysis', 'outlier_detection', 'correlation_analysis'],
            executionContext: 'Default execution order: 2. Mode: Parallel'
          }
        },
        {
          id: 'visualization-expert',
          name: 'Visualization Expert',
          description: 'Creates compelling charts and dashboards',
          supportsParallel: true,
          executionOrder: 3,
          metadata: {
            specializations: ['chart_creation', 'dashboard_design', 'interactive_visualizations'],
            performanceRating: 0.91,
            expectedResponseTime: 8000,
            availabilityStatus: 'available',
            capabilities: ['d3_charts', 'tableau_integration', 'custom_graphics'],
            executionContext: 'Default execution order: 3. Mode: Parallel'
          }
        },
        {
          id: 'report-generator',
          name: 'Report Generator Agent',
          description: 'Compiles analysis into comprehensive reports and presentations',
          supportsParallel: false,
          executionOrder: 4,
          metadata: {
            specializations: ['report_compilation', 'executive_summaries', 'presentation_design'],
            performanceRating: 0.89,
            expectedResponseTime: 15000,
            availabilityStatus: 'available',
            capabilities: ['pdf_generation', 'powerpoint_creation', 'interactive_reports'],
            executionContext: 'Default execution order: 4. Mode: Sequential'
          }
        }
      ],
      currentGoal: 'Analyze Q4 sales performance and create a comprehensive report',
      executionHistory: [],
      contextData: {
        userId: 'user123',
        requestedFormat: 'executive_summary',
        includeVisualizations: true
      },
      priority: 'high',
      timeConstraints: {
        maxDecisionTime: 5000,
        taskDeadline: new Date(Date.now() + 3600000), // 1 hour from now
        isTimeSensitive: true
      },
      executionPreferences: {
        preferParallel: true,
        maxParallelActions: 3,
        riskTolerance: 'moderate'
      }
    };
  }

  /**
   * Demonstrates how the enhanced system prompt template works with embedded agent prompts
   */
  static ExampleSystemPromptFlow(): string {
    return `
# Example Flow: CONDUCTOR Agent Decision Making

## 1. System Prompt Template (Enhanced)
The BaseAgent.SYSTEM_PROMPT_TEMPLATE provides:
- Agent name and description
- Embedded agent-specific instructions 
- Available tools and sub-agents list
- Decision-making framework
- Response format requirements

## 2. Agent-Specific Template Embedding
For CONDUCTOR agent with template "Skip::Conductor Template":

\`\`\`
{% if agentPrompt %}
The following are your specialized instructions:

Your name is Skip. You are an AI assistant who runs a team of AI data scientists, 
AI business analysts and AI data visualization experts. Your job is to coordinate 
work between those groups. You are currently analyzing a conversation between 
a business user seeking information from a data platform...

[Full CONDUCTOR prompt embedded here]
{% endif %}
\`\`\`

## 3. Enhanced Context
- Available tools: sql-generator, report-generator, entity-analyzer
- Available sub-agents: DATA_GATHER, REPORT_GENERATOR, VISUALIZATION_EXPERT
- Time constraints, priorities, execution preferences

## 4. Decision Loop
Agent makes JSON decisions like:
{
  "decision": "execute_subagent",
  "reasoning": "User needs data analysis. I should delegate to DATA_GATHER agent first.",
  "executionPlan": [
    {
      "type": "subagent", 
      "targetId": "DATA_GATHER",
      "parameters": {"query": "Q4 sales performance"},
      "executionOrder": 1,
      "allowParallel": false,
      "description": "Gather Q4 sales performance data"
    }
  ],
  "isTaskComplete": false,
  "confidence": 0.9
}

## 5. Continuous Loop
- Execute decided actions
- Collect results
- Ask "what should we do next?"
- Continue until task completion or clarification needed
`;
  }

  /**
   * Example template content that could be used for specific agents
   */
  static ExampleAgentTemplates = {
    conductor: `
Your name is Skip. You are an AI assistant who runs a team of AI data scientists, AI business analysts and AI data visualization experts. Your job is to coordinate work between those groups.

You are currently analyzing a conversation between a business user seeking information from a data platform and the various AIs on your team so you can understand how best to assign the work.

Your role is to determine the next step of the process. Your goal is to evaluate the information you have at your disposal and decide where to go to achieve the user's request.

You have a limited set of options based on available tools to get more information or to respond to the user directly. Consider:

CLARIFY - Use this for greetings, conversational responses, or when you need specific clarifications
DATAGATHER - Use this when you need additional or different data than what's currently available  
REPORT - Use this when you have sufficient data and can provide a response or visualization

You have a strong bias to move past the DATAGATHER step, so if there is anything that could potentially be used for visualization, choose REPORT.
`,

    dataGather: `
The user is asking a different AI agent to create a report for them. The other AI agent has asked us to gather data for them.

YOUR JOB: evaluate our current data and see if it can be used to meet our needs. If you have raw data you can do aggregations and other calculations against, just use that. Go back to the database for more when you need NEW data that is not included already.

You have two sources of data to consider when querying the database:
1. Stored Queries - predefined SQL statements created by expert DBAs
2. Entities - database entities with descriptions and examples

IMPORTANT: ONLY USE FIELDS SPECIFIED IN THESE ENTITIES, DO NOT USE ANY OTHER FIELDS

Look at the <EXISTING_DATA> section. If you see SQL that is relevant to this query, but const sampleData does not have any corresponding data, that means the SQL executed but retrieved no data. You need to iterate on that query to make it retrieve data.
`,

    reportGenerator: `
You are a report generation specialist. Your job is to take analyzed data and create comprehensive, well-formatted reports.

Consider the following when generating reports:
1. Structure the information logically with clear sections
2. Include executive summary for high-level insights  
3. Use appropriate visualizations to support the narrative
4. Provide actionable recommendations based on the data
5. Ensure the report format matches the requested output type

Available output formats: PDF, HTML, PowerPoint, Excel, JSON
Available visualization types: Charts, graphs, tables, dashboards, infographics

Always include metadata about data sources, analysis methods, and confidence levels in your reports.
`
  };
}

/**
 * Test scenarios demonstrating the enhanced agent framework
 */
export class AgentTestScenarios {
  /**
   * Scenario 1: Business Intelligence Request
   */
  static BusinessIntelligenceScenario = {
    userRequest: "I need to understand our Q4 performance compared to Q3, including revenue trends, top performing products, and customer acquisition metrics. Please create an executive dashboard.",
    
    expectedFlow: [
      "CONDUCTOR agent receives request",
      "CONDUCTOR decides to use DATA_GATHER sub-agent", 
      "DATA_GATHER identifies relevant entities (Sales, Products, Customers)",
      "DATA_GATHER executes SQL queries to retrieve data",
      "CONDUCTOR receives data and delegates to VISUALIZATION_EXPERT",
      "VISUALIZATION_EXPERT creates dashboard components",
      "CONDUCTOR aggregates results and provides final response"
    ],

    expectedDecisions: [
      { agent: "CONDUCTOR", decision: "execute_subagent", target: "DATA_GATHER" },
      { agent: "DATA_GATHER", decision: "execute_tool", target: "sql-generator" },
      { agent: "DATA_GATHER", decision: "complete_task", target: null },
      { agent: "CONDUCTOR", decision: "execute_subagent", target: "visualization-expert" },
      { agent: "CONDUCTOR", decision: "complete_task", target: null }
    ]
  };

  /**
   * Scenario 2: Clarification Required
   */
  static ClarificationScenario = {
    userRequest: "Show me the data",
    
    expectedFlow: [
      "CONDUCTOR agent receives vague request",
      "CONDUCTOR decides clarification is needed",
      "CONDUCTOR requests specific information about what data and format"
    ],

    expectedDecisions: [
      { agent: "CONDUCTOR", decision: "request_clarification", target: null }
    ]
  };

  /**
   * Scenario 3: AI-Driven Mixed Execution Order
   */
  static MixedExecutionOrderScenario = {
    userRequest: "I need current sales data, customer feedback analysis, and competitive market analysis for our board meeting tomorrow.",
    
    expectedFlow: [
      "CONDUCTOR agent decides on optimal execution strategy",
      "Order 1: Use data-gather tool to get baseline data",
      "Order 2: Execute data-analyst and feedback-analyzer sub-agents in parallel", 
      "Order 3: Use market-research tool while parallel agents complete",
      "Order 4: Execute report-generator sub-agent to compile results"
    ],

    aiDrivenDecision: {
      decision: 'execute_tool',
      reasoning: 'I need to gather baseline data first, then analyze it in parallel with feedback analysis, incorporate market research, and finally compile everything into a board-ready report.',
      executionPlan: [
        {
          type: 'tool',
          targetId: 'data-gather',
          parameters: { domain: 'sales', timeframe: 'current_quarter' },
          executionOrder: 1,
          allowParallel: false,
          description: 'Gather current sales data as foundation'
        },
        {
          type: 'subagent',
          targetId: 'data-analyst',
          parameters: { analysisType: 'sales_performance' },
          executionOrder: 2,
          allowParallel: true,
          description: 'Analyze sales data for trends and insights'
        },
        {
          type: 'subagent',
          targetId: 'feedback-analyzer',
          parameters: { sources: ['surveys', 'reviews', 'support_tickets'] },
          executionOrder: 2,
          allowParallel: true,
          description: 'Analyze customer feedback in parallel with sales analysis'
        },
        {
          type: 'tool',
          targetId: 'market-research',
          parameters: { competitors: ['company_a', 'company_b'], metrics: ['pricing', 'features'] },
          executionOrder: 3,
          allowParallel: false,
          description: 'Research competitive landscape'
        },
        {
          type: 'subagent',
          targetId: 'report-generator',
          parameters: { format: 'executive_summary', audience: 'board_of_directors' },
          executionOrder: 4,
          allowParallel: false,
          description: 'Compile all analysis into board-ready presentation'
        }
      ],
      isTaskComplete: false,
      confidence: 0.92
    }
  };

  /**
   * Scenario 4: Adaptive Decision Making
   */
  static AdaptiveDecisionScenario = {
    userRequest: "The quarterly report is due in 2 hours and I'm missing some key metrics.",
    
    expectedFlow: [
      "CONDUCTOR recognizes time constraint and adapts strategy",
      "Chooses parallel execution for speed over thoroughness",
      "Uses faster tools instead of comprehensive sub-agents",
      "Provides interim results with confidence levels"
    ],

    adaptiveDecision: {
      decision: 'execute_tool',
      reasoning: 'Given the 2-hour time constraint, I need to prioritize speed over comprehensive analysis. I\'ll run essential data gathering and metrics calculation in parallel, then provide a streamlined report.',
      executionPlan: [
        {
          type: 'tool',
          targetId: 'quick-metrics-calculator',
          parameters: { metrics: ['revenue', 'growth', 'customer_count'], mode: 'fast' },
          executionOrder: 1,
          allowParallel: true,
          description: 'Calculate essential metrics quickly'
        },
        {
          type: 'tool',
          targetId: 'trend-analyzer',
          parameters: { timeframe: 'quarter', depth: 'summary' },
          executionOrder: 1,
          allowParallel: true,
          description: 'Generate trend summaries in parallel'
        },
        {
          type: 'tool',
          targetId: 'report-formatter',
          parameters: { template: 'quarterly_brief', priority_sections: ['executive_summary', 'key_metrics'] },
          executionOrder: 2,
          allowParallel: false,
          description: 'Format into time-appropriate report'
        }
      ],
      isTaskComplete: false,
      confidence: 0.75,
      metadata: {
        riskLevel: 'medium',
        estimatedDuration: 7200000, // 2 hours in milliseconds
        alternatives: ['full_comprehensive_analysis', 'data_estimation_with_disclaimers'],
        failureStrategy: 'provide_partial_results_with_missing_data_notes'
      }
    }
  };

  /**
   * Demonstrates the evolution from deterministic to AI-driven approach
   */
  static ComparisonExample = {
    oldDeterministicApproach: {
      description: "Fixed sequence: Always DATA_GATHER → ANALYZE → VISUALIZE → REPORT",
      limitations: [
        "No adaptation to context or urgency",
        "Inefficient for simple requests",
        "Cannot handle parallel opportunities",
        "One-size-fits-all approach"
      ]
    },

    newAIDrivenApproach: {
      description: "Dynamic decisions based on context, constraints, and goals",
      advantages: [
        "Adapts to time constraints and priorities",
        "Optimizes execution order for efficiency",
        "Mixes tools and sub-agents strategically", 
        "Considers parallel vs sequential trade-offs",
        "Learns from execution history"
      ],
      
      exampleDecisions: [
        "Simple query: Skip complex analysis, go straight to visualization",
        "Urgent request: Use parallel execution with faster tools",
        "Complex analysis: Full sequential workflow with comprehensive sub-agents",
        "Partial data: Mix estimation tools with available data processing"
      ]
    }
  };
}