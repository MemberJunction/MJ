import { BaseEntity, SimpleEmbeddingResult } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { ComponentEntityExtended } from "@memberjunction/core-entities";
import { EmbedTextLocalHelper } from "./util";

@RegisterClass(BaseEntity, 'MJ: Components')
export class ComponentEntityExtended_Server extends ComponentEntityExtended  {
    public async Save(): Promise<boolean> {
        await this.GenerateEmbeddingsByFieldName([
            { 
                fieldName: "FunctionalRequirements", 
                vectorFieldName: "FunctionalRequirementsVector", 
                modelFieldName: "FunctionalRequirementsVectorEmbeddingModelID" 
            },
            { 
                fieldName: "TechnicalDesign", 
                vectorFieldName: "TechnicalDesignVector", 
                modelFieldName: "TechnicalDesignVectorEmbeddingModelID" 
            }
        ]);
        const saveResult: boolean = await super.Save();
        return saveResult;
    }
 
    /**
     * Simple proxy to local helper method for embeddings. Needed for BaseEntity sub-classes that want to use embeddings built into BaseEntity
     * @param textToEmbed 
     * @returns 
     */
    protected override async EmbedTextLocal(textToEmbed: string): Promise<SimpleEmbeddingResult> {
        return EmbedTextLocalHelper(this, textToEmbed);
    }
}