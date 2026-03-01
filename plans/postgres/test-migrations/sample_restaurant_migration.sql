/*
 * Sample Restaurant Management Migration (T-SQL)
 * Schema: sample_rest
 * 8 tables, 4 views, CHECK constraints (inline + ALTER TABLE),
 * extended properties, GRANT/ROLE, 130+ seed rows.
 * SQL constructs: DATEDIFF, ISNULL, GETDATE(), GETUTCDATE(), YEAR(), MONTH(),
 *                 COALESCE, CASE WHEN, ROUND, CAST, LEN, COUNT, SUM, AVG,
 *                 GROUP BY, HAVING, LEFT JOIN
 */

-- ============================================================
-- Schema
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'sample_rest')
    EXEC('CREATE SCHEMA sample_rest');
GO

-- ============================================================
-- Tables
-- ============================================================

-- MenuCategory
CREATE TABLE sample_rest.MenuCategory (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    SortOrder INT NOT NULL DEFAULT 0,
    IsActive BIT NOT NULL DEFAULT 1,
    Description NVARCHAR(500) NULL,
    CONSTRAINT PK_MenuCategory PRIMARY KEY (ID)
);
GO

-- MenuItem
CREATE TABLE sample_rest.MenuItem (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    CategoryID UNIQUEIDENTIFIER NOT NULL,
    Price DECIMAL(8,2) NOT NULL CHECK (Price >= 0),
    CalorieCount INT NULL,
    IsVegetarian BIT NOT NULL DEFAULT 0,
    IsGlutenFree BIT NOT NULL DEFAULT 0,
    IsAvailable BIT NOT NULL DEFAULT 1,
    PrepTimeMinutes INT NOT NULL DEFAULT 15 CHECK (PrepTimeMinutes > 0),
    ImageURL NVARCHAR(500) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_MenuItem PRIMARY KEY (ID),
    CONSTRAINT FK_MenuItem_Category FOREIGN KEY (CategoryID) REFERENCES sample_rest.MenuCategory(ID)
);
GO

-- TableSeating
CREATE TABLE sample_rest.TableSeating (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    TableNumber VARCHAR(10) NOT NULL,
    Capacity SMALLINT NOT NULL CHECK (Capacity BETWEEN 1 AND 20),
    Section VARCHAR(30) NOT NULL DEFAULT 'Main',
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_TableSeating PRIMARY KEY (ID),
    CONSTRAINT UQ_TableSeating_TableNumber UNIQUE (TableNumber)
);
GO

-- Staff
CREATE TABLE sample_rest.Staff (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName NVARCHAR(100) NOT NULL,
    LastName NVARCHAR(100) NOT NULL,
    Email NVARCHAR(255) NOT NULL,
    Phone VARCHAR(20) NOT NULL,
    Role VARCHAR(20) NOT NULL CHECK (Role IN ('Server', 'Host', 'Chef', 'Manager', 'Bartender', 'Busser')),
    HourlyRate DECIMAL(6,2) NOT NULL,
    HireDate DATE NOT NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_Staff PRIMARY KEY (ID),
    CONSTRAINT UQ_Staff_Email UNIQUE (Email)
);
GO

-- Reservation
CREATE TABLE sample_rest.Reservation (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    GuestName NVARCHAR(200) NOT NULL,
    GuestPhone VARCHAR(20) NOT NULL,
    GuestEmail NVARCHAR(255) NULL,
    PartySize SMALLINT NOT NULL CHECK (PartySize BETWEEN 1 AND 30),
    TableID UNIQUEIDENTIFIER NULL,
    ReservationDate DATE NOT NULL,
    ReservationTime TIME NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Confirmed' CHECK (Status IN ('Confirmed', 'Seated', 'Completed', 'Cancelled', 'NoShow')),
    Notes NVARCHAR(MAX) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT PK_Reservation PRIMARY KEY (ID),
    CONSTRAINT FK_Reservation_Table FOREIGN KEY (TableID) REFERENCES sample_rest.TableSeating(ID)
);
GO

-- CustomerOrder
CREATE TABLE sample_rest.CustomerOrder (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OrderNumber VARCHAR(20) NOT NULL,
    TableID UNIQUEIDENTIFIER NOT NULL,
    ServerID UNIQUEIDENTIFIER NOT NULL,
    OrderDate DATETIME NOT NULL DEFAULT GETUTCDATE(),
    Status VARCHAR(20) NOT NULL DEFAULT 'Open' CHECK (Status IN ('Open', 'InProgress', 'Ready', 'Served', 'Closed')),
    SubTotal DECIMAL(10,2) NOT NULL DEFAULT 0,
    TaxAmount DECIMAL(10,2) NOT NULL DEFAULT 0,
    TipAmount DECIMAL(10,2) NOT NULL DEFAULT 0,
    TotalAmount DECIMAL(10,2) NOT NULL DEFAULT 0,
    IsPaid BIT NOT NULL DEFAULT 0,
    PaidAt DATETIME NULL,
    PaymentMethod VARCHAR(20) NULL,
    CONSTRAINT PK_CustomerOrder PRIMARY KEY (ID),
    CONSTRAINT UQ_CustomerOrder_OrderNumber UNIQUE (OrderNumber),
    CONSTRAINT FK_CustomerOrder_Table FOREIGN KEY (TableID) REFERENCES sample_rest.TableSeating(ID),
    CONSTRAINT FK_CustomerOrder_Server FOREIGN KEY (ServerID) REFERENCES sample_rest.Staff(ID)
);
GO

-- ALTER TABLE CHECK for CustomerOrder.TotalAmount
ALTER TABLE sample_rest.CustomerOrder ADD CONSTRAINT CK_CustomerOrder_TotalAmount CHECK (TotalAmount >= 0);
GO

