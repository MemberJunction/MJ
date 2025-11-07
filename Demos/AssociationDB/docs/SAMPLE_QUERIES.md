# Association Sample Database - Sample Queries

Common queries for reports, analytics, and data exploration.

## 📊 Membership Analytics

### Active Member Count by Type
```sql
SELECT
    mt.Name as MembershipType,
    COUNT(DISTINCT ms.MemberID) as ActiveMembers,
    mt.AnnualDues,
    COUNT(DISTINCT ms.MemberID) * mt.AnnualDues as AnnualDuesRevenue
FROM membership.Membership ms
    JOIN membership.MembershipType mt ON ms.MembershipTypeID = mt.ID
WHERE ms.Status = 'Active'
  AND ms.EndDate >= GETDATE()
GROUP BY mt.Name, mt.AnnualDues
ORDER BY ActiveMembers DESC;
```

### Members by Industry
```sql
SELECT
    Industry,
    COUNT(*) as MemberCount,
    AVG(YearsInProfession) as AvgExperience
FROM membership.Member
GROUP BY Industry
ORDER BY MemberCount DESC;
```

### Member Retention Analysis
```sql
WITH MemberRetention AS (
    SELECT
        m.ID,
        m.FirstName + ' ' + m.LastName as MemberName,
        m.JoinDate,
        COUNT(ms.ID) as RenewalCount,
        MAX(ms.EndDate) as CurrentEndDate,
        CASE
            WHEN MAX(ms.EndDate) >= GETDATE() THEN 'Retained'
            ELSE 'Lapsed'
        END as RetentionStatus
    FROM membership.Member m
        JOIN membership.Membership ms ON m.ID = ms.MemberID
    GROUP BY m.ID, m.FirstName, m.LastName, m.JoinDate
)
SELECT
    RetentionStatus,
    COUNT(*) as MemberCount,
    AVG(RenewalCount) as AvgRenewals,
    AVG(DATEDIFF(DAY, JoinDate, GETDATE())) / 365.0 as AvgYearsAsMember
FROM MemberRetention
GROUP BY RetentionStatus;
```

### Top Organizations by Member Count
```sql
SELECT
    o.Name as Organization,
    o.Industry,
    COUNT(m.ID) as MemberCount,
    o.EmployeeCount,
    CAST(COUNT(m.ID) as FLOAT) / NULLIF(o.EmployeeCount, 0) * 100 as PenetrationRate
FROM membership.Organization o
    LEFT JOIN membership.Member m ON o.ID = m.OrganizationID
WHERE o.EmployeeCount IS NOT NULL
GROUP BY o.Name, o.Industry, o.EmployeeCount
HAVING COUNT(m.ID) > 0
ORDER BY MemberCount DESC;
```

---

## 📅 Event Analytics

### Event Attendance Summary
```sql
SELECT
    e.Name as EventName,
    e.EventType,
    e.StartDate,
    e.Capacity,
    COUNT(DISTINCT er.ID) as TotalRegistrations,
    COUNT(DISTINCT CASE WHEN er.Status = 'Attended' THEN er.ID END) as ActualAttendance,
    CAST(COUNT(DISTINCT CASE WHEN er.Status = 'Attended' THEN er.ID END) as FLOAT) /
        NULLIF(COUNT(DISTINCT er.ID), 0) * 100 as AttendanceRate,
    CAST(COUNT(DISTINCT er.ID) as FLOAT) / NULLIF(e.Capacity, 0) * 100 as CapacityUtilization
FROM events.Event e
    LEFT JOIN events.EventRegistration er ON e.ID = er.EventID
WHERE e.Status = 'Completed'
GROUP BY e.Name, e.EventType, e.StartDate, e.Capacity
ORDER BY e.StartDate DESC;
```

### Event Revenue by Type
```sql
SELECT
    e.EventType,
    COUNT(DISTINCT e.ID) as EventCount,
    COUNT(DISTINCT er.ID) as TotalRegistrations,
    SUM(ili.Amount) as TotalRevenue,
    AVG(ili.Amount) as AvgRevenuePerRegistration
FROM events.Event e
    JOIN events.EventRegistration er ON e.ID = er.EventID
    JOIN finance.InvoiceLineItem ili ON er.ID = CAST(ili.RelatedEntityID as UNIQUEIDENTIFIER)
WHERE ili.ItemType = 'Event Registration'
  AND ili.RelatedEntityType = 'EventRegistration'
GROUP BY e.EventType
ORDER BY TotalRevenue DESC;
```

