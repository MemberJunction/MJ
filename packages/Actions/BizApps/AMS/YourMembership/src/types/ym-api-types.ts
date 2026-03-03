/**
 * YourMembership API response wrapper.
 * YM returns data in named properties (e.g., Members, Events, MemberTypes),
 * so this is a generic record with the ResponseStatus check plus arbitrary data keys.
 */
export interface YMApiResponse {
    ResponseStatus?: {
        ErrorCode?: string;
        Message?: string;
    };
    [key: string]: unknown;
}

/**
 * YM Member record.
 */
export interface YMMember {
    ProfileID: string;
    FirstName: string;
    LastName: string;
    Email: string;
    Status: string;
    MemberTypeCode?: string;
    MemberSince?: string;
    ExpirationDate?: string;
    Phone?: string;
    Address1?: string;
    Address2?: string;
    City?: string;
    State?: string;
    PostalCode?: string;
    Country?: string;
    Company?: string;
    Title?: string;
}

/**
 * YM Event ID record (from EventIDs endpoint).
 * The EventIDs endpoint returns a list of event IDs — not full event details.
 */
export interface YMEvent {
    ID: number;
    [key: string]: unknown;
}

/**
 * YM Event Registration record.
 */
export interface YMEventRegistration {
    RegistrationID: string;
    EventID: string;
    ProfileID: string;
    Status: string;
    RegistrationDate?: string;
    AmountPaid?: number;
    AttendeeCount?: number;
}

/**
 * YM Donation record.
 */
export interface YMDonation {
    DonationID: string;
    ProfileID: string;
    Amount: number;
    Fund?: string;
    DonationDate?: string;
    PaymentMethod?: string;
    IsRecurring?: boolean;
    Notes?: string;
}

/**
 * YM Order Detail record (from StoreOrderDetails endpoint).
 */
export interface YMOrder {
    OrderID: string;
    InvoiceNumber?: string;
    DatePurchased?: string;
    OrderStatus?: string;
    MemberID?: string;
    Email?: string;
    [key: string]: unknown;
}

/**
 * YM Product record.
 */
export interface YMProduct {
    ProductID: string;
    Name: string;
    Price?: number;
    SalePrice?: number;
    SKU?: string;
    Description?: string;
    Category?: string;
    IsActive?: boolean;
    InventoryCount?: number;
}

/**
 * YM Group record.
 */
export interface YMGroup {
    GroupID: string;
    Name: string;
    Description?: string;
    MemberCount?: number;
    IsPublic?: boolean;
    GroupType?: string;
}

/**
 * YM Member Type record.
 */
export interface YMMemberType {
    TypeID: string;
    Name: string;
    Description?: string;
    DuesAmount?: number;
    DuesPeriod?: string;
    IsActive?: boolean;
}

/**
 * YM Membership record.
 */
export interface YMMembership {
    MembershipID: string;
    Name?: string;
    Price?: number;
    Duration?: string;
    BenefitsDescription?: string;
    IsActive?: boolean;
}
