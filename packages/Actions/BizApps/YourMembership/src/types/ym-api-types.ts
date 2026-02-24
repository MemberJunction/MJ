/**
 * Standard YM API response wrapper.
 * All YM API endpoints return this structure.
 */
export interface YMApiResponse<T> {
    ResponseStatus: YMResponseStatus;
    Result: T;
}

export interface YMResponseStatus {
    ErrorCode: string | null;
    Message: string | null;
    StackTrace: string | null;
    Errors: YMResponseError[];
}

export interface YMResponseError {
    ErrorCode: string;
    FieldName: string;
    Message: string;
}

/**
 * Member record from YM API (GET /Ams/{ClientID}/MemberList)
 */
export interface YMMember {
    ProfileID: string;
    MasterProfileID: string;
    FirstName: string;
    LastName: string;
    Email: string;
    MemberTypeCode: string;
    MembershipExpires: string;
    Status: string;
    JoinDate: string;
    Company: string;
    Title: string;
    Phone: string;
    Address1: string;
    Address2: string;
    City: string;
    State: string;
    PostalCode: string;
    Country: string;
    WebsiteURL: string;
    LastUpdated: string;
}

/**
 * Event record from YM API (GET /Ams/{ClientID}/Events)
 */
export interface YMEvent {
    EventID: string;
    Name: string;
    Description: string;
    StartDate: string;
    EndDate: string;
    Location: string;
    Status: string;
    EventType: string;
    MaxAttendees: number;
    CurrentAttendees: number;
    Price: number;
    EarlyBirdPrice: number;
    CategoryID: string;
    CategoryName: string;
    IsPublished: boolean;
    RegistrationOpen: boolean;
    LastUpdated: string;
}

/**
 * Event registration from YM API (GET /Ams/{ClientID}/EventRegistrations)
 */
export interface YMEventRegistration {
    RegistrationID: string;
    EventID: string;
    ProfileID: string;
    FirstName: string;
    LastName: string;
    Email: string;
    RegistrationDate: string;
    Status: string;
    AmountPaid: number;
    RegistrationType: string;
    AttendeeType: string;
}

/**
 * Donation record from YM API (GET /Ams/{ClientID}/DonationHistory)
 */
export interface YMDonation {
    DonationID: string;
    ProfileID: string;
    Amount: number;
    DonationDate: string;
    Fund: string;
    Campaign: string;
    PaymentMethod: string;
    TransactionID: string;
    IsRecurring: boolean;
    Status: string;
}

/**
 * Order record from YM API (GET /Ams/{ClientID}/StoreOrders)
 */
export interface YMOrder {
    OrderID: string;
    ProfileID: string;
    OrderDate: string;
    TotalAmount: number;
    Status: string;
    ShippingMethod: string;
    ShippingAmount: number;
    TaxAmount: number;
    PaymentMethod: string;
    TransactionID: string;
}

/**
 * Product record from YM API (GET /Ams/{ClientID}/Products)
 */
export interface YMProduct {
    ProductID: string;
    Name: string;
    Description: string;
    Price: number;
    SalePrice: number;
    SKU: string;
    CategoryID: string;
    CategoryName: string;
    IsActive: boolean;
    StockQuantity: number;
    Weight: number;
    LastUpdated: string;
}

/**
 * Group record from YM API (GET /Ams/{ClientID}/Groups)
 */
export interface YMGroup {
    GroupID: string;
    Name: string;
    Description: string;
    GroupTypeID: string;
    GroupTypeName: string;
    MemberCount: number;
    IsPublic: boolean;
    Status: string;
    CreatedDate: string;
}

/**
 * Member type from YM API (GET /Ams/{ClientID}/MemberTypes)
 */
export interface YMMemberType {
    TypeID: string;
    Name: string;
    Description: string;
    IsActive: boolean;
    DuesAmount: number;
    DuesPeriod: string;
}

/**
 * Membership record from YM API (GET /Ams/{ClientID}/Memberships)
 */
export interface YMMembership {
    MembershipID: string;
    Name: string;
    Description: string;
    Price: number;
    Duration: string;
    IsActive: boolean;
    BenefitsDescription: string;
}