### Most Popular Event Sessions
```sql
SELECT TOP 10
    es.Name as SessionName,
    e.Name as EventName,
    es.SpeakerName,
    es.SessionType,
    COUNT(DISTINCT er.ID) as Attendees,
    es.Capacity,
    CAST(COUNT(DISTINCT er.ID) as FLOAT) / NULLIF(es.Capacity, 0) * 100 as CapacityUtilization
FROM events.EventSession es
    JOIN events.Event e ON es.EventID = e.ID
    JOIN events.EventRegistration er ON e.ID = er.EventID
WHERE er.Status IN ('Attended', 'Registered')
GROUP BY es.Name, e.Name, es.SpeakerName, es.SessionType, es.Capacity
ORDER BY Attendees DESC;
```

### CEU Credits Awarded
```sql
SELECT
    m.FirstName + ' ' + m.LastName as MemberName,
    m.Email,
    COUNT(DISTINCT er.ID) as EventsAttended,
    SUM(e.CEUCredits) as TotalCEUCredits,
    MAX(er.CEUAwardedDate) as LastCEUAwardDate
FROM membership.Member m
    JOIN events.EventRegistration er ON m.ID = er.MemberID
    JOIN events.Event e ON er.EventID = e.ID
WHERE er.CEUAwarded = 1
GROUP BY m.FirstName, m.LastName, m.Email
ORDER BY TotalCEUCredits DESC;
```

---

## 🎓 Learning Analytics

### Course Enrollment and Completion Rates
```sql
SELECT
    c.Category,
    COUNT(DISTINCT c.ID) as CourseCount,
    COUNT(DISTINCT e.ID) as TotalEnrollments,
    COUNT(DISTINCT CASE WHEN e.Status = 'Completed' THEN e.ID END) as Completions,
    COUNT(DISTINCT CASE WHEN e.Passed = 1 THEN e.ID END) as Passed,
    CAST(COUNT(DISTINCT CASE WHEN e.Status = 'Completed' THEN e.ID END) as FLOAT) /
        NULLIF(COUNT(DISTINCT e.ID), 0) * 100 as CompletionRate,
    CAST(COUNT(DISTINCT CASE WHEN e.Passed = 1 THEN e.ID END) as FLOAT) /
        NULLIF(COUNT(DISTINCT CASE WHEN e.Status = 'Completed' THEN e.ID END), 0) * 100 as PassRate
FROM learning.Course c
    LEFT JOIN learning.Enrollment e ON c.ID = e.CourseID
GROUP BY c.Category
ORDER BY TotalEnrollments DESC;
```

### Most Popular Courses
```sql
SELECT TOP 10
    c.Title,
    c.Category,
    c.Level,
    c.DurationHours,
    COUNT(DISTINCT e.ID) as Enrollments,
    AVG(CASE WHEN e.FinalScore IS NOT NULL THEN e.FinalScore END) as AvgScore,
    COUNT(DISTINCT cert.ID) as CertificatesIssued
FROM learning.Course c
    LEFT JOIN learning.Enrollment e ON c.ID = e.CourseID
    LEFT JOIN learning.Certificate cert ON e.ID = cert.EnrollmentID
GROUP BY c.Title, c.Category, c.Level, c.DurationHours
ORDER BY Enrollments DESC;
```

### Learning Path Analysis
```sql
-- Members with most courses completed
SELECT TOP 20
    m.FirstName + ' ' + m.LastName as MemberName,
    m.JobFunction,
    COUNT(DISTINCT e.ID) as CoursesCompleted,
    SUM(c.CEUCredits) as TotalCEUCredits,
    SUM(e.TimeSpentMinutes) / 60.0 as TotalHoursSpent,
    AVG(e.FinalScore) as AvgScore
FROM membership.Member m
    JOIN learning.Enrollment e ON m.ID = e.MemberID
    JOIN learning.Course c ON e.CourseID = c.ID
WHERE e.Status = 'Completed'
GROUP BY m.FirstName, m.LastName, m.JobFunction
ORDER BY CoursesCompleted DESC;
```

