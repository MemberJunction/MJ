/* ============================================================
   Sample Travel Agency / Booking System Database
   Schema: sample_travel

   Tables: Destination, Hotel, TourPackage, Customer, Booking,
           BookingItem, Payment, Review
   Views:  vwBookingSummary, vwDestinationRevenue,
           vwCustomerLifetimeValue, vwHotelPerformance
   ============================================================ */

USE SampleTravel;
GO

-- Create the schema for Travel operations
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'sample_travel')
    EXEC('CREATE SCHEMA sample_travel');
GO

/* ============================================================
   Table: Destination
   Travel destinations with region and climate info
   ============================================================ */
CREATE TABLE sample_travel.Destination (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Country NVARCHAR(100) NOT NULL,
    Region NVARCHAR(100) NULL,
    Description NVARCHAR(MAX) NOT NULL,
    Climate VARCHAR(20) NOT NULL DEFAULT 'Temperate',
    Latitude DECIMAL(9,6) NULL,
    Longitude DECIMAL(9,6) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    PopularityScore SMALLINT NOT NULL DEFAULT 50,
    CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Destination PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT CK_Destination_Climate CHECK (Climate IN ('Tropical', 'Arid', 'Temperate', 'Continental', 'Polar', 'Mediterranean')),
    CONSTRAINT CK_Destination_Popularity CHECK (PopularityScore >= 0 AND PopularityScore <= 100)
);
GO

/* ============================================================
   Table: Hotel
   Accommodations linked to destinations with star ratings
   ============================================================ */
CREATE TABLE sample_travel.Hotel (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    DestinationID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    Address NVARCHAR(400) NOT NULL,
    StarRating SMALLINT NOT NULL DEFAULT 3,
    PricePerNight DECIMAL(10,2) NOT NULL,
    TotalRooms INT NOT NULL,
    HasPool BIT NOT NULL DEFAULT 0,
    HasSpa BIT NOT NULL DEFAULT 0,
    CheckInTime TIME NOT NULL DEFAULT '15:00:00',
    CheckOutTime TIME NOT NULL DEFAULT '11:00:00',
    ContactEmail NVARCHAR(255) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Hotel PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT FK_Hotel_Destination FOREIGN KEY (DestinationID) REFERENCES sample_travel.Destination(ID),
    CONSTRAINT CK_Hotel_StarRating CHECK (StarRating >= 1 AND StarRating <= 5),
    CONSTRAINT CK_Hotel_PricePerNight CHECK (PricePerNight > 0),
    CONSTRAINT CK_Hotel_TotalRooms CHECK (TotalRooms > 0)
);
GO

-- Table: TourPackage - Curated travel experiences
CREATE TABLE sample_travel.TourPackage (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    DestinationID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(250) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    DurationDays INT NOT NULL,
    BasePrice DECIMAL(10,2) NOT NULL,
    MaxGroupSize INT NOT NULL DEFAULT 20,
    DifficultyLevel VARCHAR(15) NOT NULL DEFAULT 'Moderate',
    IncludesHotel BIT NOT NULL DEFAULT 1,
    IncludesMeals BIT NOT NULL DEFAULT 0,
    StartDate DATE NULL,
    EndDate DATE NULL,
    IsAvailable BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_TourPackage PRIMARY KEY (ID),
    CONSTRAINT FK_TourPackage_Destination FOREIGN KEY (DestinationID) REFERENCES sample_travel.Destination(ID),
    CONSTRAINT CK_TourPackage_Duration CHECK (DurationDays >= 1 AND DurationDays <= 90),
    CONSTRAINT CK_TourPackage_BasePrice CHECK (BasePrice > 0),
    CONSTRAINT CK_TourPackage_Difficulty CHECK (DifficultyLevel IN ('Easy', 'Moderate', 'Challenging', 'Extreme'))
);
GO

/* ============================================================
   Table: Customer
   Registered travelers with loyalty tiers
   ============================================================ */
CREATE TABLE sample_travel.Customer (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName NVARCHAR(100) NOT NULL,
    LastName NVARCHAR(100) NOT NULL,
    Email NVARCHAR(255) NOT NULL,
    Phone VARCHAR(20) NULL,
    DateOfBirth DATE NULL,
    PassportNumber VARCHAR(30) NULL,
    Nationality NVARCHAR(80) NULL,
    LoyaltyTier VARCHAR(15) NOT NULL DEFAULT 'Bronze',
    LoyaltyPoints INT NOT NULL DEFAULT 0,
    IsActive BIT NOT NULL DEFAULT 1,
    Notes NVARCHAR(MAX) NULL,
    RegisteredAt DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_Customer PRIMARY KEY (ID),
    CONSTRAINT UQ_Customer_Email UNIQUE (Email),
    CONSTRAINT CK_Customer_LoyaltyTier CHECK (LoyaltyTier IN ('Bronze', 'Silver', 'Gold', 'Platinum')),
    CONSTRAINT CK_Customer_LoyaltyPoints CHECK (LoyaltyPoints >= 0)
);
GO

/* Table: Booking - Trip reservations by customers */
CREATE TABLE sample_travel.Booking (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CustomerID UNIQUEIDENTIFIER NOT NULL,
    DestinationID UNIQUEIDENTIFIER NOT NULL,
    BookingDate DATETIME NOT NULL DEFAULT GETUTCDATE(),
    TravelStartDate DATE NOT NULL,
    TravelEndDate DATE NOT NULL,
    NumAdults SMALLINT NOT NULL DEFAULT 1,
    NumChildren SMALLINT NOT NULL DEFAULT 0,
    TotalAmount DECIMAL(12,2) NOT NULL,
    DiscountPercent DECIMAL(5,2) NOT NULL DEFAULT 0,
    Status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    SpecialRequests NVARCHAR(MAX) NULL,
    CONSTRAINT PK_Booking PRIMARY KEY CLUSTERED (ID),
    CONSTRAINT FK_Booking_Customer FOREIGN KEY (CustomerID) REFERENCES sample_travel.Customer(ID),
    CONSTRAINT FK_Booking_Destination FOREIGN KEY (DestinationID) REFERENCES sample_travel.Destination(ID),
    CONSTRAINT CK_Booking_Status CHECK (Status IN ('Pending', 'Confirmed', 'Cancelled', 'Completed', 'Refunded')),
    CONSTRAINT CK_Booking_TotalAmount CHECK (TotalAmount >= 0),
    CONSTRAINT CK_Booking_NumAdults CHECK (NumAdults >= 1),
    CONSTRAINT CK_Booking_NumChildren CHECK (NumChildren >= 0),
    CONSTRAINT CK_Booking_DiscountPercent CHECK (DiscountPercent >= 0 AND DiscountPercent <= 100)
);
GO

/* ============================================================
   Table: BookingItem
   Line items within a booking (hotel stays, tour packages)
   ============================================================ */
CREATE TABLE sample_travel.BookingItem (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    BookingID UNIQUEIDENTIFIER NOT NULL,
    HotelID UNIQUEIDENTIFIER NULL,
    TourPackageID UNIQUEIDENTIFIER NULL,
    ItemType VARCHAR(15) NOT NULL,
    CheckInDate DATE NULL,
    CheckOutDate DATE NULL,
    Quantity INT NOT NULL DEFAULT 1,
    UnitPrice DECIMAL(10,2) NOT NULL,
    LineTotal DECIMAL(12,2) NOT NULL,
    Notes NVARCHAR(500) NULL,
    CONSTRAINT PK_BookingItem PRIMARY KEY (ID),
    CONSTRAINT FK_BookingItem_Booking FOREIGN KEY (BookingID) REFERENCES sample_travel.Booking(ID),
    CONSTRAINT FK_BookingItem_Hotel FOREIGN KEY (HotelID) REFERENCES sample_travel.Hotel(ID),
    CONSTRAINT FK_BookingItem_TourPackage FOREIGN KEY (TourPackageID) REFERENCES sample_travel.TourPackage(ID),
    CONSTRAINT CK_BookingItem_ItemType CHECK (ItemType IN ('Hotel', 'Tour', 'Transfer', 'Insurance')),
    CONSTRAINT CK_BookingItem_Quantity CHECK (Quantity >= 1),
    CONSTRAINT CK_BookingItem_UnitPrice CHECK (UnitPrice >= 0),
    CONSTRAINT CK_BookingItem_LineTotal CHECK (LineTotal >= 0)
);
GO