-- OrderItem
CREATE TABLE sample_rest.OrderItem (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OrderID UNIQUEIDENTIFIER NOT NULL,
    MenuItemID UNIQUEIDENTIFIER NOT NULL,
    Quantity SMALLINT NOT NULL DEFAULT 1 CHECK (Quantity > 0),
    UnitPrice DECIMAL(8,2) NOT NULL,
    SpecialInstructions NVARCHAR(500) NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending', 'Preparing', 'Ready', 'Served', 'Cancelled')),
    CONSTRAINT PK_OrderItem PRIMARY KEY (ID),
    CONSTRAINT FK_OrderItem_Order FOREIGN KEY (OrderID) REFERENCES sample_rest.CustomerOrder(ID),
    CONSTRAINT FK_OrderItem_MenuItem FOREIGN KEY (MenuItemID) REFERENCES sample_rest.MenuItem(ID)
);
GO

-- DailyRevenue
CREATE TABLE sample_rest.DailyRevenue (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    BusinessDate DATE NOT NULL,
    TotalOrders INT NOT NULL DEFAULT 0,
    TotalRevenue DECIMAL(12,2) NOT NULL DEFAULT 0,
    TotalTips DECIMAL(10,2) NOT NULL DEFAULT 0,
    CustomerCount INT NOT NULL DEFAULT 0,
    Notes NVARCHAR(MAX) NULL,
    CONSTRAINT PK_DailyRevenue PRIMARY KEY (ID),
    CONSTRAINT UQ_DailyRevenue_BusinessDate UNIQUE (BusinessDate)
);
GO

-- ALTER TABLE CHECK for DailyRevenue.TotalOrders
ALTER TABLE sample_rest.DailyRevenue ADD CONSTRAINT CK_DailyRevenue_TotalOrders CHECK (TotalOrders >= 0);
GO

-- ============================================================
-- Views
-- ============================================================

-- vwActiveMenu: menu items with category name, only available items
CREATE VIEW sample_rest.vwActiveMenu AS
SELECT
    mi.ID AS MenuItemID,
    mi.Name AS ItemName,
    mi.Description AS ItemDescription,
    mc.Name AS CategoryName,
    mc.SortOrder AS CategorySortOrder,
    mi.Price,
    mi.CalorieCount,
    CASE WHEN mi.IsVegetarian = 1 THEN N'Yes' ELSE N'No' END AS Vegetarian,
    CASE WHEN mi.IsGlutenFree = 1 THEN N'Yes' ELSE N'No' END AS GlutenFree,
    mi.PrepTimeMinutes,
    CASE
        WHEN mi.PrepTimeMinutes <= 10 THEN N'Quick'
        WHEN mi.PrepTimeMinutes <= 20 THEN N'Standard'
        ELSE N'Slow'
    END AS PrepSpeed,
    CASE WHEN LEN(mi.Name) > 25 THEN N'Long Name' ELSE N'Short Name' END AS NameLength
FROM sample_rest.MenuItem mi
INNER JOIN sample_rest.MenuCategory mc ON mc.ID = mi.CategoryID
WHERE mi.IsAvailable = 1 AND mc.IsActive = 1;
GO

-- vwTodayReservations: reservations for today with table number
CREATE VIEW sample_rest.vwTodayReservations AS
SELECT
    r.ID AS ReservationID,
    r.GuestName,
    r.GuestPhone,
    COALESCE(r.GuestEmail, N'No email provided') AS GuestEmail,
    r.PartySize,
    ISNULL(ts.TableNumber, N'Unassigned') AS TableNumber,
    ISNULL(ts.Capacity, 0) AS TableCapacity,
    r.ReservationDate,
    r.ReservationTime,
    r.Status,
    DATEDIFF(MINUTE, CAST(GETDATE() AS TIME), r.ReservationTime) AS MinutesUntilReservation,
    CASE
        WHEN DATEDIFF(MINUTE, CAST(GETDATE() AS TIME), r.ReservationTime) < 0 THEN N'Past'
        WHEN DATEDIFF(MINUTE, CAST(GETDATE() AS TIME), r.ReservationTime) <= 30 THEN N'Arriving Soon'
        ELSE N'Upcoming'
    END AS TimeStatus,
    r.Notes
FROM sample_rest.Reservation r
LEFT JOIN sample_rest.TableSeating ts ON ts.ID = r.TableID
WHERE r.ReservationDate = CAST(GETDATE() AS DATE);
GO

-- vwServerSales: staff servers with order count, total revenue, avg tip
CREATE VIEW sample_rest.vwServerSales AS
SELECT
    s.ID AS StaffID,
    s.FirstName + N' ' + s.LastName AS ServerName,
    s.Email,
    s.HourlyRate,
    YEAR(co.OrderDate) AS OrderYear,
    MONTH(co.OrderDate) AS OrderMonth,
    COUNT(co.ID) AS OrderCount,
    ISNULL(SUM(co.SubTotal), 0) AS TotalRevenue,
    ISNULL(SUM(co.TipAmount), 0) AS TotalTips,
    ROUND(ISNULL(AVG(co.TipAmount), 0), 2) AS AvgTipPerOrder,
    ROUND(
        CASE WHEN SUM(co.SubTotal) > 0
             THEN CAST(SUM(co.TipAmount) AS DECIMAL(10,2)) / CAST(SUM(co.SubTotal) AS DECIMAL(10,2)) * 100
             ELSE 0
        END, 1
    ) AS TipPercentage,
    SUM(CASE WHEN co.IsPaid = 1 THEN 1 ELSE 0 END) AS PaidOrders,
    SUM(CASE WHEN co.IsPaid = 0 THEN 1 ELSE 0 END) AS UnpaidOrders