### Course Prerequisites Analysis
```sql
SELECT
    c.Title as Course,
    c.Level,
    prereq.Title as PrerequisiteCourse,
    COUNT(DISTINCT e.ID) as Enrollments
FROM learning.Course c
    LEFT JOIN learning.Course prereq ON c.PrerequisiteCourseID = prereq.ID
    LEFT JOIN learning.Enrollment e ON c.ID = e.CourseID
WHERE c.PrerequisiteCourseID IS NOT NULL
GROUP BY c.Title, c.Level, prereq.Title
ORDER BY Enrollments DESC;
```

---

## 💰 Financial Analytics

### Revenue Summary by Source
```sql
SELECT
    ili.ItemType,
    COUNT(DISTINCT i.ID) as InvoiceCount,
    SUM(ili.Amount) as TotalRevenue,
    AVG(ili.Amount) as AvgAmount
FROM finance.Invoice i
    JOIN finance.InvoiceLineItem ili ON i.ID = ili.InvoiceID
WHERE i.Status IN ('Paid', 'Partial')
GROUP BY ili.ItemType
ORDER BY TotalRevenue DESC;
```

### Payment Method Distribution
```sql
SELECT
    p.PaymentMethod,
    COUNT(*) as TransactionCount,
    SUM(p.Amount) as TotalAmount,
    AVG(p.Amount) as AvgTransactionSize,
    COUNT(CASE WHEN p.Status = 'Completed' THEN 1 END) as Successful,
    COUNT(CASE WHEN p.Status = 'Failed' THEN 1 END) as Failed,
    CAST(COUNT(CASE WHEN p.Status = 'Completed' THEN 1 END) as FLOAT) /
        NULLIF(COUNT(*), 0) * 100 as SuccessRate
FROM finance.Payment p
GROUP BY p.PaymentMethod
ORDER BY TotalAmount DESC;
```

### Outstanding Invoices Report
```sql
SELECT
    i.InvoiceNumber,
    m.FirstName + ' ' + m.LastName as MemberName,
    m.Email,
    i.InvoiceDate,
    i.DueDate,
    i.Total,
    i.AmountPaid,
    i.Balance,
    DATEDIFF(DAY, i.DueDate, GETDATE()) as DaysPastDue,
    CASE
        WHEN DATEDIFF(DAY, i.DueDate, GETDATE()) <= 30 THEN '0-30 days'
        WHEN DATEDIFF(DAY, i.DueDate, GETDATE()) <= 60 THEN '31-60 days'
        WHEN DATEDIFF(DAY, i.DueDate, GETDATE()) <= 90 THEN '61-90 days'
        ELSE '90+ days'
    END as AgingBucket
FROM finance.Invoice i
    JOIN membership.Member m ON i.MemberID = m.ID
WHERE i.Status IN ('Sent', 'Partial', 'Overdue')
  AND i.Balance > 0
ORDER BY DaysPastDue DESC;
```

### Revenue Trend by Month
```sql
SELECT
    YEAR(i.InvoiceDate) as Year,
    MONTH(i.InvoiceDate) as Month,
    DATENAME(MONTH, i.InvoiceDate) as MonthName,
    COUNT(DISTINCT i.ID) as InvoiceCount,
    SUM(i.Total) as TotalInvoiced,
    SUM(i.AmountPaid) as TotalPaid,
    SUM(i.Balance) as TotalOutstanding
FROM finance.Invoice i
WHERE i.InvoiceDate >= DATEADD(YEAR, -1, GETDATE())
GROUP BY YEAR(i.InvoiceDate), MONTH(i.InvoiceDate), DATENAME(MONTH, i.InvoiceDate)
ORDER BY Year DESC, Month DESC;
```

---

## 📧 Marketing & Email Analytics