-- Table: Payment - Financial transactions for bookings
CREATE TABLE sample_travel.Payment (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    BookingID UNIQUEIDENTIFIER NOT NULL,
    PaymentDate DATETIME NOT NULL DEFAULT GETUTCDATE(),
    Amount DECIMAL(10,2) NOT NULL,
    PaymentMethod VARCHAR(20) NOT NULL,
    TransactionRef VARCHAR(50) NOT NULL,
    Status VARCHAR(15) NOT NULL DEFAULT 'Pending',
    IsRefund BIT NOT NULL DEFAULT 0,
    ProcessedAt DATETIME NULL,
    CONSTRAINT PK_Payment PRIMARY KEY (ID),
    CONSTRAINT FK_Payment_Booking FOREIGN KEY (BookingID) REFERENCES sample_travel.Booking(ID),
    CONSTRAINT UQ_Payment_TransactionRef UNIQUE (TransactionRef),
    CONSTRAINT CK_Payment_Amount CHECK (Amount > 0),
    CONSTRAINT CK_Payment_Method CHECK (PaymentMethod IN ('CreditCard', 'DebitCard', 'BankTransfer', 'PayPal', 'Cash')),
    CONSTRAINT CK_Payment_Status CHECK (Status IN ('Pending', 'Completed', 'Failed', 'Refunded'))
);
GO

/* ============================================================
   Table: Review
   Customer feedback on destinations and hotels
   ============================================================ */
CREATE TABLE sample_travel.Review (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CustomerID UNIQUEIDENTIFIER NOT NULL,
    BookingID UNIQUEIDENTIFIER NOT NULL,
    DestinationID UNIQUEIDENTIFIER NOT NULL,
    HotelID UNIQUEIDENTIFIER NULL,
    Rating SMALLINT NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    ReviewText NVARCHAR(MAX) NULL,
    IsVerified BIT NOT NULL DEFAULT 0,
    IsPublished BIT NOT NULL DEFAULT 1,
    ReviewDate DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Review PRIMARY KEY (ID),
    CONSTRAINT FK_Review_Customer FOREIGN KEY (CustomerID) REFERENCES sample_travel.Customer(ID),
    CONSTRAINT FK_Review_Booking FOREIGN KEY (BookingID) REFERENCES sample_travel.Booking(ID),
    CONSTRAINT FK_Review_Destination FOREIGN KEY (DestinationID) REFERENCES sample_travel.Destination(ID),
    CONSTRAINT FK_Review_Hotel FOREIGN KEY (HotelID) REFERENCES sample_travel.Hotel(ID),
    CONSTRAINT CK_Review_Rating CHECK (Rating >= 1 AND Rating <= 5)
);
GO

/* ============================================================
   Filtered Unique Indexes
   ============================================================ */
-- Unique passport number for customers who have one
CREATE UNIQUE INDEX UQ_Customer_Passport ON sample_travel.Customer (PassportNumber) WHERE PassportNumber IS NOT NULL;
GO

-- One review per customer per booking
CREATE UNIQUE INDEX UQ_Review_CustomerBooking ON sample_travel.Review (CustomerID, BookingID) WHERE IsPublished = 1;
GO

/* ============================================================
   ALTER TABLE CHECK Constraints (separate from CREATE TABLE)
   ============================================================ */
ALTER TABLE sample_travel.Booking
    ADD CONSTRAINT CK_Booking_DateRange CHECK (TravelEndDate >= TravelStartDate);
GO

ALTER TABLE sample_travel.BookingItem
    ADD CONSTRAINT CK_BookingItem_DateRange CHECK (CheckOutDate >= CheckInDate);
GO

ALTER TABLE sample_travel.TourPackage
    ADD CONSTRAINT CK_TourPackage_DateRange CHECK (EndDate >= StartDate);
GO

ALTER TABLE sample_travel.Hotel
    ADD CONSTRAINT CK_Hotel_EmailLen CHECK (LEN(ContactEmail) >= 5);
GO

/* ============================================================
   Extended Properties for Documentation
   ============================================================ */
-- Destination table and key columns
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Travel destinations with region and climate information', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Destination';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier for the destination', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Destination', @level2type = N'COLUMN', @level2name = N'ID';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Climate type: Tropical, Arid, Temperate, Continental, Polar, or Mediterranean', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Destination', @level2type = N'COLUMN', @level2name = N'Climate';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Popularity score from 0 to 100 based on bookings and reviews', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Destination', @level2type = N'COLUMN', @level2name = N'PopularityScore';
GO

-- Hotel table and key columns
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Accommodation options linked to travel destinations', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Hotel';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Star rating from 1 to 5', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Hotel', @level2type = N'COLUMN', @level2name = N'StarRating';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Nightly room rate in local currency', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Hotel', @level2type = N'COLUMN', @level2name = N'PricePerNight';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Default guest check-in time', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Hotel', @level2type = N'COLUMN', @level2name = N'CheckInTime';
GO

-- TourPackage table
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Curated travel experiences and guided tours', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'TourPackage';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Tour duration in days', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'TourPackage', @level2type = N'COLUMN', @level2name = N'DurationDays';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Physical difficulty: Easy, Moderate, Challenging, or Extreme', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'TourPackage', @level2type = N'COLUMN', @level2name = N'DifficultyLevel';
GO

-- Customer table
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Registered travelers with loyalty program information', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Customer';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Loyalty tier: Bronze, Silver, Gold, or Platinum', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Customer', @level2type = N'COLUMN', @level2name = N'LoyaltyTier';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Accumulated loyalty reward points', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Customer', @level2type = N'COLUMN', @level2name = N'LoyaltyPoints';
GO

-- Booking table
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Trip reservations made by customers', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Booking';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Booking status: Pending, Confirmed, Cancelled, Completed, or Refunded', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Booking', @level2type = N'COLUMN', @level2name = N'Status';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Discount percentage applied to the booking total', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Booking', @level2type = N'COLUMN', @level2name = N'DiscountPercent';
GO

-- BookingItem table
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Individual line items within a booking', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'BookingItem';
GO

-- Payment table
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Financial transactions for trip bookings', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Payment';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique transaction reference from payment processor', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Payment', @level2type = N'COLUMN', @level2name = N'TransactionRef';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether this payment is a refund transaction', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Payment', @level2type = N'COLUMN', @level2name = N'IsRefund';
GO

-- Review table
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Customer feedback and ratings for destinations and hotels', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Review';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Rating from 1 (poor) to 5 (excellent)', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Review', @level2type = N'COLUMN', @level2name = N'Rating';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether the review has been verified against a real booking', @level0type = N'SCHEMA', @level0name = N'sample_travel', @level1type = N'TABLE', @level1name = N'Review', @level2type = N'COLUMN', @level2name = N'IsVerified';
GO

/* ============================================================
   Views
   ============================================================ */

/* View: vwBookingSummary
   Booking details with customer info, destination, trip duration, and payment status */
CREATE VIEW sample_travel.vwBookingSummary AS
SELECT
    b.ID AS BookingID,
    c.FirstName,
    c.LastName,
    c.Email,
    c.LoyaltyTier,
    d.Name AS DestinationName,
    d.Country,
    b.BookingDate,
    b.TravelStartDate,
    b.TravelEndDate,
    /* Trip duration in days using DATEDIFF */
    DATEDIFF(DAY, b.TravelStartDate, b.TravelEndDate) AS TripDurationDays,
    b.NumAdults,
    b.NumChildren,
    b.NumAdults + b.NumChildren AS TotalTravelers,
    b.TotalAmount,
    b.DiscountPercent,
    /* Discounted total using numeric calculation */
    ROUND(b.TotalAmount * (1 - b.DiscountPercent / 100.0), 2) AS FinalAmount,
    b.Status AS BookingStatus,
    /* Payment totals */
    ISNULL(SUM(CASE WHEN p.IsRefund = 0 THEN p.Amount ELSE 0 END), 0) AS TotalPaid,
    ISNULL(SUM(CASE WHEN p.IsRefund = 1 THEN p.Amount ELSE 0 END), 0) AS TotalRefunded,
    COUNT(p.ID) AS PaymentCount,
    /* Outstanding balance */
    ROUND(b.TotalAmount * (1 - b.DiscountPercent / 100.0), 2)
        - ISNULL(SUM(CASE WHEN p.IsRefund = 0 THEN p.Amount ELSE 0 END), 0)
        + ISNULL(SUM(CASE WHEN p.IsRefund = 1 THEN p.Amount ELSE 0 END), 0) AS BalanceDue,
    /* Months until travel using DATEDIFF */
    IIF(b.TravelStartDate > CAST(GETUTCDATE() AS DATE),
        DATEDIFF(MONTH, CAST(GETUTCDATE() AS DATE), b.TravelStartDate),
        0) AS MonthsUntilTravel