FROM sample_rest.Staff s
INNER JOIN sample_rest.CustomerOrder co ON co.ServerID = s.ID
WHERE s.Role = 'Server'
GROUP BY s.ID, s.FirstName, s.LastName, s.Email, s.HourlyRate,
         YEAR(co.OrderDate), MONTH(co.OrderDate)
HAVING COUNT(co.ID) > 0;
GO

-- vwDailyReport: orders grouped by date with totals, avg order value
CREATE VIEW sample_rest.vwDailyReport AS
SELECT
    CAST(co.OrderDate AS DATE) AS OrderDate,
    COUNT(co.ID) AS TotalOrders,
    COALESCE(SUM(co.SubTotal), 0) AS GrossRevenue,
    COALESCE(SUM(co.TaxAmount), 0) AS TotalTax,
    COALESCE(SUM(co.TipAmount), 0) AS TotalTips,
    COALESCE(SUM(co.TotalAmount), 0) AS NetRevenue,
    ROUND(
        CASE WHEN COUNT(co.ID) > 0
             THEN CAST(SUM(co.TotalAmount) AS DECIMAL(12,2)) / CAST(COUNT(co.ID) AS DECIMAL(12,2))
             ELSE 0
        END, 2
    ) AS AvgOrderValue,
    SUM(CASE WHEN co.PaymentMethod = 'Cash' THEN 1 ELSE 0 END) AS CashOrders,
    SUM(CASE WHEN co.PaymentMethod = 'Card' THEN 1 ELSE 0 END) AS CardOrders,
    SUM(CASE WHEN co.PaymentMethod IS NULL THEN 1 ELSE 0 END) AS UnpaidOrders,
    CASE
        WHEN COALESCE(SUM(co.TotalAmount), 0) >= 5000 THEN N'Excellent'
        WHEN COALESCE(SUM(co.TotalAmount), 0) >= 3000 THEN N'Good'
        WHEN COALESCE(SUM(co.TotalAmount), 0) >= 1000 THEN N'Average'
        ELSE N'Below Average'
    END AS DayRating
FROM sample_rest.CustomerOrder co
GROUP BY CAST(co.OrderDate AS DATE);
GO

-- ============================================================
-- Extended Properties
-- ============================================================

-- Tables
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Categories for organizing the restaurant menu', @level0type=N'SCHEMA', @level0name=N'sample_rest', @level1type=N'TABLE', @level1name=N'MenuCategory';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Individual dishes and beverages on the menu', @level0type=N'SCHEMA', @level0name=N'sample_rest', @level1type=N'TABLE', @level1name=N'MenuItem';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Physical tables available for seating guests', @level0type=N'SCHEMA', @level0name=N'sample_rest', @level1type=N'TABLE', @level1name=N'TableSeating';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Restaurant staff members', @level0type=N'SCHEMA', @level0name=N'sample_rest', @level1type=N'TABLE', @level1name=N'Staff';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Guest reservation bookings', @level0type=N'SCHEMA', @level0name=N'sample_rest', @level1type=N'TABLE', @level1name=N'Reservation';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Customer orders placed at tables', @level0type=N'SCHEMA', @level0name=N'sample_rest', @level1type=N'TABLE', @level1name=N'CustomerOrder';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Individual items within a customer order', @level0type=N'SCHEMA', @level0name=N'sample_rest', @level1type=N'TABLE', @level1name=N'OrderItem';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Daily aggregated revenue and performance data', @level0type=N'SCHEMA', @level0name=N'sample_rest', @level1type=N'TABLE', @level1name=N'DailyRevenue';
GO

-- Key columns
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Menu item sale price', @level0type=N'SCHEMA', @level0name=N'sample_rest', @level1type=N'TABLE', @level1name=N'MenuItem', @level2type=N'COLUMN', @level2name=N'Price';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Estimated preparation time in minutes', @level0type=N'SCHEMA', @level0name=N'sample_rest', @level1type=N'TABLE', @level1name=N'MenuItem', @level2type=N'COLUMN', @level2name=N'PrepTimeMinutes';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether the item contains no gluten ingredients', @level0type=N'SCHEMA', @level0name=N'sample_rest', @level1type=N'TABLE', @level1name=N'MenuItem', @level2type=N'COLUMN', @level2name=N'IsGlutenFree';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display number for the table (e.g. T1, B2)', @level0type=N'SCHEMA', @level0name=N'sample_rest', @level1type=N'TABLE', @level1name=N'TableSeating', @level2type=N'COLUMN', @level2name=N'TableNumber';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Maximum number of guests the table can accommodate', @level0type=N'SCHEMA', @level0name=N'sample_rest', @level1type=N'TABLE', @level1name=N'TableSeating', @level2type=N'COLUMN', @level2name=N'Capacity';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Staff role determining job responsibilities', @level0type=N'SCHEMA', @level0name=N'sample_rest', @level1type=N'TABLE', @level1name=N'Staff', @level2type=N'COLUMN', @level2name=N'Role';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Current status of the reservation', @level0type=N'SCHEMA', @level0name=N'sample_rest', @level1type=N'TABLE', @level1name=N'Reservation', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique sequential order identifier', @level0type=N'SCHEMA', @level0name=N'sample_rest', @level1type=N'TABLE', @level1name=N'CustomerOrder', @level2type=N'COLUMN', @level2name=N'OrderNumber';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Order total including tax and tip', @level0type=N'SCHEMA', @level0name=N'sample_rest', @level1type=N'TABLE', @level1name=N'CustomerOrder', @level2type=N'COLUMN', @level2name=N'TotalAmount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Guest dietary modification or preference notes', @level0type=N'SCHEMA', @level0name=N'sample_rest', @level1type=N'TABLE', @level1name=N'OrderItem', @level2type=N'COLUMN', @level2name=N'SpecialInstructions';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Calendar date for revenue aggregation', @level0type=N'SCHEMA', @level0name=N'sample_rest', @level1type=N'TABLE', @level1name=N'DailyRevenue', @level2type=N'COLUMN', @level2name=N'BusinessDate';
GO