### Email Campaign Performance
```sql
SELECT
    c.Name as CampaignName,
    c.CampaignType,
    c.Status,
    COUNT(DISTINCT es.ID) as EmailsSent,
    COUNT(DISTINCT CASE WHEN es.Status = 'Delivered' THEN es.ID END) as Delivered,
    COUNT(DISTINCT CASE WHEN es.OpenedDate IS NOT NULL THEN es.ID END) as Opened,
    COUNT(DISTINCT CASE WHEN es.ClickedDate IS NOT NULL THEN es.ID END) as Clicked,
    COUNT(DISTINCT CASE WHEN es.BouncedDate IS NOT NULL THEN es.ID END) as Bounced,
    CAST(COUNT(DISTINCT CASE WHEN es.Status = 'Delivered' THEN es.ID END) as FLOAT) /
        NULLIF(COUNT(DISTINCT es.ID), 0) * 100 as DeliveryRate,
    CAST(COUNT(DISTINCT CASE WHEN es.OpenedDate IS NOT NULL THEN es.ID END) as FLOAT) /
        NULLIF(COUNT(DISTINCT CASE WHEN es.Status = 'Delivered' THEN es.ID END), 0) * 100 as OpenRate,
    CAST(COUNT(DISTINCT CASE WHEN es.ClickedDate IS NOT NULL THEN es.ID END) as FLOAT) /
        NULLIF(COUNT(DISTINCT CASE WHEN es.OpenedDate IS NOT NULL THEN es.ID END), 0) * 100 as ClickThroughRate
FROM marketing.Campaign c
    LEFT JOIN email.EmailSend es ON c.ID = es.CampaignID
GROUP BY c.Name, c.CampaignType, c.Status
ORDER BY EmailsSent DESC;
```

### Member Engagement Scoring
```sql
SELECT
    m.ID,
    m.FirstName + ' ' + m.LastName as MemberName,
    m.Email,
    -- Email engagement
    COUNT(DISTINCT es.ID) as EmailsReceived,
    COUNT(DISTINCT CASE WHEN es.OpenedDate IS NOT NULL THEN es.ID END) as EmailsOpened,
    COUNT(DISTINCT CASE WHEN es.ClickedDate IS NOT NULL THEN es.ID END) as EmailsClicked,
    -- Event engagement
    COUNT(DISTINCT er.ID) as EventRegistrations,
    COUNT(DISTINCT CASE WHEN er.Status = 'Attended' THEN er.ID END) as EventsAttended,
    -- Learning engagement
    COUNT(DISTINCT enr.ID) as CoursesEnrolled,
    COUNT(DISTINCT CASE WHEN enr.Status = 'Completed' THEN enr.ID END) as CoursesCompleted,
    -- Engagement score (weighted)
    (COUNT(DISTINCT CASE WHEN es.ClickedDate IS NOT NULL THEN es.ID END) * 2) +
    (COUNT(DISTINCT CASE WHEN er.Status = 'Attended' THEN er.ID END) * 5) +
    (COUNT(DISTINCT CASE WHEN enr.Status = 'Completed' THEN enr.ID END) * 10) as EngagementScore
FROM membership.Member m
    LEFT JOIN email.EmailSend es ON m.ID = es.MemberID
    LEFT JOIN events.EventRegistration er ON m.ID = er.MemberID
    LEFT JOIN learning.Enrollment enr ON m.ID = enr.MemberID
WHERE EXISTS (SELECT 1 FROM membership.Membership ms WHERE ms.MemberID = m.ID AND ms.Status = 'Active')
GROUP BY m.ID, m.FirstName, m.LastName, m.Email
ORDER BY EngagementScore DESC;
```

### Segment Analysis
```sql
SELECT
    s.Name as SegmentName,
    s.SegmentType,
    s.MemberCount,
    COUNT(DISTINCT cm.CampaignID) as CampaignsUsed,
    COUNT(DISTINCT CASE WHEN cm.Status = 'Converted' THEN cm.ID END) as Conversions,
    CAST(COUNT(DISTINCT CASE WHEN cm.Status = 'Converted' THEN cm.ID END) as FLOAT) /
        NULLIF(COUNT(DISTINCT cm.ID), 0) * 100 as ConversionRate
FROM marketing.Segment s
    LEFT JOIN marketing.CampaignMember cm ON s.ID = cm.SegmentID
GROUP BY s.Name, s.SegmentType, s.MemberCount
ORDER BY ConversionRate DESC;
```

