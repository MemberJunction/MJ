import * as fs from 'fs';
import { BaseLLM } from "@memberjunction/ai";
import { PineconeDatabase } from "@memberjunction/ai-vectors-pinecone";
import { UserInfo, RunView } from "@memberjunction/core";

export class VectorSyncBase {
    _contextUser: UserInfo;
    _runView: RunView;

    _startTime: Date; 
    _endTime: Date;

    _pineconeDB: PineconeDatabase;
    _embedding: BaseLLM;
    _languageModel: BaseLLM;

    protected async timer(ms: number): Promise<unknown> {
        return new Promise(res => setTimeout(res, ms));
    }

    protected parseStringTemplate(str: string, obj: any): string {
        //Split string into non-argument textual parts
        let parts = str.split(/\$\{(?!\d)[\wæøåÆØÅ]*\}/);
    
        //Split string into property names. Empty array if match fails.
        let args = str.match(/[^{\}]+(?=})/g) || [];
    
        //Map parameters from obj by property name. Solution is limited by shallow one level mapping. 
        //Undefined values are substituted with an empty string, but other falsy values are accepted.
        let parameters = args.map(argument => obj[argument] || (obj[argument] === undefined ? "" : obj[argument]));
        return String.raw({ raw: parts }, ...parameters);
    }

    protected start(): void {
        this._startTime = new Date();
    }

    protected end(): void {
        this._endTime = new Date();
    }

    protected timeDiff(): number {
        let timeDiff = this._endTime.valueOf() - this._startTime.valueOf(); //in ms
        // strip the ms
        timeDiff /= 1000;
      
        // get seconds 
        var seconds = Math.round(timeDiff);
        return seconds;
    }

    protected saveJSONData(data: any, path: string): void {
        fs.writeFileSync(path, JSON.stringify(data, null, 2));
    }

    protected isEmpty(obj) {
        for (const prop in obj) {
          if (Object.hasOwn(obj, prop)) {
            return false;
          }
        }
      
        return true;
    }
}