FROM sample_travel.Booking b
LEFT JOIN sample_travel.Customer c ON c.ID = b.CustomerID
LEFT JOIN sample_travel.Destination d ON d.ID = b.DestinationID
LEFT JOIN sample_travel.Payment p ON p.BookingID = b.ID
GROUP BY b.ID, c.FirstName, c.LastName, c.Email, c.LoyaltyTier,
         d.Name, d.Country, b.BookingDate, b.TravelStartDate, b.TravelEndDate,
         b.NumAdults, b.NumChildren, b.TotalAmount, b.DiscountPercent, b.Status;
GO

/* View: vwDestinationRevenue
   Revenue analytics per destination with booking counts and averages */
CREATE VIEW sample_travel.vwDestinationRevenue AS
SELECT
    d.ID AS DestinationID,
    d.Name AS DestinationName,
    d.Country,
    d.Climate,
    d.PopularityScore,
    COUNT(DISTINCT b.ID) AS TotalBookings,
    COUNT(DISTINCT b.CustomerID) AS UniqueCustomers,
    COALESCE(SUM(b.TotalAmount), 0) AS GrossRevenue,
    /* Average booking value */
    ROUND(COALESCE(AVG(b.TotalAmount), 0), 2) AS AvgBookingValue,
    /* Average trip duration using DATEDIFF inside AVG */
    ROUND(AVG(CAST(DATEDIFF(DAY, b.TravelStartDate, b.TravelEndDate) AS DECIMAL(10,2))), 1) AS AvgTripDays,
    /* Revenue by booking status using CASE WHEN */
    COALESCE(SUM(CASE WHEN b.Status = 'Completed' THEN b.TotalAmount ELSE 0 END), 0) AS CompletedRevenue,
    COALESCE(SUM(CASE WHEN b.Status = 'Confirmed' THEN b.TotalAmount ELSE 0 END), 0) AS PendingRevenue,
    COALESCE(SUM(CASE WHEN b.Status = 'Cancelled' THEN b.TotalAmount ELSE 0 END), 0) AS CancelledRevenue,
    /* Review metrics using subquery-free aggregation */
    ISNULL(AVG(CAST(r.Rating AS DECIMAL(3,1))), 0) AS AvgRating,
    COUNT(DISTINCT r.ID) AS ReviewCount,
    /* Bookings this year using YEAR */
    COUNT(DISTINCT CASE WHEN YEAR(b.BookingDate) = YEAR(GETUTCDATE()) THEN b.ID END) AS BookingsThisYear
FROM sample_travel.Destination d
LEFT JOIN sample_travel.Booking b ON b.DestinationID = d.ID
LEFT JOIN sample_travel.Review r ON r.DestinationID = d.ID AND r.IsPublished = 1
GROUP BY d.ID, d.Name, d.Country, d.Climate, d.PopularityScore;
GO

-- View: vwCustomerLifetimeValue
-- Customer analytics with total spend, trip count, and loyalty tier info
CREATE VIEW sample_travel.vwCustomerLifetimeValue AS
SELECT
    c.ID AS CustomerID,
    c.FirstName,
    c.LastName,
    c.Email,
    c.LoyaltyTier,
    c.LoyaltyPoints,
    COALESCE(COUNT(DISTINCT b.ID), 0) AS TotalBookings,
    COALESCE(SUM(b.TotalAmount), 0) AS LifetimeSpend,
    /* Average spend per trip */
    ROUND(ISNULL(AVG(b.TotalAmount), 0), 2) AS AvgSpendPerTrip,
    /* Total travel days across all trips using DATEDIFF */
    COALESCE(SUM(DATEDIFF(DAY, b.TravelStartDate, b.TravelEndDate)), 0) AS TotalTravelDays,
    /* Customer tenure in months using DATEDIFF */
    DATEDIFF(MONTH, c.RegisteredAt, GETUTCDATE()) AS TenureMonths,
    /* Average rating given by this customer */
    ISNULL(AVG(CAST(r.Rating AS DECIMAL(3,1))), 0) AS AvgRatingGiven,
    COUNT(DISTINCT r.ID) AS ReviewsWritten,
    /* Distinct destinations visited */
    COUNT(DISTINCT b.DestinationID) AS DestinationsVisited,
    /* Most recent booking date */
    MAX(b.BookingDate) AS LastBookingDate,
    /* Completed trip count using IIF inside COUNT */
    COUNT(CASE WHEN b.Status = 'Completed' THEN 1 END) AS CompletedTrips,
    /* Year registered using YEAR */
    YEAR(c.RegisteredAt) AS RegistrationYear,
    MONTH(c.RegisteredAt) AS RegistrationMonth
FROM sample_travel.Customer c
LEFT JOIN sample_travel.Booking b ON b.CustomerID = c.ID
LEFT JOIN sample_travel.Review r ON r.CustomerID = c.ID
GROUP BY c.ID, c.FirstName, c.LastName, c.Email, c.LoyaltyTier, c.LoyaltyPoints, c.RegisteredAt;
GO

/* View: vwHotelPerformance
   Hotel performance metrics with occupancy estimates and revenue, filtered by HAVING */
CREATE VIEW sample_travel.vwHotelPerformance AS
SELECT
    h.ID AS HotelID,
    h.Name AS HotelName,
    d.Name AS DestinationName,
    h.StarRating,
    h.PricePerNight,
    h.TotalRooms,
    IIF(h.HasPool = 1, 'Yes', 'No') AS PoolAvailable,
    IIF(h.HasSpa = 1, 'Yes', 'No') AS SpaAvailable,
    COUNT(DISTINCT bi.ID) AS TotalStays,
    /* Total room nights booked using DATEDIFF on booking items */
    COALESCE(SUM(DATEDIFF(DAY, bi.CheckInDate, bi.CheckOutDate)), 0) AS TotalNightsBooked,
    /* Revenue from hotel stays */
    COALESCE(SUM(bi.LineTotal), 0) AS TotalHotelRevenue,
    /* Average nightly revenue */
    ROUND(ISNULL(AVG(bi.UnitPrice), 0), 2) AS AvgNightlyRate,
    /* Average length of stay in days */
    ROUND(AVG(CAST(DATEDIFF(DAY, bi.CheckInDate, bi.CheckOutDate) AS DECIMAL(6,1))), 1) AS AvgStayDays,
    /* Average review rating for this hotel */
    ISNULL(AVG(CAST(rv.Rating AS DECIMAL(3,1))), 0) AS AvgHotelRating,
    COUNT(DISTINCT rv.ID) AS HotelReviewCount,
    /* Days since last booking using DATEDIFF */
    COALESCE(DATEDIFF(DAY, MAX(bi.CheckInDate), CAST(GETUTCDATE() AS DATE)), 999) AS DaysSinceLastBooking
FROM sample_travel.Hotel h
LEFT JOIN sample_travel.Destination d ON d.ID = h.DestinationID
LEFT JOIN sample_travel.BookingItem bi ON bi.HotelID = h.ID AND bi.ItemType = 'Hotel'
LEFT JOIN sample_travel.Review rv ON rv.HotelID = h.ID AND rv.IsPublished = 1
GROUP BY h.ID, h.Name, d.Name, h.StarRating, h.PricePerNight, h.TotalRooms, h.HasPool, h.HasSpa
HAVING COUNT(bi.ID) > 0 OR COUNT(rv.ID) > 0;
GO

