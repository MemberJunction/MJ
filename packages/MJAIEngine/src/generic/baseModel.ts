export class BaseResult {
    success: boolean
    startTime: Date
    endTime: Date
    errorMessage: string
    exception: any
    get timeElapsed(): number {
        return this.endTime.getTime() - this.startTime.getTime();
    }
    constructor (success: boolean, startTime: Date, endTime: Date) {
        this.success = success;
        this.startTime = startTime;
        this.endTime = endTime;
    }
}

export class BaseParams {
    model: string
    systemPrompt: string
    userMessage: string
}

export class ModelUsage {
    constructor(promptTokens: number, completionTokens: number) {
        this.promptTokens = promptTokens;
        this.completionTokens = completionTokens;
    }
    promptTokens: number
    completionTokens: number
    get totalTokens(): number {
        return this.promptTokens + this.completionTokens;
    }
}

export abstract class BaseModel {
}

export abstract class BaseLLM extends BaseModel {
}

export abstract class BaseDiffusion extends BaseModel {
}
