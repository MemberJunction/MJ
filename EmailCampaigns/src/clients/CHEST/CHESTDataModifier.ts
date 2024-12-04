import { LogError, RunView, UserInfo } from "@memberjunction/core";
import { DataModifier } from "../../classes/DataModifier";
import { RegisterClass } from "@memberjunction/global";
import { MessageRecipient } from "@memberjunction/communication-types";
import { DataModifierParams } from "../../models/DataModifier.types";

@RegisterClass(DataModifier, 'CHESTDataModifier')
export class CHESTDataModifier extends DataModifier {
    public async GetMessageRecipient(data: DataModifierParams, currentUser?: UserInfo): Promise<MessageRecipient | null> {
        const rv: RunView = new RunView();

        let contextData: Record<string, any> = {
            Person: data.SourceRecord
        };

        if(data.LiveProductAttribute && data.LiveProductAttribute.length > 0){
            contextData.Product = data.LiveProductAttribute[0];

            const price: Record<string, number> = this.GetProductPrice(data.LiveProductAttribute[0], data.SourceRecord);
            if(price){
                contextData.Price = price;
            }
        }

        const messageRecipient: MessageRecipient = {
            To: data.SourceRecord.EMAIL,
            FullName: data.SourceRecord.FULL_NAME,
            ContextData: contextData
        };

        return messageRecipient;
    }

    public GetProductPrice(product: Record<string, any>, person: Record<string, any>): Record<string, number> {
        const price: Record<string, number> = {
            ListRate: 0,
            MemberRate: 0
        };

        switch(person.INDIVIDUAL_TYPE){
            case 'Physician':
                price.ListRate = product.PhysicianListRate;
                price.MemberRate = product.PhysicianMemberRate;
                break;
            case 'Medical Student':
                price.ListRate = product.MedicalStudentListRate;
                price.MemberRate = product.MedicalStudentMemberRate;
                break;
            case 'Fellow-in-Training':
                price.ListRate = product.FellowInTrainingListRate;
                price.MemberRate = product.FellowInTrainingMemberRate;
                break;
            case 'Non-Physician-in-Training':
                price.ListRate = product.NonPhysicianInTrainingListRate;
                price.MemberRate = product.NonPhysicianInTrainingMemberRate;
                break;
            case 'Non-physician Doctoral':
                price.ListRate = product.NonPhysicianInTrainingListRate;
                price.MemberRate = product.NonPhysicianInTrainingMemberRate;
                break;
            case 'Clinician - non-physician/non-doctoral':
                price.ListRate = product.ClinicianNonPhysicianListRate;
                price.MemberRate = product.ClinicianNonPhysicianMemberRate;
                break;
            case 'Retired':
                price.ListRate = product.RetiredListRate;
                price.MemberRate = product.RetiredMemberRate;
                break;
            case 'Resident':
                price.ListRate = product.ResidentListRate;
                price.MemberRate = product.ResidentMemberRate;
                break;
            case 'Intern':
                price.ListRate = product.InternListRate;
                price.MemberRate = product.InternMemberRate;
                break;
            default:
                console.log(`Error: Could not find price for individual type: ${person.INDIVIDUAL_TYPE}`);
                price.ListRate = 0;
                price.MemberRate = 0;
                break;
        }

        if(!price.ListRate || !price.MemberRate){
            console.log(`Error: Could not find price for individual type: ${person.INDIVIDUAL_TYPE} for ${person.EMAIL}`);
        }
        else{
            console.log(`Price for ${person.EMAIL}: List Rate: ${price.ListRate}, Member Rate: ${price.MemberRate}`);
        }

        return price;
    }
}

export function LoadCHESTDataModifier(): void {

}