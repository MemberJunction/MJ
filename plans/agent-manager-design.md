# Agent Manager Design

Top level is:
- Loop Agent
- Orchestrates calling sub-agents

## Sub-Agents

### Requirements Analyst
- Loop Agent
- This agent is an expert in business and agent design and is to talk to the user about their goals and biz needs and ultimately come up with a very detailed requirements definition that goes into the AgentSpec
- This agent is responsible for populating the `RequirementsDefinition` property of the AgentSpec
- Uses a **lot** of `Chat` to confirm with the user what they want. 
- Prompt teaches user to review and gives `suggestedResponses` to provide nice UX

### Designer 
- Loop Agent
- This agent takes the `RequirementsDefinition` and is responsible for writing a detailed `DetailedDesign` section of the AgentSpec. 
- Can chat with the user, but generally should not need to because the requirements are very detailed. 

### Architect
- Loop Agent
- This agent is responsible for completely populating the `AgentSpec` including all of the properties and the arrays of sub-agents, actions, etc.
- Architect generates the prompt for each Agent/Sub-Agent
- Custom sub-class
  - subclass will override the `validateSuccessStep` method to ensure the spec is correct


### Builder
- Code-based agent - not loop, not flow - purely code
- This agent is like the Code Generator agent in Skip, and is purely code that takes the AgentSpec and uses the 
- Here you are doing `StartingPayloadValidation` override to ensure key parts there 
- Main work is in override of `executeAgentInternal` 
- This code will be pretty simple, you are just calling the `AgentSpecSync` class which does the bulk of the work
- AgentSpecSync has **NOT** been tested