/* ============================================================
   Security: Create Role and Grant Permissions
   ============================================================ */
CREATE ROLE [TravelAgent];
GO

GRANT SELECT ON SCHEMA::sample_travel TO [TravelAgent];
GO

/* ============================================================
   Sample Data: Destinations (8)
   ============================================================ */
INSERT INTO sample_travel.Destination (ID, Name, Country, Region, Description, Climate, Latitude, Longitude, IsActive, PopularityScore)
VALUES
    ('D1000001-0001-0001-0001-000000000001', N'Bali Paradise', N'Indonesia', N'Southeast Asia', N'Tropical island known for its forested volcanic mountains, iconic rice paddies, beaches, and coral reefs.', 'Tropical', -8.340539, 115.091949, 1, 92),
    ('D1000001-0001-0001-0001-000000000002', N'Swiss Alps Adventure', N'Switzerland', N'Central Europe', N'Breathtaking mountain scenery with world-class skiing, hiking, and charming alpine villages.', 'Continental', 46.818188, 8.227512, 1, 88),
    ('D1000001-0001-0001-0001-000000000003', N'Santorini Escape', N'Greece', N'Mediterranean', N'Stunning volcanic island with whitewashed buildings, crystal-clear waters, and legendary sunsets.', 'Mediterranean', 36.393154, 25.461510, 1, 95),
    ('D1000001-0001-0001-0001-000000000004', N'Tokyo Explorer', N'Japan', N'East Asia', N'A vibrant metropolis blending ultramodern skyscrapers with historic temples and incredible cuisine.', 'Temperate', 35.689487, 139.691711, 1, 90),
    ('D1000001-0001-0001-0001-000000000005', N'Sahara Desert Trek', N'Morocco', N'North Africa', N'Unforgettable desert adventure with camel rides, stargazing, and ancient Berber culture.', 'Arid', 31.791702, -7.092620, 1, 72),
    ('D1000001-0001-0001-0001-000000000006', N'Patagonia Wilderness', N'Argentina', N'South America', N'Remote wilderness of glaciers, mountains, and pristine lakes at the southern tip of the world.', 'Continental', -50.339670, -72.264230, 1, 78),
    ('D1000001-0001-0001-0001-000000000007', N'Amalfi Coast Retreat', N'Italy', N'Southern Europe', N'Dramatic coastline with colorful cliffside villages, lemon groves, and Mediterranean charm.', 'Mediterranean', 40.633610, 14.602470, 1, 86),
    ('D1000001-0001-0001-0001-000000000008', N'Iceland Northern Lights', N'Iceland', N'North Atlantic', N'Land of fire and ice with geysers, waterfalls, hot springs, and the aurora borealis.', 'Polar', 64.963051, -19.020835, 1, 84);
GO

/* ============================================================
   Sample Data: Hotels (12)
   ============================================================ */
INSERT INTO sample_travel.Hotel (ID, DestinationID, Name, Address, StarRating, PricePerNight, TotalRooms, HasPool, HasSpa, CheckInTime, CheckOutTime, ContactEmail, IsActive)
VALUES
    ('H1000001-0001-0001-0001-000000000001', 'D1000001-0001-0001-0001-000000000001', N'Bali Serene Resort', N'Jl. Raya Ubud No. 88, Ubud, Bali', 5, 320.00, 120, 1, 1, '14:00:00', '12:00:00', 'reservations@baliserene.com', 1),
    ('H1000001-0001-0001-0001-000000000002', 'D1000001-0001-0001-0001-000000000001', N'Kuta Beach Inn', N'Jl. Pantai Kuta No. 15, Kuta, Bali', 3, 85.00, 45, 1, 0, '15:00:00', '11:00:00', 'info@kutabeachinn.com', 1),
    ('H1000001-0001-0001-0001-000000000003', 'D1000001-0001-0001-0001-000000000002', N'Alpine Grand Hotel', N'Bahnhofstrasse 42, Zermatt, Switzerland', 5, 450.00, 80, 0, 1, '15:00:00', '11:00:00', 'bookings@alpinegrand.ch', 1),
    ('H1000001-0001-0001-0001-000000000004', 'D1000001-0001-0001-0001-000000000002', N'Mountain View Lodge', N'Dorfstrasse 7, Grindelwald, Switzerland', 3, 180.00, 30, 0, 0, '16:00:00', '10:00:00', NULL, 1),
    ('H1000001-0001-0001-0001-000000000005', 'D1000001-0001-0001-0001-000000000003', N'Caldera Luxury Suites', N'Fira Main Street 23, Santorini, Greece', 5, 520.00, 25, 1, 1, '14:00:00', '12:00:00', 'stay@calderasuites.gr', 1),
    ('H1000001-0001-0001-0001-000000000006', 'D1000001-0001-0001-0001-000000000004', N'Shinjuku Central Hotel', N'2-10-5 Kabukicho, Shinjuku-ku, Tokyo', 4, 200.00, 250, 0, 0, '15:00:00', '10:00:00', 'front@shinjukucentral.jp', 1),
    ('H1000001-0001-0001-0001-000000000007', 'D1000001-0001-0001-0001-000000000004', N'Traditional Ryokan Zen', N'5-3-1 Asakusa, Taito-ku, Tokyo', 4, 280.00, 15, 0, 1, '16:00:00', '10:00:00', 'zen@ryokanzen.jp', 1),
    ('H1000001-0001-0001-0001-000000000008', 'D1000001-0001-0001-0001-000000000005', N'Desert Oasis Camp', N'Route de Merzouga, Errachidia, Morocco', 3, 95.00, 20, 0, 0, '14:00:00', '11:00:00', 'camp@desertoasis.ma', 1),
    ('H1000001-0001-0001-0001-000000000009', 'D1000001-0001-0001-0001-000000000006', N'Glaciar Hotel El Calafate', N'Av. del Libertador 1080, El Calafate', 4, 175.00, 55, 0, 1, '15:00:00', '11:00:00', 'info@glaciarhotel.ar', 1),
    ('H1000001-0001-0001-0001-000000000010', 'D1000001-0001-0001-0001-000000000007', N'Villa Amalfi Splendore', N'Via Cristoforo Colombo 14, Amalfi', 4, 350.00, 35, 1, 1, '14:00:00', '11:00:00', 'villa@amalfisplendore.it', 1),
    ('H1000001-0001-0001-0001-000000000011', 'D1000001-0001-0001-0001-000000000008', N'Aurora Borealis Lodge', N'Skogarvegur 12, Selfoss, Iceland', 3, 160.00, 22, 0, 1, '15:00:00', '11:00:00', 'stay@auroraborealislodge.is', 1),
    ('H1000001-0001-0001-0001-000000000012', 'D1000001-0001-0001-0001-000000000008', N'Reykjavik City Comfort', N'Laugavegur 56, Reykjavik, Iceland', 4, 220.00, 90, 0, 0, '14:00:00', '12:00:00', 'hello@reykjavikcitycomfort.is', 1);
GO

/* ============================================================
   Sample Data: Tour Packages (10)
   ============================================================ */