-- ============================================================
-- Security: Role + GRANT
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'RestaurantReadOnly' AND type = 'R')
    CREATE ROLE [RestaurantReadOnly];
GO

GRANT SELECT ON SCHEMA::sample_rest TO [RestaurantReadOnly];
GO

-- ============================================================
-- Seed Data
-- ============================================================

-- MenuCategory (6)
INSERT INTO sample_rest.MenuCategory (ID, Name, SortOrder, IsActive, Description) VALUES
    ('A0000001-0001-0001-0001-000000000001', N'Appetizers', 1, 1, N'Starters and small plates'),
    ('A0000001-0001-0001-0001-000000000002', N'Salads', 2, 1, N'Fresh salads and greens'),
    ('A0000001-0001-0001-0001-000000000003', N'Entrees', 3, 1, N'Main courses and signature dishes'),
    ('A0000001-0001-0001-0001-000000000004', N'Pasta', 4, 1, N'Handmade pasta dishes'),
    ('A0000001-0001-0001-0001-000000000005', N'Desserts', 5, 1, N'Sweet endings and treats'),
    ('A0000001-0001-0001-0001-000000000006', N'Beverages', 6, 1, N'Drinks, cocktails, and refreshments');
GO

-- MenuItem (20)
INSERT INTO sample_rest.MenuItem (ID, Name, Description, CategoryID, Price, CalorieCount, IsVegetarian, IsGlutenFree, IsAvailable, PrepTimeMinutes, ImageURL) VALUES
    ('B0000001-0001-0001-0001-000000000001', N'Bruschetta Trio', N'Three varieties of bruschetta with tomato basil, mushroom, and olive tapenade', 'A0000001-0001-0001-0001-000000000001', 12.95, 380, 1, 0, 1, 10, NULL),
    ('B0000001-0001-0001-0001-000000000002', N'Crispy Calamari', N'Lightly battered and fried with marinara dipping sauce', 'A0000001-0001-0001-0001-000000000001', 14.50, 520, 0, 0, 1, 12, NULL),
    ('B0000001-0001-0001-0001-000000000003', N'Shrimp Cocktail', N'Jumbo shrimp served chilled with cocktail sauce and lemon', 'A0000001-0001-0001-0001-000000000001', 16.95, 180, 0, 1, 1, 5, NULL),
    ('B0000001-0001-0001-0001-000000000004', N'Caesar Salad', N'Romaine lettuce with parmesan, croutons, and house Caesar dressing', 'A0000001-0001-0001-0001-000000000002', 11.50, 340, 1, 0, 1, 8, NULL),
    ('B0000001-0001-0001-0001-000000000005', N'Mediterranean Salad', N'Mixed greens with feta, olives, cucumber, tomato, and red onion', 'A0000001-0001-0001-0001-000000000002', 13.25, 290, 1, 1, 1, 8, NULL),
    ('B0000001-0001-0001-0001-000000000006', N'Grilled Salmon', N'Atlantic salmon with lemon dill sauce, roasted vegetables, and rice pilaf', 'A0000001-0001-0001-0001-000000000003', 28.95, 620, 0, 1, 1, 25, NULL),
    ('B0000001-0001-0001-0001-000000000007', N'Filet Mignon', N'8oz center-cut beef tenderloin with garlic mashed potatoes and asparagus', 'A0000001-0001-0001-0001-000000000003', 42.00, 780, 0, 1, 1, 30, NULL),
    ('B0000001-0001-0001-0001-000000000008', N'Herb Roasted Chicken', N'Half chicken roasted with herbs, fingerling potatoes, and seasonal vegetables', 'A0000001-0001-0001-0001-000000000003', 24.50, 710, 0, 1, 1, 35, NULL),
    ('B0000001-0001-0001-0001-000000000009', N'Pan-Seared Duck Breast', N'With cherry reduction, wild rice, and braised greens', 'A0000001-0001-0001-0001-000000000003', 36.00, 690, 0, 1, 1, 28, NULL),
    ('B0000001-0001-0001-0001-000000000010', N'Vegetable Stir Fry', N'Seasonal vegetables wok-tossed with ginger soy glaze over jasmine rice', 'A0000001-0001-0001-0001-000000000003', 18.95, 420, 1, 1, 1, 15, NULL),
    ('B0000001-0001-0001-0001-000000000011', N'Spaghetti Carbonara', N'Traditional carbonara with pancetta, egg, parmesan, and black pepper', 'A0000001-0001-0001-0001-000000000004', 19.50, 680, 0, 0, 1, 18, NULL),
    ('B0000001-0001-0001-0001-000000000012', N'Fettuccine Alfredo', N'Creamy parmesan sauce over fresh fettuccine with grilled chicken', 'A0000001-0001-0001-0001-000000000004', 21.00, 820, 0, 0, 1, 20, NULL),
    ('B0000001-0001-0001-0001-000000000013', N'Penne Arrabbiata', N'Spicy tomato sauce with garlic, chili flakes, and fresh basil', 'A0000001-0001-0001-0001-000000000004', 16.50, 540, 1, 0, 1, 15, NULL),
    ('B0000001-0001-0001-0001-000000000014', N'Lobster Ravioli', N'Handmade ravioli filled with lobster in a saffron cream sauce', 'A0000001-0001-0001-0001-000000000004', 32.00, 720, 0, 0, 1, 22, NULL),
    ('B0000001-0001-0001-0001-000000000015', N'Tiramisu', N'Classic Italian layered dessert with espresso-soaked ladyfingers and mascarpone', 'A0000001-0001-0001-0001-000000000005', 10.50, 450, 1, 0, 1, 5, NULL),
    ('B0000001-0001-0001-0001-000000000016', N'Chocolate Lava Cake', N'Warm molten chocolate cake with vanilla bean ice cream', 'A0000001-0001-0001-0001-000000000005', 12.00, 580, 1, 0, 1, 15, NULL),
    ('B0000001-0001-0001-0001-000000000017', N'Creme Brulee', N'Vanilla custard with caramelized sugar crust', 'A0000001-0001-0001-0001-000000000005', 9.50, 320, 1, 1, 1, 5, NULL),
    ('B0000001-0001-0001-0001-000000000018', N'House Red Wine', N'Glass of Chianti Classico', 'A0000001-0001-0001-0001-000000000006', 12.00, 125, 1, 1, 1, 2, NULL),
    ('B0000001-0001-0001-0001-000000000019', N'Craft IPA', N'Local brewery India Pale Ale on draft', 'A0000001-0001-0001-0001-000000000006', 8.50, 210, 1, 0, 1, 2, NULL),
    ('B0000001-0001-0001-0001-000000000020', N'Sparkling Water', N'San Pellegrino sparkling mineral water', 'A0000001-0001-0001-0001-000000000006', 4.50, 0, 1, 1, 1, 1, NULL);
