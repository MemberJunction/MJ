import { RecordMetadata } from "@pinecone-database/pinecone";

export type Account = RecordMetadata & {
    ID: string;
    BCMID: string;
    Name: string;
    TaxID: string;
    Acronym: string;
    OperatingName: string;
    DisplayName: string;
    Description: string;
    AddressLine1: string;
    AddressLine2: string;
    AddressLine3: string;
    City: string;
    StateProvince: string;
    PostalCode: string;
    Country: string;
    ISOCountryCode: string;
    Domain: string;
    Website: string;
    EmailPattern: string;
    LogoURL: string;
    LeadershipPageURL: string;
    PhoneNumber: string;
    LinkedIn: string;
    Facebook: string;
    Logo: string;
    IndustryID: number;
    LastReviewedDate: Date;
    ActivityCount: number;
    LatestActivityDate: Date;
    EarliestActivityDate: Date;
    RecordSource: string;
    CreatedAt: Date;
    UpdatedAt: Date;
    LastEnrichedAt: Date;
    Industry: string;
    LatestTaxReturnID: number;
    Subsection: string;
    TaxYear: number;
    TaxMonth: number;
    TotalRevenue: number;
    ManagementFees: number;
    AccountingFees: number;
    LegalFees: number;
    AdvertisingExpense: number;
    InformationTechnologyExpense: number;
    TotalAssets: number;
    NumberEmployees: number;
    CustomerCount: number;
}