INSERT INTO sample_travel.TourPackage (ID, DestinationID, Name, Description, DurationDays, BasePrice, MaxGroupSize, DifficultyLevel, IncludesHotel, IncludesMeals, StartDate, EndDate, IsAvailable)
VALUES
    ('T1000001-0001-0001-0001-000000000001', 'D1000001-0001-0001-0001-000000000001', N'Bali Temple & Rice Terrace Tour', N'Visit ancient temples, walk through iconic rice terraces, and experience traditional Balinese culture.', 5, 850.00, 15, 'Easy', 1, 1, '2025-06-01', '2025-06-05', 1),
    ('T1000001-0001-0001-0001-000000000002', 'D1000001-0001-0001-0001-000000000002', N'Matterhorn Summit Trek', N'Guided multi-day trek through alpine meadows with a summit attempt on the iconic Matterhorn.', 7, 2200.00, 8, 'Extreme', 1, 1, '2025-07-15', '2025-07-21', 1),
    ('T1000001-0001-0001-0001-000000000003', 'D1000001-0001-0001-0001-000000000003', N'Santorini Sailing & Wine', N'Catamaran cruise around the caldera with stops at volcanic hot springs and sunset wine tasting.', 3, 680.00, 12, 'Easy', 0, 1, '2025-05-20', '2025-05-22', 1),
    ('T1000001-0001-0001-0001-000000000004', 'D1000001-0001-0001-0001-000000000004', N'Tokyo Food & Culture Walk', N'Explore hidden alleyways, taste street food, visit Tsukiji market, and learn sushi-making.', 4, 950.00, 10, 'Easy', 0, 1, '2025-09-01', '2025-09-04', 1),
    ('T1000001-0001-0001-0001-000000000005', 'D1000001-0001-0001-0001-000000000005', N'Sahara Camel Expedition', N'Three-day camel trek into the Sahara with overnight camps under the stars and Berber guides.', 3, 420.00, 10, 'Challenging', 0, 1, '2025-10-10', '2025-10-12', 1),
    ('T1000001-0001-0001-0001-000000000006', 'D1000001-0001-0001-0001-000000000006', N'Patagonia Glacier Hike', N'Multi-day trekking adventure through Torres del Paine with glacier viewing and wildlife spotting.', 10, 3500.00, 12, 'Challenging', 1, 1, '2025-11-01', '2025-11-10', 1),
    ('T1000001-0001-0001-0001-000000000007', 'D1000001-0001-0001-0001-000000000007', N'Amalfi Coast Road Trip', N'Scenic drive along the coast with stops in Positano, Ravello, and hidden beach coves.', 5, 1200.00, 8, 'Easy', 1, 0, '2025-06-15', '2025-06-19', 1),
    ('T1000001-0001-0001-0001-000000000008', 'D1000001-0001-0001-0001-000000000008', N'Northern Lights Chase', N'Evening excursions to prime aurora viewing locations with expert photography guidance.', 4, 780.00, 15, 'Moderate', 1, 0, '2025-12-01', '2025-12-04', 1),
    ('T1000001-0001-0001-0001-000000000009', 'D1000001-0001-0001-0001-000000000001', N'Bali Surf & Yoga Retreat', N'Morning surf lessons on Kuta beach followed by afternoon yoga sessions and spa treatments.', 7, 1100.00, 12, 'Moderate', 1, 1, '2025-08-01', '2025-08-07', 1),
    ('T1000001-0001-0001-0001-000000000010', 'D1000001-0001-0001-0001-000000000004', N'Ancient Temples of Kyoto', N'Day trip from Tokyo to Kyoto visiting ancient temples, bamboo groves, and geisha districts.', 2, 380.00, 20, 'Easy', 0, 1, '2025-09-10', '2025-09-11', 1);
GO

/* ============================================================
   Sample Data: Customers (15)
   ============================================================ */
INSERT INTO sample_travel.Customer (ID, FirstName, LastName, Email, Phone, DateOfBirth, PassportNumber, Nationality, LoyaltyTier, LoyaltyPoints, IsActive, Notes)
VALUES
    ('C1000001-0001-0001-0001-000000000001', N'Oliver', N'Bennett', N'oliver.bennett@email.com', '555-3001', '1985-04-12', 'US12345678', N'American', 'Platinum', 28500, 1, N'Frequent traveler, prefers luxury'),
    ('C1000001-0001-0001-0001-000000000002', N'Sofia', N'Morales', N'sofia.morales@email.com', '555-3002', '1990-08-23', 'MX98765432', N'Mexican', 'Gold', 12400, 1, N'Adventure enthusiast'),
    ('C1000001-0001-0001-0001-000000000003', N'Liam', N'O''Connor', N'liam.oconnor@email.com', '555-3003', '1978-12-05', 'IE55667788', N'Irish', 'Silver', 5200, 1, NULL),
    ('C1000001-0001-0001-0001-000000000004', N'Yuki', N'Tanaka', N'yuki.tanaka@email.com', '555-3004', '1995-03-18', 'JP11223344', N'Japanese', 'Bronze', 800, 1, N'First-time international traveler'),
    ('C1000001-0001-0001-0001-000000000005', N'Emma', N'Johansson', N'emma.j@email.com', '555-3005', '1988-07-30', 'SE44556677', N'Swedish', 'Gold', 15600, 1, N'Prefers eco-friendly options'),
    ('C1000001-0001-0001-0001-000000000006', N'Raj', N'Patel', N'raj.patel@email.com', '555-3006', '1982-11-14', 'IN99887766', N'Indian', 'Silver', 4100, 1, NULL),
    ('C1000001-0001-0001-0001-000000000007', N'Claire', N'Dubois', N'claire.dubois@email.com', '555-3007', '1993-06-22', 'FR33221100', N'French', 'Bronze', 1200, 1, N'Honeymoon planning'),
    ('C1000001-0001-0001-0001-000000000008', N'Hans', N'Mueller', N'hans.mueller@email.com', '555-3008', '1975-01-09', 'DE88776655', N'German', 'Platinum', 32100, 1, N'Business and leisure traveler'),
    ('C1000001-0001-0001-0001-000000000009', N'Amara', N'Osei', N'amara.osei@email.com', '555-3009', '1998-09-27', NULL, N'Ghanaian', 'Bronze', 300, 1, N'Student traveler on a budget'),
    ('C1000001-0001-0001-0001-000000000010', N'Chen', N'Wei', N'chen.wei@email.com', '555-3010', '1987-05-03', 'CN77665544', N'Chinese', 'Gold', 11800, 1, NULL),
    ('C1000001-0001-0001-0001-000000000011', N'Isabella', N'Rossi', N'isabella.r@email.com', '555-3011', '1991-02-16', 'IT22334455', N'Italian', 'Silver', 6700, 1, N'Food and culture focused'),
    ('C1000001-0001-0001-0001-000000000012', N'James', N'McAllister', N'james.mcallister@email.com', '555-3012', '1980-10-20', 'GB99001122', N'British', 'Silver', 7200, 1, NULL),
    ('C1000001-0001-0001-0001-000000000013', N'Fatima', N'Al-Rashid', N'fatima.ar@email.com', NULL, '1996-04-08', 'AE55443322', N'Emirati', 'Gold', 18900, 1, N'Luxury travel specialist'),
    ('C1000001-0001-0001-0001-000000000014', N'Lucas', N'Silva', N'lucas.silva@email.com', '555-3014', '1989-08-15', 'BR66778899', N'Brazilian', 'Bronze', 500, 1, N'Beach and nature lover'),
    ('C1000001-0001-0001-0001-000000000015', N'Anika', N'Bergstrom', N'anika.b@email.com', '555-3015', '1994-12-01', 'SE11002233', N'Swedish', 'Bronze', 200, 0, N'Account deactivated per request');
GO

/* ============================================================
   Sample Data: Bookings (20)
   ============================================================ */
