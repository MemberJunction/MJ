import { Injectable } from '@angular/core';
import { CurrencyPipe, DecimalPipe  } from "@angular/common";
import { Metadata, RunView } from "@memberjunction/core";


@Injectable({
    providedIn: 'root'
})
export class SharedData {
    [key: string]: any; // Index signature

    private static _instance: SharedData;
    private _keyPrefix = "__ask_skip_SaaS_";
    private _updatedDateKeyBase = this._keyPrefix + "updatedDate";

    private loadStructure = [
        {
            datasetName: 'MJ_Metadata',
            entities: [
                {
                    entityName: 'Entities',
                    code: 'Entities'
                }
            ]
        }
    ]

    constructor(private currencyPipe: CurrencyPipe, private decimalPipe: DecimalPipe) {
        if (SharedData._instance) {
            return SharedData._instance;
        }
        else { 
            // first instance
            SharedData._instance = this;
            return this;// not needed but for clarity
        }
    }

    public async Refresh() {
        // get the data from the database, but check local storage first
        // first, check the database and see if anything has been updated. If any updates, we wipe out all our keys in the local storage to ensure that we load fresh data from the DB
        const md = new Metadata();
        for (let i = 0; i < this.loadStructure.length; i++) {
            // check each dataset for updates
            const dataset = this.loadStructure[i];
            const data = await md.GetAndCacheDatasetByName(dataset.datasetName);
            for (let j = 0; j < dataset.entities.length; j++) {
                const item = dataset.entities[j];
                const dItem = data.Results.find(d => d.EntityName === item.entityName)
                if (dItem)
                    this[item.code] = dItem.Results
            }
        }
    }   
}