GO

-- TableSeating (10)
INSERT INTO sample_rest.TableSeating (ID, TableNumber, Capacity, Section, IsActive) VALUES
    ('C0000001-0001-0001-0001-000000000001', 'T1', 2, 'Main', 1),
    ('C0000001-0001-0001-0001-000000000002', 'T2', 2, 'Main', 1),
    ('C0000001-0001-0001-0001-000000000003', 'T3', 4, 'Main', 1),
    ('C0000001-0001-0001-0001-000000000004', 'T4', 4, 'Main', 1),
    ('C0000001-0001-0001-0001-000000000005', 'T5', 6, 'Main', 1),
    ('C0000001-0001-0001-0001-000000000006', 'B1', 4, 'Bar', 1),
    ('C0000001-0001-0001-0001-000000000007', 'B2', 4, 'Bar', 1),
    ('C0000001-0001-0001-0001-000000000008', 'P1', 6, 'Patio', 1),
    ('C0000001-0001-0001-0001-000000000009', 'P2', 8, 'Patio', 1),
    ('C0000001-0001-0001-0001-000000000010', 'VIP1', 10, 'Private', 1);
GO

-- Staff (8)
INSERT INTO sample_rest.Staff (ID, FirstName, LastName, Email, Phone, Role, HourlyRate, HireDate, IsActive) VALUES
    ('D0000001-0001-0001-0001-000000000001', N'Maria', N'Gonzalez', N'maria.g@bellavista.com', '555-0101', 'Manager', 32.00, '2019-03-15', 1),
    ('D0000001-0001-0001-0001-000000000002', N'James', N'Chen', N'james.c@bellavista.com', '555-0102', 'Chef', 28.00, '2019-06-01', 1),
    ('D0000001-0001-0001-0001-000000000003', N'Sophie', N'Laurent', N'sophie.l@bellavista.com', '555-0103', 'Server', 15.00, '2020-01-10', 1),
    ('D0000001-0001-0001-0001-000000000004', N'Marcus', N'Williams', N'marcus.w@bellavista.com', '555-0104', 'Server', 15.00, '2020-08-20', 1),
    ('D0000001-0001-0001-0001-000000000005', N'Elena', N'Rossi', N'elena.r@bellavista.com', '555-0105', 'Server', 16.00, '2021-02-14', 1),
    ('D0000001-0001-0001-0001-000000000006', N'Tyler', N'Brooks', N'tyler.b@bellavista.com', '555-0106', 'Bartender', 18.00, '2021-05-01', 1),
    ('D0000001-0001-0001-0001-000000000007', N'Aisha', N'Patel', N'aisha.p@bellavista.com', '555-0107', 'Host', 14.00, '2022-03-10', 1),
    ('D0000001-0001-0001-0001-000000000008', N'Ryan', N'O''Brien', N'ryan.o@bellavista.com', '555-0108', 'Busser', 12.50, '2023-06-15', 1);
GO

-- Reservation (10)
INSERT INTO sample_rest.Reservation (ID, GuestName, GuestPhone, GuestEmail, PartySize, TableID, ReservationDate, ReservationTime, Status, Notes) VALUES
    ('E0000001-0001-0001-0001-000000000001', N'Robert Thompson', '555-2001', N'r.thompson@email.com', 2, 'C0000001-0001-0001-0001-000000000001', '2026-02-23', '18:00', 'Confirmed', N'Anniversary dinner'),
    ('E0000001-0001-0001-0001-000000000002', N'Jennifer Liu', '555-2002', N'j.liu@email.com', 4, 'C0000001-0001-0001-0001-000000000003', '2026-02-23', '18:30', 'Confirmed', NULL),
    ('E0000001-0001-0001-0001-000000000003', N'Michael Brown', '555-2003', NULL, 6, 'C0000001-0001-0001-0001-000000000005', '2026-02-23', '19:00', 'Confirmed', N'Birthday celebration, need cake'),
    ('E0000001-0001-0001-0001-000000000004', N'Sarah Kim', '555-2004', N's.kim@email.com', 2, 'C0000001-0001-0001-0001-000000000002', '2026-02-23', '19:30', 'Confirmed', NULL),
    ('E0000001-0001-0001-0001-000000000005', N'David Garcia', '555-2005', N'd.garcia@email.com', 8, 'C0000001-0001-0001-0001-000000000009', '2026-02-23', '20:00', 'Confirmed', N'Business dinner, need quiet area'),
    ('E0000001-0001-0001-0001-000000000006', N'Amanda White', '555-2006', NULL, 3, NULL, '2026-02-24', '18:00', 'Confirmed', NULL),
    ('E0000001-0001-0001-0001-000000000007', N'Chris Martinez', '555-2007', N'c.martinez@email.com', 2, 'C0000001-0001-0001-0001-000000000006', '2026-02-24', '19:00', 'Confirmed', N'Prefers bar seating'),
    ('E0000001-0001-0001-0001-000000000008', N'Laura Johnson', '555-2008', N'l.johnson@email.com', 10, 'C0000001-0001-0001-0001-000000000010', '2026-02-25', '18:30', 'Confirmed', N'Large party, prix fixe menu'),
    ('E0000001-0001-0001-0001-000000000009', N'Kevin Nguyen', '555-2009', N'k.nguyen@email.com', 4, 'C0000001-0001-0001-0001-000000000004', '2026-02-20', '19:00', 'Completed', NULL),
    ('E0000001-0001-0001-0001-000000000010', N'Rachel Adams', '555-2010', NULL, 2, 'C0000001-0001-0001-0001-000000000001', '2026-02-21', '20:00', 'NoShow', N'Called to cancel late');