INSERT INTO sample_travel.Booking (ID, CustomerID, DestinationID, BookingDate, TravelStartDate, TravelEndDate, NumAdults, NumChildren, TotalAmount, DiscountPercent, Status, SpecialRequests)
VALUES
    ('BK000001-0001-0001-0001-000000000001', 'C1000001-0001-0001-0001-000000000001', 'D1000001-0001-0001-0001-000000000003', '2025-01-10', '2025-06-15', '2025-06-22', 2, 0, 8540.00, 10.00, 'Confirmed', N'Caldera view room requested'),
    ('BK000001-0001-0001-0001-000000000002', 'C1000001-0001-0001-0001-000000000002', 'D1000001-0001-0001-0001-000000000006', '2025-02-05', '2025-11-01', '2025-11-12', 1, 0, 4200.00, 5.00, 'Confirmed', N'Vegetarian meals only'),
    ('BK000001-0001-0001-0001-000000000003', 'C1000001-0001-0001-0001-000000000003', 'D1000001-0001-0001-0001-000000000001', '2025-01-20', '2025-06-01', '2025-06-08', 2, 1, 3200.00, 0.00, 'Confirmed', NULL),
    ('BK000001-0001-0001-0001-000000000004', 'C1000001-0001-0001-0001-000000000004', 'D1000001-0001-0001-0001-000000000004', '2025-03-01', '2025-09-01', '2025-09-06', 1, 0, 2150.00, 0.00, 'Pending', N'Ryokan experience preferred'),
    ('BK000001-0001-0001-0001-000000000005', 'C1000001-0001-0001-0001-000000000005', 'D1000001-0001-0001-0001-000000000008', '2025-02-15', '2025-12-01', '2025-12-06', 2, 0, 2800.00, 15.00, 'Confirmed', N'Northern lights tour essential'),
    ('BK000001-0001-0001-0001-000000000006', 'C1000001-0001-0001-0001-000000000006', 'D1000001-0001-0001-0001-000000000001', '2025-03-10', '2025-08-01', '2025-08-10', 2, 2, 4500.00, 0.00, 'Confirmed', N'Family-friendly activities'),
    ('BK000001-0001-0001-0001-000000000007', 'C1000001-0001-0001-0001-000000000007', 'D1000001-0001-0001-0001-000000000003', '2025-03-15', '2025-07-10', '2025-07-15', 2, 0, 5200.00, 0.00, 'Confirmed', N'Honeymoon package with champagne'),
    ('BK000001-0001-0001-0001-000000000008', 'C1000001-0001-0001-0001-000000000008', 'D1000001-0001-0001-0001-000000000002', '2025-01-05', '2025-03-10', '2025-03-17', 1, 0, 3850.00, 10.00, 'Completed', N'Ski equipment rental needed'),
    ('BK000001-0001-0001-0001-000000000009', 'C1000001-0001-0001-0001-000000000009', 'D1000001-0001-0001-0001-000000000005', '2025-04-01', '2025-10-10', '2025-10-14', 1, 0, 620.00, 0.00, 'Pending', NULL),
    ('BK000001-0001-0001-0001-000000000010', 'C1000001-0001-0001-0001-000000000010', 'D1000001-0001-0001-0001-000000000004', '2025-02-20', '2025-04-05', '2025-04-12', 2, 1, 4800.00, 5.00, 'Completed', N'Japanese speaking guide'),
    ('BK000001-0001-0001-0001-000000000011', 'C1000001-0001-0001-0001-000000000011', 'D1000001-0001-0001-0001-000000000007', '2025-03-20', '2025-06-15', '2025-06-21', 2, 0, 4600.00, 0.00, 'Confirmed', N'Cooking class in Amalfi'),
    ('BK000001-0001-0001-0001-000000000012', 'C1000001-0001-0001-0001-000000000012', 'D1000001-0001-0001-0001-000000000002', '2025-04-05', '2025-07-20', '2025-07-27', 1, 0, 3600.00, 0.00, 'Confirmed', NULL),
    ('BK000001-0001-0001-0001-000000000013', 'C1000001-0001-0001-0001-000000000013', 'D1000001-0001-0001-0001-000000000001', '2025-02-25', '2025-05-10', '2025-05-17', 1, 0, 3900.00, 20.00, 'Completed', N'VIP spa treatment package'),
    ('BK000001-0001-0001-0001-000000000014', 'C1000001-0001-0001-0001-000000000001', 'D1000001-0001-0001-0001-000000000004', '2025-04-10', '2025-09-10', '2025-09-14', 2, 0, 2800.00, 10.00, 'Pending', N'Ancient temples day trip'),
    ('BK000001-0001-0001-0001-000000000015', 'C1000001-0001-0001-0001-000000000014', 'D1000001-0001-0001-0001-000000000001', '2025-04-15', '2025-08-01', '2025-08-08', 1, 0, 1650.00, 0.00, 'Confirmed', N'Surf lessons included'),
    ('BK000001-0001-0001-0001-000000000016', 'C1000001-0001-0001-0001-000000000008', 'D1000001-0001-0001-0001-000000000007', '2025-01-15', '2025-04-20', '2025-04-25', 2, 0, 4200.00, 10.00, 'Completed', N'Private vineyard tour'),
    ('BK000001-0001-0001-0001-000000000017', 'C1000001-0001-0001-0001-000000000005', 'D1000001-0001-0001-0001-000000000006', '2025-03-25', '2025-11-05', '2025-11-12', 2, 0, 4100.00, 15.00, 'Confirmed', N'Eco lodge preferred'),
    ('BK000001-0001-0001-0001-000000000018', 'C1000001-0001-0001-0001-000000000010', 'D1000001-0001-0001-0001-000000000003', '2025-04-20', '2025-08-15', '2025-08-20', 2, 2, 6200.00, 5.00, 'Pending', NULL),
    ('BK000001-0001-0001-0001-000000000019', 'C1000001-0001-0001-0001-000000000001', 'D1000001-0001-0001-0001-000000000008', '2025-04-25', '2025-12-10', '2025-12-15', 2, 0, 3200.00, 10.00, 'Confirmed', N'Private northern lights tour'),
    ('BK000001-0001-0001-0001-000000000020', 'C1000001-0001-0001-0001-000000000006', 'D1000001-0001-0001-0001-000000000005', '2025-05-01', '2025-10-15', '2025-10-18', 2, 0, 1100.00, 0.00, 'Pending', N'Traditional Berber tent camping');
GO

/* ============================================================
   Sample Data: Booking Items (25)
   ============================================================ */
