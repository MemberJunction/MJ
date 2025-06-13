export type BaseAgentNextStep = {
    /**
     * This is sthe standardized step that will drive the behavior of the agent:
     * - 'success' indicates that the agent has completed its task successfully
     * - 'failed' indicates that the agent has failed to complete its task
     * - 'subagent' indicates that the agent should spawn a sub-agent to handle a specific task
     * - 'action' indicates that the agent should perform a specific action using the Actions framework
     */
    step: 'success' | 'failed' | 'subagent' | 'action';
    returnValue?: any;
}

/**
 * Agent Type is an abstraction that defines the basic operations of an agent. The concept is 
 * that we can have a wide array of different agents but the basic operation of the kind of agentic
 * process (e.g. a continual loop, a simple decision tree, etc) can be reused across any number
 * of agents easily simply by linking to the agent type desired. Each agent can of course
 * override the basic operations of the agent type if needed, but the agent type provides a
 * common set of functionality used by all agents of that type, by default.
 * 
 * Each agent type has a SystemPromptID that is designed to return a specific type of result
 * for example a "Loop" style of agent is designed to continually loop until the agent determines
 * that the objective requested has been completed
 *  
 */
export abstract class BaseAgentType {
    /**
     * Each sub-class of BaseAgentType implements this method to handle the logic for 
     * the output of a prompt execution. An individual agent can override handling of the
     * output by directly determining the next step in its own implementation.
     */
    public abstract DetermineNextStep(): Promise<BaseAgentNextStep>  
}