---

## 🏛️ Chapters & Governance

### Chapter Membership Summary
```sql
SELECT
    c.Name as ChapterName,
    c.ChapterType,
    c.Region,
    c.City + COALESCE(', ' + c.State, '') as Location,
    COUNT(DISTINCT cm.MemberID) as MemberCount,
    COUNT(DISTINCT CASE WHEN cm.Status = 'Active' THEN cm.MemberID END) as ActiveMembers,
    COUNT(DISTINCT co.ID) as OfficerCount,
    c.MeetingFrequency
FROM chapters.Chapter c
    LEFT JOIN chapters.ChapterMembership cm ON c.ID = cm.ChapterID
    LEFT JOIN chapters.ChapterOfficer co ON c.ID = co.ChapterID AND co.IsActive = 1
WHERE c.IsActive = 1
GROUP BY c.Name, c.ChapterType, c.Region, c.City, c.State, c.MeetingFrequency
ORDER BY MemberCount DESC;
```

### Committee Participation
```sql
SELECT
    com.Name as CommitteeName,
    com.CommitteeType,
    com.Purpose,
    COUNT(DISTINCT cm.MemberID) as Members,
    com.MaxMembers,
    CAST(COUNT(DISTINCT cm.MemberID) as FLOAT) / NULLIF(com.MaxMembers, 0) * 100 as CapacityUtilization,
    chair.FirstName + ' ' + chair.LastName as ChairPerson
FROM governance.Committee com
    LEFT JOIN governance.CommitteeMembership cm ON com.ID = cm.CommitteeID AND cm.IsActive = 1
    LEFT JOIN membership.Member chair ON com.ChairMemberID = chair.ID
WHERE com.IsActive = 1
GROUP BY com.Name, com.CommitteeType, com.Purpose, com.MaxMembers, chair.FirstName, chair.LastName
ORDER BY Members DESC;
```

### Board Composition
```sql
SELECT
    bp.PositionTitle,
    bp.IsOfficer,
    bp.TermLengthYears,
    m.FirstName + ' ' + m.LastName as CurrentMember,
    m.Email,
    bm.ElectionDate,
    bm.StartDate,
    DATEADD(YEAR, bp.TermLengthYears, bm.StartDate) as TermExpires,
    DATEDIFF(DAY, bm.StartDate, GETDATE()) / 365.0 as YearsServed
FROM governance.BoardPosition bp
    LEFT JOIN governance.BoardMember bm ON bp.ID = bm.BoardPositionID AND bm.IsActive = 1
    LEFT JOIN membership.Member m ON bm.MemberID = m.ID
WHERE bp.IsActive = 1
ORDER BY bp.PositionOrder;
```

---

## 🔍 Advanced Cross-Domain Queries

### Member Lifetime Value
```sql
SELECT
    m.ID,
    m.FirstName + ' ' + m.LastName as MemberName,
    m.Email,
    m.JoinDate,
    DATEDIFF(DAY, m.JoinDate, GETDATE()) / 365.0 as YearsAsMember,
    -- Revenue
    COALESCE(SUM(i.Total), 0) as TotalRevenue,
    COALESCE(SUM(CASE WHEN ili.ItemType = 'Membership Dues' THEN ili.Amount END), 0) as DuesRevenue,
    COALESCE(SUM(CASE WHEN ili.ItemType = 'Event Registration' THEN ili.Amount END), 0) as EventRevenue,
    COALESCE(SUM(CASE WHEN ili.ItemType = 'Course Enrollment' THEN ili.Amount END), 0) as CourseRevenue,
    -- Engagement
    COUNT(DISTINCT er.ID) as EventsAttended,
    COUNT(DISTINCT enr.ID) as CoursesCompleted,
    COUNT(DISTINCT cm.ChapterID) as ChaptersJoined,
    -- Value metrics
    COALESCE(SUM(i.Total), 0) / NULLIF(DATEDIFF(DAY, m.JoinDate, GETDATE()) / 365.0, 0) as AnnualValue
FROM membership.Member m
    LEFT JOIN finance.Invoice i ON m.ID = i.MemberID AND i.Status IN ('Paid', 'Partial')
    LEFT JOIN finance.InvoiceLineItem ili ON i.ID = ili.InvoiceID
    LEFT JOIN events.EventRegistration er ON m.ID = er.MemberID AND er.Status = 'Attended'
    LEFT JOIN learning.Enrollment enr ON m.ID = enr.MemberID AND enr.Status = 'Completed'
    LEFT JOIN chapters.ChapterMembership cm ON m.ID = cm.MemberID AND cm.Status = 'Active'
GROUP BY m.ID, m.FirstName, m.LastName, m.Email, m.JoinDate
ORDER BY TotalRevenue DESC;
```