GO

-- CustomerOrder (15)
INSERT INTO sample_rest.CustomerOrder (ID, OrderNumber, TableID, ServerID, OrderDate, Status, SubTotal, TaxAmount, TipAmount, TotalAmount, IsPaid, PaidAt, PaymentMethod) VALUES
    ('F0000001-0001-0001-0001-000000000001', 'ORD-20260220-001', 'C0000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000003', '2026-02-20 18:15:00', 'Closed', 67.40, 5.39, 13.48, 86.27, 1, '2026-02-20 19:45:00', 'Card'),
    ('F0000001-0001-0001-0001-000000000002', 'ORD-20260220-002', 'C0000001-0001-0001-0001-000000000003', 'D0000001-0001-0001-0001-000000000004', '2026-02-20 18:30:00', 'Closed', 124.85, 9.99, 25.00, 159.84, 1, '2026-02-20 20:10:00', 'Card'),
    ('F0000001-0001-0001-0001-000000000003', 'ORD-20260220-003', 'C0000001-0001-0001-0001-000000000005', 'D0000001-0001-0001-0001-000000000005', '2026-02-20 19:00:00', 'Closed', 198.50, 15.88, 40.00, 254.38, 1, '2026-02-20 21:00:00', 'Card'),
    ('F0000001-0001-0001-0001-000000000004', 'ORD-20260220-004', 'C0000001-0001-0001-0001-000000000006', 'D0000001-0001-0001-0001-000000000003', '2026-02-20 19:30:00', 'Closed', 45.00, 3.60, 9.00, 57.60, 1, '2026-02-20 20:45:00', 'Cash'),
    ('F0000001-0001-0001-0001-000000000005', 'ORD-20260220-005', 'C0000001-0001-0001-0001-000000000008', 'D0000001-0001-0001-0001-000000000004', '2026-02-20 20:00:00', 'Closed', 156.30, 12.50, 31.26, 200.06, 1, '2026-02-20 21:45:00', 'Card'),
    ('F0000001-0001-0001-0001-000000000006', 'ORD-20260221-001', 'C0000001-0001-0001-0001-000000000002', 'D0000001-0001-0001-0001-000000000005', '2026-02-21 18:00:00', 'Closed', 89.90, 7.19, 18.00, 115.09, 1, '2026-02-21 19:30:00', 'Card'),
    ('F0000001-0001-0001-0001-000000000007', 'ORD-20260221-002', 'C0000001-0001-0001-0001-000000000004', 'D0000001-0001-0001-0001-000000000003', '2026-02-21 18:45:00', 'Closed', 112.00, 8.96, 20.00, 140.96, 1, '2026-02-21 20:15:00', 'Cash'),
    ('F0000001-0001-0001-0001-000000000008', 'ORD-20260221-003', 'C0000001-0001-0001-0001-000000000009', 'D0000001-0001-0001-0001-000000000004', '2026-02-21 19:15:00', 'Closed', 287.45, 22.99, 57.49, 367.93, 1, '2026-02-21 21:30:00', 'Card'),
    ('F0000001-0001-0001-0001-000000000009', 'ORD-20260221-004', 'C0000001-0001-0001-0001-000000000007', 'D0000001-0001-0001-0001-000000000005', '2026-02-21 20:00:00', 'Closed', 53.50, 4.28, 10.70, 68.48, 1, '2026-02-21 21:15:00', 'Card'),
    ('F0000001-0001-0001-0001-000000000010', 'ORD-20260222-001', 'C0000001-0001-0001-0001-000000000001', 'D0000001-0001-0001-0001-000000000003', '2026-02-22 18:00:00', 'Closed', 78.90, 6.31, 15.78, 100.99, 1, '2026-02-22 19:30:00', 'Card'),
    ('F0000001-0001-0001-0001-000000000011', 'ORD-20260222-002', 'C0000001-0001-0001-0001-000000000005', 'D0000001-0001-0001-0001-000000000005', '2026-02-22 18:30:00', 'Closed', 165.80, 13.26, 33.16, 212.22, 1, '2026-02-22 20:30:00', 'Card'),
    ('F0000001-0001-0001-0001-000000000012', 'ORD-20260222-003', 'C0000001-0001-0001-0001-000000000010', 'D0000001-0001-0001-0001-000000000004', '2026-02-22 19:00:00', 'Closed', 342.00, 27.36, 68.40, 437.76, 1, '2026-02-22 21:30:00', 'Card'),
    ('F0000001-0001-0001-0001-000000000013', 'ORD-20260223-001', 'C0000001-0001-0001-0001-000000000003', 'D0000001-0001-0001-0001-000000000003', '2026-02-23 18:00:00', 'InProgress', 95.40, 7.63, 0, 103.03, 0, NULL, NULL),
    ('F0000001-0001-0001-0001-000000000014', 'ORD-20260223-002', 'C0000001-0001-0001-0001-000000000008', 'D0000001-0001-0001-0001-000000000005', '2026-02-23 18:30:00', 'Open', 42.00, 3.36, 0, 45.36, 0, NULL, NULL),
    ('F0000001-0001-0001-0001-000000000015', 'ORD-20260223-003', 'C0000001-0001-0001-0001-000000000006', 'D0000001-0001-0001-0001-000000000004', '2026-02-23 19:00:00', 'Open', 28.50, 2.28, 0, 30.78, 0, NULL, NULL);