INSERT INTO sample_travel.BookingItem (ID, BookingID, HotelID, TourPackageID, ItemType, CheckInDate, CheckOutDate, Quantity, UnitPrice, LineTotal, Notes)
VALUES
    ('BI000001-0001-0001-0001-000000000001', 'BK000001-0001-0001-0001-000000000001', 'H1000001-0001-0001-0001-000000000005', NULL, 'Hotel', '2025-06-15', '2025-06-22', 7, 520.00, 3640.00, N'Caldera view suite'),
    ('BI000001-0001-0001-0001-000000000002', 'BK000001-0001-0001-0001-000000000001', NULL, 'T1000001-0001-0001-0001-000000000003', 'Tour', NULL, NULL, 2, 680.00, 1360.00, N'Sailing tour for two'),
    ('BI000001-0001-0001-0001-000000000003', 'BK000001-0001-0001-0001-000000000002', NULL, 'T1000001-0001-0001-0001-000000000006', 'Tour', NULL, NULL, 1, 3500.00, 3500.00, NULL),
    ('BI000001-0001-0001-0001-000000000004', 'BK000001-0001-0001-0001-000000000003', 'H1000001-0001-0001-0001-000000000002', NULL, 'Hotel', '2025-06-01', '2025-06-08', 7, 85.00, 595.00, N'Family room'),
    ('BI000001-0001-0001-0001-000000000005', 'BK000001-0001-0001-0001-000000000003', NULL, 'T1000001-0001-0001-0001-000000000001', 'Tour', NULL, NULL, 3, 850.00, 2550.00, N'Two adults one child'),
    ('BI000001-0001-0001-0001-000000000006', 'BK000001-0001-0001-0001-000000000004', 'H1000001-0001-0001-0001-000000000007', NULL, 'Hotel', '2025-09-01', '2025-09-06', 5, 280.00, 1400.00, N'Traditional room'),
    ('BI000001-0001-0001-0001-000000000007', 'BK000001-0001-0001-0001-000000000004', NULL, 'T1000001-0001-0001-0001-000000000004', 'Tour', NULL, NULL, 1, 950.00, 950.00, NULL),
    ('BI000001-0001-0001-0001-000000000008', 'BK000001-0001-0001-0001-000000000005', 'H1000001-0001-0001-0001-000000000011', NULL, 'Hotel', '2025-12-01', '2025-12-06', 5, 160.00, 800.00, NULL),
    ('BI000001-0001-0001-0001-000000000009', 'BK000001-0001-0001-0001-000000000005', NULL, 'T1000001-0001-0001-0001-000000000008', 'Tour', NULL, NULL, 2, 780.00, 1560.00, N'Northern lights for two'),
    ('BI000001-0001-0001-0001-000000000010', 'BK000001-0001-0001-0001-000000000006', 'H1000001-0001-0001-0001-000000000001', NULL, 'Hotel', '2025-08-01', '2025-08-10', 9, 320.00, 2880.00, N'Two connecting rooms'),
    ('BI000001-0001-0001-0001-000000000011', 'BK000001-0001-0001-0001-000000000006', NULL, 'T1000001-0001-0001-0001-000000000009', 'Tour', NULL, NULL, 4, 1100.00, 4400.00, N'Family surf and yoga'),
    ('BI000001-0001-0001-0001-000000000012', 'BK000001-0001-0001-0001-000000000007', 'H1000001-0001-0001-0001-000000000005', NULL, 'Hotel', '2025-07-10', '2025-07-15', 5, 520.00, 2600.00, N'Honeymoon suite'),
    ('BI000001-0001-0001-0001-000000000013', 'BK000001-0001-0001-0001-000000000008', 'H1000001-0001-0001-0001-000000000003', NULL, 'Hotel', '2025-03-10', '2025-03-17', 7, 450.00, 3150.00, N'Mountain view room'),
    ('BI000001-0001-0001-0001-000000000014', 'BK000001-0001-0001-0001-000000000009', NULL, 'T1000001-0001-0001-0001-000000000005', 'Tour', NULL, NULL, 1, 420.00, 420.00, NULL),
    ('BI000001-0001-0001-0001-000000000015', 'BK000001-0001-0001-0001-000000000010', 'H1000001-0001-0001-0001-000000000006', NULL, 'Hotel', '2025-04-05', '2025-04-12', 7, 200.00, 1400.00, NULL),
    ('BI000001-0001-0001-0001-000000000016', 'BK000001-0001-0001-0001-000000000010', NULL, 'T1000001-0001-0001-0001-000000000004', 'Tour', NULL, NULL, 3, 950.00, 2850.00, N'Family package'),
    ('BI000001-0001-0001-0001-000000000017', 'BK000001-0001-0001-0001-000000000011', 'H1000001-0001-0001-0001-000000000010', NULL, 'Hotel', '2025-06-15', '2025-06-21', 6, 350.00, 2100.00, NULL),
    ('BI000001-0001-0001-0001-000000000018', 'BK000001-0001-0001-0001-000000000011', NULL, 'T1000001-0001-0001-0001-000000000007', 'Tour', NULL, NULL, 2, 1200.00, 2400.00, N'Road trip for two'),
    ('BI000001-0001-0001-0001-000000000019', 'BK000001-0001-0001-0001-000000000012', 'H1000001-0001-0001-0001-000000000003', NULL, 'Hotel', '2025-07-20', '2025-07-27', 7, 450.00, 3150.00, NULL),
    ('BI000001-0001-0001-0001-000000000020', 'BK000001-0001-0001-0001-000000000012', NULL, 'T1000001-0001-0001-0001-000000000002', 'Tour', NULL, NULL, 1, 2200.00, 2200.00, N'Summit trek solo'),
    ('BI000001-0001-0001-0001-000000000021', 'BK000001-0001-0001-0001-000000000013', 'H1000001-0001-0001-0001-000000000001', NULL, 'Hotel', '2025-05-10', '2025-05-17', 7, 320.00, 2240.00, N'VIP villa'),
    ('BI000001-0001-0001-0001-000000000022', 'BK000001-0001-0001-0001-000000000014', 'H1000001-0001-0001-0001-000000000006', NULL, 'Hotel', '2025-09-10', '2025-09-14', 4, 200.00, 800.00, NULL),
    ('BI000001-0001-0001-0001-000000000023', 'BK000001-0001-0001-0001-000000000014', NULL, 'T1000001-0001-0001-0001-000000000010', 'Tour', NULL, NULL, 2, 380.00, 760.00, N'Kyoto day trip'),
    ('BI000001-0001-0001-0001-000000000024', 'BK000001-0001-0001-0001-000000000016', 'H1000001-0001-0001-0001-000000000010', NULL, 'Hotel', '2025-04-20', '2025-04-25', 5, 350.00, 1750.00, N'Sea view room'),
    ('BI000001-0001-0001-0001-000000000025', 'BK000001-0001-0001-0001-000000000016', NULL, 'T1000001-0001-0001-0001-000000000007', 'Tour', NULL, NULL, 2, 1200.00, 2400.00, N'Coast drive for two');
GO

/* ============================================================
   Sample Data: Payments (22)
   ============================================================ */
INSERT INTO sample_travel.Payment (ID, BookingID, PaymentDate, Amount, PaymentMethod, TransactionRef, Status, IsRefund, ProcessedAt)
VALUES
    ('PM000001-0001-0001-0001-000000000001', 'BK000001-0001-0001-0001-000000000001', '2025-01-10', 4270.00, 'CreditCard', 'TXN-2025-00001', 'Completed', 0, '2025-01-10'),
    ('PM000001-0001-0001-0001-000000000002', 'BK000001-0001-0001-0001-000000000001', '2025-04-15', 4270.00, 'CreditCard', 'TXN-2025-00002', 'Completed', 0, '2025-04-15'),
    ('PM000001-0001-0001-0001-000000000003', 'BK000001-0001-0001-0001-000000000002', '2025-02-05', 3990.00, 'BankTransfer', 'TXN-2025-00003', 'Completed', 0, '2025-02-06'),
    ('PM000001-0001-0001-0001-000000000004', 'BK000001-0001-0001-0001-000000000003', '2025-01-20', 3200.00, 'CreditCard', 'TXN-2025-00004', 'Completed', 0, '2025-01-20'),
    ('PM000001-0001-0001-0001-000000000005', 'BK000001-0001-0001-0001-000000000004', '2025-03-01', 1075.00, 'CreditCard', 'TXN-2025-00005', 'Completed', 0, '2025-03-01'),
    ('PM000001-0001-0001-0001-000000000006', 'BK000001-0001-0001-0001-000000000005', '2025-02-15', 2380.00, 'PayPal', 'TXN-2025-00006', 'Completed', 0, '2025-02-15'),
    ('PM000001-0001-0001-0001-000000000007', 'BK000001-0001-0001-0001-000000000006', '2025-03-10', 4500.00, 'DebitCard', 'TXN-2025-00007', 'Completed', 0, '2025-03-10'),
    ('PM000001-0001-0001-0001-000000000008', 'BK000001-0001-0001-0001-000000000007', '2025-03-15', 5200.00, 'CreditCard', 'TXN-2025-00008', 'Completed', 0, '2025-03-15'),
    ('PM000001-0001-0001-0001-000000000009', 'BK000001-0001-0001-0001-000000000008', '2025-01-05', 3465.00, 'BankTransfer', 'TXN-2025-00009', 'Completed', 0, '2025-01-06'),
    ('PM000001-0001-0001-0001-000000000010', 'BK000001-0001-0001-0001-000000000009', '2025-04-01', 620.00, 'CreditCard', 'TXN-2025-00010', 'Pending', 0, NULL),
    ('PM000001-0001-0001-0001-000000000011', 'BK000001-0001-0001-0001-000000000010', '2025-02-20', 4560.00, 'CreditCard', 'TXN-2025-00011', 'Completed', 0, '2025-02-20'),
    ('PM000001-0001-0001-0001-000000000012', 'BK000001-0001-0001-0001-000000000011', '2025-03-20', 4600.00, 'CreditCard', 'TXN-2025-00012', 'Completed', 0, '2025-03-20'),
    ('PM000001-0001-0001-0001-000000000013', 'BK000001-0001-0001-0001-000000000012', '2025-04-05', 1800.00, 'PayPal', 'TXN-2025-00013', 'Completed', 0, '2025-04-05'),
    ('PM000001-0001-0001-0001-000000000014', 'BK000001-0001-0001-0001-000000000012', '2025-05-05', 1800.00, 'PayPal', 'TXN-2025-00014', 'Pending', 0, NULL),
    ('PM000001-0001-0001-0001-000000000015', 'BK000001-0001-0001-0001-000000000013', '2025-02-25', 3120.00, 'BankTransfer', 'TXN-2025-00015', 'Completed', 0, '2025-02-26'),
    ('PM000001-0001-0001-0001-000000000016', 'BK000001-0001-0001-0001-000000000014', '2025-04-10', 1260.00, 'CreditCard', 'TXN-2025-00016', 'Completed', 0, '2025-04-10'),
    ('PM000001-0001-0001-0001-000000000017', 'BK000001-0001-0001-0001-000000000015', '2025-04-15', 1650.00, 'DebitCard', 'TXN-2025-00017', 'Completed', 0, '2025-04-15'),
    ('PM000001-0001-0001-0001-000000000018', 'BK000001-0001-0001-0001-000000000016', '2025-01-15', 3780.00, 'CreditCard', 'TXN-2025-00018', 'Completed', 0, '2025-01-15'),
    ('PM000001-0001-0001-0001-000000000019', 'BK000001-0001-0001-0001-000000000017', '2025-03-25', 3485.00, 'BankTransfer', 'TXN-2025-00019', 'Completed', 0, '2025-03-26'),
    ('PM000001-0001-0001-0001-000000000020', 'BK000001-0001-0001-0001-000000000018', '2025-04-20', 3100.00, 'CreditCard', 'TXN-2025-00020', 'Pending', 0, NULL),
    ('PM000001-0001-0001-0001-000000000021', 'BK000001-0001-0001-0001-000000000019', '2025-04-25', 2880.00, 'PayPal', 'TXN-2025-00021', 'Completed', 0, '2025-04-25'),
    ('PM000001-0001-0001-0001-000000000022', 'BK000001-0001-0001-0001-000000000020', '2025-05-01', 1100.00, 'Cash', 'TXN-2025-00022', 'Pending', 0, NULL);
