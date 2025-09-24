import { AutotagBaseEngine } from '../../Engine';
export class AutotagBase {
    engine;
    constructor() {
        this.engine = AutotagBaseEngine.Instance;
    }
    /**
     * Processing phase: Apply LLM processing to a single ContentItem
     * This method is generic and can be used by all subclasses
     * @param contentItem - ContentItem to process with LLM
     * @param contextUser - User context
     */
    async TagSingleContentItem(contentItem, contextUser) {
        const contentItems = [contentItem];
        await this.engine.ExtractTextAndProcessWithLLM(contentItems, contextUser);
    }
}
//# sourceMappingURL=AutotagBase.js.map