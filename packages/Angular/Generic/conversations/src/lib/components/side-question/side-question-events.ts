import { CancellableChatEventArgs } from '../../events/chat-events';

/** Cancelable pre-flight event emitted right before sending a side question turn. */
export class BeforeSideQuestionTurnEventArgs extends CancellableChatEventArgs {
    public readonly QuestionText: string;
    public readonly ParentConversationId: string;
    public readonly ParentBranchId: string | null;

    constructor(questionText: string, parentConversationId: string, parentBranchId: string | null) {
        super();
        this.QuestionText = questionText;
        this.ParentConversationId = parentConversationId;
        this.ParentBranchId = parentBranchId;
    }
}

/** Post-turn event emitted once a side question turn settles (completed, stopped, or errored). */
export class AfterSideQuestionTurnEventArgs {
    public readonly ParentConversationId: string;
    public readonly SideConversationId: string;
    public readonly UserDetailId: string;
    public readonly AgentDetailId: string | null;
    public readonly Success: boolean;

    constructor(
        parentConversationId: string,
        sideConversationId: string,
        userDetailId: string,
        agentDetailId: string | null,
        success: boolean
    ) {
        this.ParentConversationId = parentConversationId;
        this.SideConversationId = sideConversationId;
        this.UserDetailId = userDetailId;
        this.AgentDetailId = agentDetailId;
        this.Success = success;
    }
}