### Member Journey Timeline
```sql
-- Timeline of all activities for a specific member
DECLARE @MemberID UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM membership.Member ORDER BY NEWID());

SELECT 'Membership' as ActivityType, ms.Status as Activity, ms.StartDate as ActivityDate, NULL as Details
FROM membership.Membership ms
WHERE ms.MemberID = @MemberID

UNION ALL

SELECT 'Event', e.Name, er.RegistrationDate, er.Status
FROM events.EventRegistration er
    JOIN events.Event e ON er.EventID = e.ID
WHERE er.MemberID = @MemberID

UNION ALL

SELECT 'Course', c.Title, enr.EnrollmentDate, enr.Status
FROM learning.Enrollment enr
    JOIN learning.Course c ON enr.CourseID = c.ID
WHERE enr.MemberID = @MemberID

UNION ALL

SELECT 'Invoice', i.InvoiceNumber, i.InvoiceDate, CAST(i.Total as NVARCHAR) + ' (' + i.Status + ')'
FROM finance.Invoice i
WHERE i.MemberID = @MemberID

UNION ALL

SELECT 'Email', et.Name, es.SentDate, es.Status
FROM email.EmailSend es
    JOIN email.EmailTemplate et ON es.EmailTemplateID = et.ID
WHERE es.MemberID = @MemberID

UNION ALL

SELECT 'Chapter', c.Name, cm.JoinDate, cm.Status
FROM chapters.ChapterMembership cm
    JOIN chapters.Chapter c ON cm.ChapterID = c.ID
WHERE cm.MemberID = @MemberID

ORDER BY ActivityDate DESC;
```

### Engagement Cohort Analysis
```sql
-- Member engagement by join year
SELECT
    YEAR(m.JoinDate) as JoinYear,
    COUNT(DISTINCT m.ID) as TotalMembers,
    COUNT(DISTINCT CASE WHEN ms.Status = 'Active' THEN m.ID END) as StillActive,
    AVG(CAST(eventCount.Events as FLOAT)) as AvgEventsPerMember,
    AVG(CAST(courseCount.Courses as FLOAT)) as AvgCoursesPerMember,
    CAST(COUNT(DISTINCT CASE WHEN ms.Status = 'Active' THEN m.ID END) as FLOAT) /
        NULLIF(COUNT(DISTINCT m.ID), 0) * 100 as RetentionRate
FROM membership.Member m
    LEFT JOIN membership.Membership ms ON m.ID = ms.MemberID AND ms.EndDate >= GETDATE()
    LEFT JOIN (
        SELECT MemberID, COUNT(*) as Events
        FROM events.EventRegistration
        WHERE Status = 'Attended'
        GROUP BY MemberID
    ) eventCount ON m.ID = eventCount.MemberID
    LEFT JOIN (
        SELECT MemberID, COUNT(*) as Courses
        FROM learning.Enrollment
        WHERE Status = 'Completed'
        GROUP BY MemberID
    ) courseCount ON m.ID = courseCount.MemberID
GROUP BY YEAR(m.JoinDate)
ORDER BY JoinYear DESC;
```

---

For detailed schema documentation, see [SCHEMA_OVERVIEW.md](SCHEMA_OVERVIEW.md).

For member journey examples, see [BUSINESS_SCENARIOS.md](BUSINESS_SCENARIOS.md).
