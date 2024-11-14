import { RegisterClass } from "@memberjunction/global";
import { Message } from "@memberjunction/communication-types";
import { UserInfo } from "@memberjunction/core";

@RegisterClass(MessageBuilder, 'MessageBuilder')
export abstract class MessageBuilder {
    public abstract GetMessage(currentUser: UserInfo): Promise<Message>
}

export function LoadMessageBuilder(): void {
}