import { Customer } from "./Types/Customer";
import { PineconeDatabse } from "./models/PineconeDatabase";
import { PineconeRecord } from "@pinecone-database/pinecone";
import { Account } from "./Types/Accounts";

const db = new PineconeDatabse();
db.getIndexDescription("sample-index").then(async (desc) => {
    
    const data = db.getCustomerJSONData();
    const accountData = db.getAccountJSONData();
    
    /*
    db.createEmbedding(g).then((e) => {
        console.log(e.data[0].embedding);
    });
    */
    
    //createIndexes(data);
    createAccountIndexes(accountData);
});


const createAccountIndexes = async(data: Account[]) => {
    const records: PineconeRecord<Account>[] = [];
    let count: number = 0;

    for(const customer of data){
        if(count >= 2){
            continue;
        }
        count++;

        const cleanAccount = cleanData(customer);
        const toString: string = JSON.stringify(cleanAccount);
        const embedding = await db.createEmbedding(toString);
        if(!embedding){
            continue;
        }

        const pineconeRecord: PineconeRecord<Account> = {
            id: cleanAccount.ID.toString(),
            values: embedding.data[0].embedding,
            metadata: cleanAccount
        }

        records.push(pineconeRecord);
        //await db.UpdateRecord(pineconeRecord);
        await timer(1000);
    }

    //console.log(records);
    db.UpsertRecords(records);
}

const createIndexes = async(data: Customer[]) => {
    const records: PineconeRecord<Customer>[] = [];
    let count: number = 0;

    for(const customer of data){
        if(count >= 2){
            continue;
        }
        count++;

        const cleanCustomer = cleanData(customer);
        const toString: string = JSON.stringify(cleanCustomer);
        const embedding = await db.createEmbedding(toString);
        if(!embedding){
            continue;
        }

        const pineconeRecord: PineconeRecord<Customer> = {
            id: cleanCustomer.ID.toString(),
            values: embedding.data[0].embedding,
            metadata: cleanCustomer
        }

        records.push(pineconeRecord);
        //await db.UpdateRecord(pineconeRecord);
        await timer(1000);
    }

    //console.log(records);
    db.UpsertRecords(records);
}

const timer = ms => new Promise(res => setTimeout(res, ms));

//pinecone doesnt accept null values, so strip those out
function cleanData<T>(data: T): T {
    for(const [key, value] of Object.entries(data)){
        if(!data[key] || data[key] === "NULL"){
            if(typeof data[key] === "number"){
                //pass
            }
            else{
                delete data[key];
            }
        }
    }

    console.log("data after clean: ", data);
    return data;
}