GO

-- OrderItem (items for the 15 orders above)
INSERT INTO sample_rest.OrderItem (ID, OrderID, MenuItemID, Quantity, UnitPrice, SpecialInstructions, Status) VALUES
    -- Order 1 (ORD-20260220-001): couple dinner
    ('AA000001-0001-0001-0001-000000000001', 'F0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000001', 1, 12.95, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000002', 'F0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000006', 1, 28.95, N'Medium rare', 'Served'),
    ('AA000001-0001-0001-0001-000000000003', 'F0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000013', 1, 16.50, N'Extra spicy', 'Served'),
    ('AA000001-0001-0001-0001-000000000004', 'F0000001-0001-0001-0001-000000000001', 'B0000001-0001-0001-0001-000000000020', 2, 4.50, NULL, 'Served'),
    -- Order 2 (ORD-20260220-002): family of 4
    ('AA000001-0001-0001-0001-000000000005', 'F0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000002', 2, 14.50, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000006', 'F0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000007', 1, 42.00, N'Well done', 'Served'),
    ('AA000001-0001-0001-0001-000000000007', 'F0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000008', 1, 24.50, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000008', 'F0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000015', 2, 10.50, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000009', 'F0000001-0001-0001-0001-000000000002', 'B0000001-0001-0001-0001-000000000019', 2, 8.50, NULL, 'Served'),
    -- Order 3 (ORD-20260220-003): large party
    ('AA000001-0001-0001-0001-000000000010', 'F0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000003', 3, 16.95, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000011', 'F0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000005', 2, 13.25, N'No olives', 'Served'),
    ('AA000001-0001-0001-0001-000000000012', 'F0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000007', 2, 42.00, N'One rare, one medium', 'Served'),
    ('AA000001-0001-0001-0001-000000000013', 'F0000001-0001-0001-0001-000000000003', 'B0000001-0001-0001-0001-000000000018', 4, 12.00, NULL, 'Served'),
    -- Order 4 (ORD-20260220-004): bar quick meal
    ('AA000001-0001-0001-0001-000000000014', 'F0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000004', 1, 11.50, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000015', 'F0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000011', 1, 19.50, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000016', 'F0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000019', 1, 8.50, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000017', 'F0000001-0001-0001-0001-000000000004', 'B0000001-0001-0001-0001-000000000020', 1, 4.50, NULL, 'Served'),
    -- Order 5 (ORD-20260220-005): patio group
    ('AA000001-0001-0001-0001-000000000018', 'F0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000001', 2, 12.95, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000019', 'F0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000009', 2, 36.00, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000020', 'F0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000014', 1, 32.00, N'Shellfish allergy check', 'Served'),
    ('AA000001-0001-0001-0001-000000000021', 'F0000001-0001-0001-0001-000000000005', 'B0000001-0001-0001-0001-000000000016', 2, 12.00, NULL, 'Served'),
    -- Order 6 (ORD-20260221-001)
    ('AA000001-0001-0001-0001-000000000022', 'F0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000004', 2, 11.50, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000023', 'F0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000006', 1, 28.95, N'No dill', 'Served'),
    ('AA000001-0001-0001-0001-000000000024', 'F0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000010', 1, 18.95, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000025', 'F0000001-0001-0001-0001-000000000006', 'B0000001-0001-0001-0001-000000000017', 2, 9.50, NULL, 'Served'),
    -- Order 7 (ORD-20260221-002)
    ('AA000001-0001-0001-0001-000000000026', 'F0000001-0001-0001-0001-000000000007', 'B0000001-0001-0001-0001-000000000002', 1, 14.50, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000027', 'F0000001-0001-0001-0001-000000000007', 'B0000001-0001-0001-0001-000000000007', 1, 42.00, N'Medium', 'Served'),
    ('AA000001-0001-0001-0001-000000000028', 'F0000001-0001-0001-0001-000000000007', 'B0000001-0001-0001-0001-000000000012', 1, 21.00, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000029', 'F0000001-0001-0001-0001-000000000007', 'B0000001-0001-0001-0001-000000000015', 1, 10.50, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000030', 'F0000001-0001-0001-0001-000000000007', 'B0000001-0001-0001-0001-000000000018', 2, 12.00, NULL, 'Served'),
    -- Order 8 (ORD-20260221-003): large party patio
    ('AA000001-0001-0001-0001-000000000031', 'F0000001-0001-0001-0001-000000000008', 'B0000001-0001-0001-0001-000000000003', 4, 16.95, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000032', 'F0000001-0001-0001-0001-000000000008', 'B0000001-0001-0001-0001-000000000005', 3, 13.25, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000033', 'F0000001-0001-0001-0001-000000000008', 'B0000001-0001-0001-0001-000000000009', 3, 36.00, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000034', 'F0000001-0001-0001-0001-000000000008', 'B0000001-0001-0001-0001-000000000006', 2, 28.95, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000035', 'F0000001-0001-0001-0001-000000000008', 'B0000001-0001-0001-0001-000000000016', 4, 12.00, NULL, 'Served'),
    -- Order 9 (ORD-20260221-004): bar drinks and snacks
    ('AA000001-0001-0001-0001-000000000036', 'F0000001-0001-0001-0001-000000000009', 'B0000001-0001-0001-0001-000000000001', 1, 12.95, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000037', 'F0000001-0001-0001-0001-000000000009', 'B0000001-0001-0001-0001-000000000019', 2, 8.50, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000038', 'F0000001-0001-0001-0001-000000000009', 'B0000001-0001-0001-0001-000000000018', 2, 12.00, NULL, 'Served'),
    -- Order 10 (ORD-20260222-001)
    ('AA000001-0001-0001-0001-000000000039', 'F0000001-0001-0001-0001-000000000010', 'B0000001-0001-0001-0001-000000000005', 1, 13.25, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000040', 'F0000001-0001-0001-0001-000000000010', 'B0000001-0001-0001-0001-000000000008', 1, 24.50, N'Gluten free sides only', 'Served'),
    ('AA000001-0001-0001-0001-000000000041', 'F0000001-0001-0001-0001-000000000010', 'B0000001-0001-0001-0001-000000000017', 1, 9.50, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000042', 'F0000001-0001-0001-0001-000000000010', 'B0000001-0001-0001-0001-000000000018', 1, 12.00, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000043', 'F0000001-0001-0001-0001-000000000010', 'B0000001-0001-0001-0001-000000000020', 2, 4.50, NULL, 'Served'),
    -- Order 11 (ORD-20260222-002)
    ('AA000001-0001-0001-0001-000000000044', 'F0000001-0001-0001-0001-000000000011', 'B0000001-0001-0001-0001-000000000002', 2, 14.50, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000045', 'F0000001-0001-0001-0001-000000000011', 'B0000001-0001-0001-0001-000000000007', 2, 42.00, N'One medium rare, one well done', 'Served'),
    ('AA000001-0001-0001-0001-000000000046', 'F0000001-0001-0001-0001-000000000011', 'B0000001-0001-0001-0001-000000000010', 1, 18.95, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000047', 'F0000001-0001-0001-0001-000000000011', 'B0000001-0001-0001-0001-000000000015', 2, 10.50, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000048', 'F0000001-0001-0001-0001-000000000011', 'B0000001-0001-0001-0001-000000000018', 3, 12.00, NULL, 'Served'),
    -- Order 12 (ORD-20260222-003): VIP large party
    ('AA000001-0001-0001-0001-000000000049', 'F0000001-0001-0001-0001-000000000012', 'B0000001-0001-0001-0001-000000000003', 5, 16.95, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000050', 'F0000001-0001-0001-0001-000000000012', 'B0000001-0001-0001-0001-000000000007', 4, 42.00, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000051', 'F0000001-0001-0001-0001-000000000012', 'B0000001-0001-0001-0001-000000000014', 3, 32.00, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000052', 'F0000001-0001-0001-0001-000000000012', 'B0000001-0001-0001-0001-000000000016', 5, 12.00, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000053', 'F0000001-0001-0001-0001-000000000012', 'B0000001-0001-0001-0001-000000000018', 6, 12.00, NULL, 'Served'),
    -- Order 13 (ORD-20260223-001): in progress today
    ('AA000001-0001-0001-0001-000000000054', 'F0000001-0001-0001-0001-000000000013', 'B0000001-0001-0001-0001-000000000001', 1, 12.95, NULL, 'Served'),
    ('AA000001-0001-0001-0001-000000000055', 'F0000001-0001-0001-0001-000000000013', 'B0000001-0001-0001-0001-000000000006', 2, 28.95, N'One with extra lemon', 'Preparing'),
    ('AA000001-0001-0001-0001-000000000056', 'F0000001-0001-0001-0001-000000000013', 'B0000001-0001-0001-0001-000000000011', 1, 19.50, NULL, 'Pending'),
    ('AA000001-0001-0001-0001-000000000057', 'F0000001-0001-0001-0001-000000000013', 'B0000001-0001-0001-0001-000000000020', 1, 4.50, NULL, 'Served'),
    -- Order 14 (ORD-20260223-002): open today
    ('AA000001-0001-0001-0001-000000000058', 'F0000001-0001-0001-0001-000000000014', 'B0000001-0001-0001-0001-000000000007', 1, 42.00, N'Rare', 'Pending'),
    -- Order 15 (ORD-20260223-003): open today bar
    ('AA000001-0001-0001-0001-000000000059', 'F0000001-0001-0001-0001-000000000015', 'B0000001-0001-0001-0001-000000000002', 1, 14.50, NULL, 'Pending'),
    ('AA000001-0001-0001-0001-000000000060', 'F0000001-0001-0001-0001-000000000015', 'B0000001-0001-0001-0001-000000000019', 1, 8.50, NULL, 'Pending'),
    ('AA000001-0001-0001-0001-000000000061', 'F0000001-0001-0001-0001-000000000015', 'B0000001-0001-0001-0001-000000000020', 1, 4.50, NULL, 'Pending');
GO

-- DailyRevenue (5 entries)
INSERT INTO sample_rest.DailyRevenue (ID, BusinessDate, TotalOrders, TotalRevenue, TotalTips, CustomerCount, Notes) VALUES
    ('FA000001-0001-0001-0001-000000000001', '2026-02-19', 18, 3245.60, 584.21, 62, N'Wednesday - steady evening'),
    ('FA000001-0001-0001-0001-000000000002', '2026-02-20', 22, 4156.80, 748.22, 78, N'Thursday - busier than usual'),
    ('FA000001-0001-0001-0001-000000000003', '2026-02-21', 28, 5890.45, 1060.28, 95, N'Friday - full house, waitlist active'),
    ('FA000001-0001-0001-0001-000000000004', '2026-02-22', 32, 6720.30, 1209.65, 112, N'Saturday peak night'),
    ('FA000001-0001-0001-0001-000000000005', '2026-02-23', 8, 1250.00, 0, 24, N'Sunday - still open, partial day');
GO
