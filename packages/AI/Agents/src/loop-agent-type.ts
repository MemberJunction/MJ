import { AIPromptRunResult } from "@memberjunction/ai-prompts";
import { BaseAgentType } from "./base-agent-type";
import { BaseAgentNextStep } from "./types";
import { RegisterClass } from "@memberjunction/global";

export type LoopAgentTypeResult = {
    step: "success" | "failed" | "retry" | "action" | "sub-agent";
}

@RegisterClass(BaseAgentType, "LoopAgentType")
export class LoopAgentType extends BaseAgentType {
    public async DetermineNextStep(promptResult: AIPromptRunResult): Promise<BaseAgentNextStep> {
        // for this loop agent type we are doing one of the following things:
        // 1. We are returning a result that is the final result of the loop
        // 2. Executing a sub-agent synchronously
        // 3. Executing one or more actions(e.g. tools/function calls in the LLM's mind) in parallel

        const result = promptResult.result as LoopAgentTypeResult;
        if (!result || typeof result.step !== "string") {
            throw new Error("Invalid result format from prompt execution. Expected an object with a 'step' property.");
        }
        if (result.step === "success") {
            return {
                step: "success",
                returnValue: promptResult.result
            };
        }
        else if (result.step === "failed") {
            return {
                step: "failed",
                returnValue: promptResult.result
            };
        }
        else if (result.step === "retry") {
            return {
                step: "retry",
                returnValue: promptResult.result
            };
        }
        else if (result.step === "action") {
            return {
                step: "action",
                returnValue: promptResult.result
            };
        }
        else if (result.step === "sub-agent") { 
            return {
                step: "sub-agent",
                returnValue: promptResult.result
            };
        }
        else {
            throw new Error(`Unknown step type: ${result.step}`);
        }
    }
}