GO

/* ============================================================
   Sample Data: Reviews (15)
   ============================================================ */
INSERT INTO sample_travel.Review (ID, CustomerID, BookingID, DestinationID, HotelID, Rating, Title, ReviewText, IsVerified, IsPublished)
VALUES
    ('RV000001-0001-0001-0001-000000000001', 'C1000001-0001-0001-0001-000000000008', 'BK000001-0001-0001-0001-000000000008', 'D1000001-0001-0001-0001-000000000002', 'H1000001-0001-0001-0001-000000000003', 5, N'Unforgettable Swiss Alps Experience', N'The Alpine Grand Hotel exceeded all expectations. Stunning mountain views from every window and impeccable service throughout our stay.', 1, 1),
    ('RV000001-0001-0001-0001-000000000002', 'C1000001-0001-0001-0001-000000000010', 'BK000001-0001-0001-0001-000000000010', 'D1000001-0001-0001-0001-000000000004', 'H1000001-0001-0001-0001-000000000006', 4, N'Tokyo Was Amazing', N'The Shinjuku Central Hotel was perfectly located for exploring. Great food tour and incredibly friendly staff. Would definitely return.', 1, 1),
    ('RV000001-0001-0001-0001-000000000003', 'C1000001-0001-0001-0001-000000000013', 'BK000001-0001-0001-0001-000000000013', 'D1000001-0001-0001-0001-000000000001', 'H1000001-0001-0001-0001-000000000001', 5, N'Bali Paradise Indeed', N'The Bali Serene Resort lives up to its name. The spa treatments were world-class and the infinity pool overlooking the rice terraces was breathtaking.', 1, 1),
    ('RV000001-0001-0001-0001-000000000004', 'C1000001-0001-0001-0001-000000000008', 'BK000001-0001-0001-0001-000000000016', 'D1000001-0001-0001-0001-000000000007', 'H1000001-0001-0001-0001-000000000010', 4, N'Beautiful Amalfi Coast', N'Villa Amalfi Splendore had stunning views and the road trip tour was excellent. Only downside was the crowded summer roads.', 1, 1),
    ('RV000001-0001-0001-0001-000000000005', 'C1000001-0001-0001-0001-000000000010', 'BK000001-0001-0001-0001-000000000010', 'D1000001-0001-0001-0001-000000000004', NULL, 3, N'Tokyo - Good but Overwhelming', N'Great city with amazing food but can be overwhelming with the crowds and language barrier. Good for experienced travelers.', 1, 1),
    ('RV000001-0001-0001-0001-000000000006', 'C1000001-0001-0001-0001-000000000001', 'BK000001-0001-0001-0001-000000000001', 'D1000001-0001-0001-0001-000000000003', 'H1000001-0001-0001-0001-000000000005', 5, N'Santorini Dreams Come True', N'Caldera Luxury Suites was absolute perfection. The sunset views from our private terrace were the highlight of the trip.', 1, 1),
    ('RV000001-0001-0001-0001-000000000007', 'C1000001-0001-0001-0001-000000000003', 'BK000001-0001-0001-0001-000000000003', 'D1000001-0001-0001-0001-000000000001', 'H1000001-0001-0001-0001-000000000002', 3, N'Budget-Friendly Bali', N'Kuta Beach Inn was clean and affordable but basic. Great location near the beach. Good value for budget travelers.', 1, 1),
    ('RV000001-0001-0001-0001-000000000008', 'C1000001-0001-0001-0001-000000000006', 'BK000001-0001-0001-0001-000000000006', 'D1000001-0001-0001-0001-000000000001', 'H1000001-0001-0001-0001-000000000001', 4, N'Great Family Vacation in Bali', N'Wonderful family trip. The resort was very accommodating with children and the surf yoga retreat was a highlight for everyone.', 1, 1),
    ('RV000001-0001-0001-0001-000000000009', 'C1000001-0001-0001-0001-000000000011', 'BK000001-0001-0001-0001-000000000011', 'D1000001-0001-0001-0001-000000000007', 'H1000001-0001-0001-0001-000000000010', 5, N'La Dolce Vita on the Amalfi Coast', N'Everything was perfect. The hotel, the food, the views. The cooking class was the cherry on top. Italy at its finest.', 1, 1),
    ('RV000001-0001-0001-0001-000000000010', 'C1000001-0001-0001-0001-000000000002', 'BK000001-0001-0001-0001-000000000002', 'D1000001-0001-0001-0001-000000000006', NULL, 4, N'Patagonia is Breathtaking', N'The glacier hike was challenging but absolutely worth it. Incredible scenery and our guide was extremely knowledgeable.', 1, 1),
    ('RV000001-0001-0001-0001-000000000011', 'C1000001-0001-0001-0001-000000000012', 'BK000001-0001-0001-0001-000000000012', 'D1000001-0001-0001-0001-000000000002', 'H1000001-0001-0001-0001-000000000003', 4, N'Swiss Precision and Beauty', N'The Matterhorn trek was the trip of a lifetime. The Alpine Grand Hotel provided excellent base camp accommodations.', 1, 1),
    ('RV000001-0001-0001-0001-000000000012', 'C1000001-0001-0001-0001-000000000007', 'BK000001-0001-0001-0001-000000000007', 'D1000001-0001-0001-0001-000000000003', 'H1000001-0001-0001-0001-000000000005', 5, N'Perfect Honeymoon Destination', N'Santorini was the ideal honeymoon spot. The Caldera suites were romantic and the sailing tour around the island was magical.', 1, 1),
    ('RV000001-0001-0001-0001-000000000013', 'C1000001-0001-0001-0001-000000000014', 'BK000001-0001-0001-0001-000000000015', 'D1000001-0001-0001-0001-000000000001', NULL, 4, N'Surf''s Up in Bali', N'Great surf conditions and the yoga retreat was surprisingly relaxing. Kuta beach area is lively and fun.', 1, 1),
    ('RV000001-0001-0001-0001-000000000014', 'C1000001-0001-0001-0001-000000000004', 'BK000001-0001-0001-0001-000000000004', 'D1000001-0001-0001-0001-000000000004', 'H1000001-0001-0001-0001-000000000007', 5, N'Authentic Japanese Experience', N'The Traditional Ryokan Zen was an incredible cultural experience. The food tour through Tokyo''s hidden alleys was unforgettable.', 0, 0),
    ('RV000001-0001-0001-0001-000000000015', 'C1000001-0001-0001-0001-000000000005', 'BK000001-0001-0001-0001-000000000005', 'D1000001-0001-0001-0001-000000000008', 'H1000001-0001-0001-0001-000000000011', 4, N'Iceland Exceeded Expectations', N'The Northern Lights were spectacular. The Aurora Borealis Lodge had great hot tubs for warming up after evening excursions.', 1, 1);
GO

PRINT N'Sample travel database setup complete.';
GO
