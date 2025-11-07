# Association Sample Database - Business Scenarios

Real-world member journeys and use cases demonstrating how the database supports association operations.

## 🎯 Overview

This document illustrates how different domains work together to support complete member lifecycles and business processes. Each scenario references actual data in the sample database.

---

## 👤 Member Journey Scenarios

### Scenario 1: New Member Onboarding (Sarah Chen)

**Background**: Sarah Chen is a VP of Engineering at TechVentures Inc. who joins the association.

#### Journey Steps:

**Step 1: Registration and Membership**
```sql
-- Sarah creates her profile
SELECT
    m.FirstName + ' ' + m.LastName as Name,
    m.Email,
    m.Title,
    o.Name as Organization,
    m.JoinDate
FROM membership.Member m
    JOIN membership.Organization o ON m.OrganizationID = o.ID
WHERE m.Email = 'sarah.chen@techventures.com';
```

**Results**:
- Name: Sarah Chen
- Email: sarah.chen@techventures.com
- Title: VP of Engineering
- Organization: TechVentures Inc.
- Join Date: 4 years ago

**Step 2: First Membership Purchase**
```sql
-- Sarah's initial Individual Professional membership
SELECT
    mt.Name as MembershipType,
    ms.StartDate,
    ms.EndDate,
    mt.AnnualDues,
    ms.Status
FROM membership.Membership ms
    JOIN membership.MembershipType mt ON ms.MembershipTypeID = mt.ID
    JOIN membership.Member m ON ms.MemberID = m.ID
WHERE m.Email = 'sarah.chen@techventures.com'
ORDER BY ms.StartDate;
```

**Results**: Sarah purchased Individual Professional membership ($295/year) and has renewed 4 times, showing strong retention.

**Step 3: Welcome Email Campaign**
```sql
-- Sarah receives welcome emails
SELECT
    et.Name as TemplateName,
    et.Subject,
    es.SentDate,
    es.OpenedDate,
    es.ClickedDate
FROM email.EmailSend es
    JOIN email.EmailTemplate et ON es.EmailTemplateID = et.ID
    JOIN membership.Member m ON es.MemberID = m.ID
WHERE m.Email = 'sarah.chen@techventures.com'
  AND et.TemplateType = 'Transactional'
ORDER BY es.SentDate
LIMIT 3;
```

**Results**: Sarah opened the welcome email within hours and clicked through to explore resources.

#### Business Value:
- Automated onboarding reduces manual work
- Email tracking shows engagement
- Membership history tracks retention
- Invoicing handled automatically

---

### Scenario 2: Event Lifecycle (Annual Conference Attendee)

**Background**: Michael Johnson, a CTO, registers for and attends the 2024 Annual Technology Leadership Summit.

#### Journey Steps:

**Step 1: Event Discovery via Marketing Campaign**
```sql
-- Michael is in the "C-Level Executives" segment
SELECT
    s.Name as SegmentName,
    s.Description,
    c.Name as CampaignName,
    c.CampaignType
FROM marketing.Segment s
    JOIN marketing.CampaignMember cm ON s.ID = cm.SegmentID
    JOIN marketing.Campaign c ON cm.CampaignID = c.ID
    JOIN membership.Member m ON cm.MemberID = m.ID
WHERE m.Email = 'michael.johnson@cloudscale.io'
  AND c.CampaignType = 'Event Promotion'
ORDER BY cm.AddedDate DESC;
```

**Step 2: Event Registration**
```sql
-- Michael registers for the conference
SELECT
    e.Name as EventName,
    e.EventType,
    e.StartDate,
    e.EndDate,
    er.RegistrationDate,
    er.RegistrationType,
    er.Status
FROM events.Event e
    JOIN events.EventRegistration er ON e.ID = er.EventID
    JOIN membership.Member m ON er.MemberID = m.ID
WHERE m.Email = 'michael.johnson@cloudscale.io'
  AND e.Name LIKE '%2024 Annual%'
ORDER BY er.RegistrationDate DESC;
```

**Results**: Michael registered 45 days before the event (early bird pricing).

**Step 3: Invoice and Payment**
```sql
-- Michael's conference invoice
SELECT
    i.InvoiceNumber,
    i.InvoiceDate,
    ili.Description,
    ili.Amount,
    p.PaymentDate,
    p.PaymentMethod,
    p.Status
FROM finance.Invoice i
    JOIN finance.InvoiceLineItem ili ON i.ID = ili.InvoiceID
    JOIN finance.Payment p ON i.ID = p.InvoiceID
    JOIN membership.Member m ON i.MemberID = m.ID
WHERE m.Email = 'michael.johnson@cloudscale.io'
  AND ili.ItemType = 'Event Registration'
  AND ili.Description LIKE '%2024 Annual%'
ORDER BY i.InvoiceDate DESC;
```

**Results**: Invoice generated automatically, Michael paid via credit card, payment processed successfully.

**Step 4: Pre-Event Communications**
```sql
-- Michael receives pre-event emails
SELECT
    et.Name as EmailType,
    et.Subject,
    es.SentDate,
    es.OpenedDate
FROM email.EmailSend es
    JOIN email.EmailTemplate et ON es.EmailTemplateID = et.ID
    JOIN membership.Member m ON es.MemberID = m.ID
WHERE m.Email = 'michael.johnson@cloudscale.io'
  AND es.SentDate BETWEEN DATEADD(DAY, -30, (SELECT StartDate FROM events.Event WHERE Name LIKE '%2024 Annual%'))
                      AND (SELECT StartDate FROM events.Event WHERE Name LIKE '%2024 Annual%')
ORDER BY es.SentDate;
```

**Results**: Michael received conference agenda, speaker lineup, logistics info, and networking tips.

**Step 5: Event Attendance and Session Participation**
```sql
-- Michael attends sessions
SELECT
    es.Name as SessionName,
    es.SessionType,
    es.SpeakerName,
    es.StartTime,
    es.CEUCredits
FROM events.EventSession es
    JOIN events.Event e ON es.EventID = e.ID
    JOIN events.EventRegistration er ON e.ID = er.EventID
    JOIN membership.Member m ON er.MemberID = m.ID
WHERE m.Email = 'michael.johnson@cloudscale.io'
  AND e.Name LIKE '%2024 Annual%'
  AND er.Status = 'Attended'
ORDER BY es.StartTime;
```

**Step 6: CEU Credits Awarded**
```sql
-- Michael earns continuing education credits
SELECT
    m.FirstName + ' ' + m.LastName as MemberName,
    e.Name as EventName,
    e.CEUCredits,
    er.CEUAwardedDate
FROM events.EventRegistration er
    JOIN events.Event e ON er.EventID = e.ID
    JOIN membership.Member m ON er.MemberID = m.ID
WHERE m.Email = 'michael.johnson@cloudscale.io'
  AND er.CEUAwarded = 1
ORDER BY er.CEUAwardedDate DESC;
```

**Step 7: Post-Event Follow-Up**
```sql
-- Survey and feedback collection
SELECT
    et.Name as EmailType,
    es.SentDate,
    es.OpenedDate,
    es.ClickedDate
FROM email.EmailSend es
    JOIN email.EmailTemplate et ON es.EmailTemplateID = et.ID
    JOIN membership.Member m ON es.MemberID = m.ID
WHERE m.Email = 'michael.johnson@cloudscale.io'
  AND et.Name LIKE '%Post-Event%'
ORDER BY es.SentDate DESC;
```

#### Business Value:
- Complete event lifecycle automation
- Integrated marketing, registration, and invoicing
- Automatic CEU credit tracking
- Post-event engagement and feedback

---

### Scenario 3: Learning Path (Career Development)

**Background**: Emily Rodriguez wants to advance her data science skills through certification courses.

#### Journey Steps:

**Step 1: Course Discovery**
```sql
-- Emily explores data science courses
SELECT
    c.Code,
    c.Title,
    c.Level,
    c.DurationHours,
    c.CEUCredits,
    c.MemberPrice,
    prereq.Title as PrerequisiteCourse
FROM learning.Course c
    LEFT JOIN learning.Course prereq ON c.PrerequisiteCourseID = prereq.ID
WHERE c.Category = 'Data Science'
  AND c.IsActive = 1
ORDER BY c.Level, c.Title;
```

**Results**: Emily finds a learning path from beginner to advanced data science courses.

**Step 2: Course Enrollment**
```sql
-- Emily enrolls in multiple courses
SELECT
    c.Title as CourseName,
    c.Level,
    e.EnrollmentDate,
    e.Status,
    e.ProgressPercentage,
    e.FinalScore
FROM learning.Enrollment e
    JOIN learning.Course c ON e.CourseID = c.ID
    JOIN membership.Member m ON e.MemberID = m.ID
WHERE m.Email = 'emily.rodriguez@datadriven.ai'
ORDER BY e.EnrollmentDate;
```

**Results**: Emily enrolled in 3 courses over 6 months, completing each before starting the next.

**Step 3: Course Progress Tracking**
```sql
-- Track Emily's current course progress
SELECT
    c.Title,
    e.Status,
    e.ProgressPercentage,
    e.TimeSpentMinutes / 60.0 as HoursSpent,
    c.DurationHours as EstimatedHours,
    e.LastAccessedDate
FROM learning.Enrollment e
    JOIN learning.Course c ON e.CourseID = c.ID
    JOIN membership.Member m ON e.MemberID = m.ID
WHERE m.Email = 'emily.rodriguez@datadriven.ai'
  AND e.Status = 'In Progress'
ORDER BY e.LastAccessedDate DESC;
```

**Step 4: Course Completion and Certification**
```sql
-- Emily completes courses and earns certificates
SELECT
    c.Title as CourseName,
    e.CompletionDate,
    e.FinalScore,
    e.Passed,
    cert.CertificateNumber,
    cert.IssuedDate,
    cert.VerificationCode
FROM learning.Enrollment e
    JOIN learning.Course c ON e.CourseID = c.ID
    JOIN learning.Certificate cert ON e.ID = cert.EnrollmentID
    JOIN membership.Member m ON e.MemberID = m.ID
WHERE m.Email = 'emily.rodriguez@datadriven.ai'
  AND e.Status = 'Completed'
ORDER BY e.CompletionDate;
```

**Results**: Emily completed all courses with scores above 85%, earning verifiable certificates.

**Step 5: Career Impact**
```sql
-- Emily's learning achievements
SELECT
    m.FirstName + ' ' + m.LastName as MemberName,
    COUNT(DISTINCT e.ID) as CoursesCompleted,
    SUM(c.CEUCredits) as TotalCEUCredits,
    AVG(e.FinalScore) as AverageScore,
    SUM(e.TimeSpentMinutes) / 60.0 as TotalHoursInvested
FROM membership.Member m
    JOIN learning.Enrollment e ON m.ID = e.MemberID
    JOIN learning.Course c ON e.CourseID = c.ID
WHERE m.Email = 'emily.rodriguez@datadriven.ai'
  AND e.Status = 'Completed'
GROUP BY m.FirstName, m.LastName;
```

#### Business Value:
- Structured learning paths with prerequisites
- Progress tracking and engagement metrics
- Automated certification issuance
- Verified credentials for professional development

---

### Scenario 4: Chapter Engagement (Local Leadership)

**Background**: David Kim joins the Boston Chapter and becomes an active leader.

#### Journey Steps:

**Step 1: Chapter Discovery and Joining**
```sql
-- David finds and joins his local chapter
SELECT
    c.Name as ChapterName,
    c.ChapterType,
    c.City,
    c.State,
    c.MeetingFrequency,
    cm.JoinDate,
    cm.Status
FROM chapters.Chapter c
    JOIN chapters.ChapterMembership cm ON c.ID = cm.ChapterID
    JOIN membership.Member m ON cm.MemberID = m.ID
WHERE m.Email = 'david.kim@cybershield.com'
ORDER BY cm.JoinDate;
```

**Results**: David joined the Boston Chapter (geographic) and the CyberSecurity SIG (special interest).

**Step 2: Chapter Event Participation**
```sql
-- David attends chapter events
SELECT
    e.Name as EventName,
    e.EventType,
    e.StartDate,
    c.Name as ChapterName,
    er.Status
FROM events.Event e
    JOIN chapters.Chapter c ON e.ChapterID = c.ID
    JOIN events.EventRegistration er ON e.ID = er.EventID
    JOIN membership.Member m ON er.MemberID = m.ID
WHERE m.Email = 'david.kim@cybershield.com'
  AND e.EventType = 'Chapter Meeting'
ORDER BY e.StartDate DESC;
```

**Step 3: Leadership Role**
```sql
-- David becomes chapter president
SELECT
    c.Name as ChapterName,
    co.Position,
    co.StartDate,
    co.IsActive,
    m.FirstName + ' ' + m.LastName as OfficerName
FROM chapters.ChapterOfficer co
    JOIN chapters.Chapter c ON co.ChapterID = c.ID
    JOIN membership.Member m ON co.MemberID = m.ID
WHERE m.Email = 'david.kim@cybershield.com'
ORDER BY co.StartDate DESC;
```

**Results**: David was elected Chapter President, showing his engagement and leadership.

#### Business Value:
- Chapter management and member engagement
- Local event coordination
- Leadership development opportunities
- Geographic and interest-based networking

---

### Scenario 5: Governance Participation (Committee Work)

**Background**: Lisa Anderson serves on multiple committees and contributes to association governance.

#### Journey Steps:

**Step 1: Committee Appointment**
```sql
-- Lisa's committee assignments
SELECT
    com.Name as CommitteeName,
    com.CommitteeType,
    cm.Role,
    cm.StartDate,
    cm.IsActive,
    com.MeetingFrequency
FROM governance.CommitteeMembership cm
    JOIN governance.Committee com ON cm.CommitteeID = com.ID
    JOIN membership.Member m ON cm.MemberID = m.ID
WHERE m.Email = 'lisa.anderson@retailinnovate.com'
ORDER BY cm.StartDate DESC;
```

**Results**: Lisa serves on the Technology Committee and Education Committee.

**Step 2: Board Service**
```sql
-- Check if Lisa serves on the board
SELECT
    bp.PositionTitle,
    bm.ElectionDate,
    bm.StartDate,
    bp.TermLengthYears,
    DATEADD(YEAR, bp.TermLengthYears, bm.StartDate) as TermExpires
FROM governance.BoardMember bm
    JOIN governance.BoardPosition bp ON bm.BoardPositionID = bp.ID
    JOIN membership.Member m ON bm.MemberID = m.ID
WHERE m.Email = 'lisa.anderson@retailinnovate.com'
  AND bm.IsActive = 1;
```

**Step 3: Leadership Impact**
```sql
-- Lisa's total governance participation
SELECT
    m.FirstName + ' ' + m.LastName as MemberName,
    COUNT(DISTINCT cm.CommitteeID) as CommitteesServed,
    COUNT(DISTINCT CASE WHEN cm.Role = 'Chair' THEN cm.CommitteeID END) as CommitteesChaired,
    COUNT(DISTINCT bm.ID) as BoardPositionsHeld
FROM membership.Member m
    LEFT JOIN governance.CommitteeMembership cm ON m.ID = cm.MemberID
    LEFT JOIN governance.BoardMember bm ON m.ID = bm.MemberID
WHERE m.Email = 'lisa.anderson@retailinnovate.com'
GROUP BY m.FirstName, m.LastName;
```

#### Business Value:
- Structured governance framework
- Member leadership opportunities
- Committee and board management
- Organizational accountability

---

## 🔄 Cross-Domain Workflows

### Workflow 1: Membership Renewal Campaign

**Objective**: Identify members due for renewal and execute automated renewal campaign.

**Steps**:

```sql
-- Step 1: Identify members due for renewal in next 30 days
SELECT
    m.ID,
    m.FirstName + ' ' + m.LastName as MemberName,
    m.Email,
    mt.Name as MembershipType,
    ms.EndDate,
    DATEDIFF(DAY, GETDATE(), ms.EndDate) as DaysUntilExpiration,
    mt.AnnualDues
FROM membership.Member m
    JOIN membership.Membership ms ON m.ID = ms.MemberID
    JOIN membership.MembershipType mt ON ms.MembershipTypeID = mt.ID
WHERE ms.Status = 'Active'
  AND ms.EndDate BETWEEN GETDATE() AND DATEADD(DAY, 30, GETDATE())
  AND ms.AutoRenew = 0
ORDER BY ms.EndDate;
```

```sql
-- Step 2: Create renewal campaign segment
INSERT INTO marketing.Segment (ID, Name, Description, SegmentType, IsActive, CreatedDate)
VALUES (
    NEWID(),
    'Renewal Due - Next 30 Days',
    'Members whose membership expires in the next 30 days',
    'Dynamic',
    1,
    GETDATE()
);

-- Step 3: Send renewal emails (automated via marketing.CampaignMember and email.EmailSend)

-- Step 4: Track renewal conversions
SELECT
    COUNT(DISTINCT cm.MemberID) as MembersSent,
    COUNT(DISTINCT CASE WHEN cm.Status = 'Converted' THEN cm.MemberID END) as Renewed,
    CAST(COUNT(DISTINCT CASE WHEN cm.Status = 'Converted' THEN cm.MemberID END) as FLOAT) /
        NULLIF(COUNT(DISTINCT cm.MemberID), 0) * 100 as RenewalRate
FROM marketing.CampaignMember cm
    JOIN marketing.Campaign c ON cm.CampaignID = c.ID
WHERE c.Name = 'Membership Renewal - Month End';
```

---

### Workflow 2: Event-Driven Course Promotion

**Objective**: Promote relevant courses to event attendees based on session topics.

**Steps**:

```sql
-- Step 1: Identify conference attendees interested in cloud topics
SELECT DISTINCT
    m.ID,
    m.Email,
    m.FirstName + ' ' + m.LastName as MemberName,
    es.Name as SessionAttended,
    es.SessionType
FROM membership.Member m
    JOIN events.EventRegistration er ON m.ID = er.MemberID
    JOIN events.Event e ON er.EventID = e.ID
    JOIN events.EventSession es ON e.ID = es.EventID
WHERE er.Status = 'Attended'
  AND es.Name LIKE '%Cloud%'
  AND NOT EXISTS (
      -- Haven't enrolled in cloud courses yet
      SELECT 1
      FROM learning.Enrollment enr
          JOIN learning.Course c ON enr.CourseID = c.ID
      WHERE enr.MemberID = m.ID
        AND c.Category = 'Cloud Architecture'
  );
```

```sql
-- Step 2: Create targeted segment and send course promotions
-- (Implement via marketing.Segment and marketing.Campaign)

-- Step 3: Track conversion to course enrollments
SELECT
    COUNT(DISTINCT m.ID) as TargetedMembers,
    COUNT(DISTINCT enr.MemberID) as Enrolled,
    SUM(ili.Amount) as CourseRevenue
FROM membership.Member m
    JOIN marketing.CampaignMember cm ON m.ID = cm.MemberID
    LEFT JOIN learning.Enrollment enr ON m.ID = enr.MemberID
        AND enr.EnrollmentDate >= cm.AddedDate
    LEFT JOIN finance.InvoiceLineItem ili ON enr.ID = CAST(ili.RelatedEntityID as UNIQUEIDENTIFIER)
        AND ili.ItemType = 'Course Enrollment'
WHERE cm.CampaignID = (SELECT ID FROM marketing.Campaign WHERE Name = 'Post-Event Cloud Course Promotion');
```

---

### Workflow 3: High-Value Member Recognition Program

**Objective**: Identify and recognize top contributors for board/committee consideration.

**Steps**:

```sql
-- Step 1: Calculate member value and engagement scores
WITH MemberMetrics AS (
    SELECT
        m.ID,
        m.FirstName + ' ' + m.LastName as MemberName,
        m.Email,
        DATEDIFF(YEAR, m.JoinDate, GETDATE()) as YearsAsMember,
        -- Financial value
        COALESCE(SUM(i.Total), 0) as LifetimeRevenue,
        -- Engagement
        COUNT(DISTINCT er.ID) as EventsAttended,
        COUNT(DISTINCT enr.ID) as CoursesCompleted,
        COUNT(DISTINCT cm.ChapterID) as ChapterMemberships,
        COUNT(DISTINCT comm.CommitteeID) as CommitteesServed,
        -- Volunteer leadership
        COUNT(DISTINCT co.ID) as ChapterOfficerRoles,
        COUNT(DISTINCT comem.ID) FILTER (WHERE comem.Role IN ('Chair', 'Vice Chair')) as CommitteeLeadershipRoles
    FROM membership.Member m
        LEFT JOIN finance.Invoice i ON m.ID = i.MemberID AND i.Status = 'Paid'
        LEFT JOIN events.EventRegistration er ON m.ID = er.MemberID AND er.Status = 'Attended'
        LEFT JOIN learning.Enrollment enr ON m.ID = enr.MemberID AND enr.Status = 'Completed'
        LEFT JOIN chapters.ChapterMembership cm ON m.ID = cm.MemberID AND cm.Status = 'Active'
        LEFT JOIN chapters.ChapterOfficer co ON m.ID = co.MemberID AND co.IsActive = 1
        LEFT JOIN governance.CommitteeMembership comem ON m.ID = comem.MemberID
        LEFT JOIN governance.CommitteeMembership comm ON m.ID = comm.MemberID AND comm.IsActive = 1
    WHERE EXISTS (SELECT 1 FROM membership.Membership ms WHERE ms.MemberID = m.ID AND ms.Status = 'Active')
    GROUP BY m.ID, m.FirstName, m.LastName, m.Email, m.JoinDate
)
SELECT TOP 50
    *,
    -- Composite engagement score
    (EventsAttended * 5) +
    (CoursesCompleted * 10) +
    (ChapterMemberships * 15) +
    (CommitteesServed * 25) +
    (ChapterOfficerRoles * 50) +
    (CommitteeLeadershipRoles * 100) as EngagementScore
FROM MemberMetrics
WHERE YearsAsMember >= 2
ORDER BY EngagementScore DESC;
```

**Step 2**: Create recognition segment and award honorary status or board nominations

---

## 💡 Key Insights

### Data-Driven Decision Making

1. **Member Retention**: Track renewal rates, identify at-risk members, implement targeted retention campaigns
2. **Event ROI**: Measure attendance, revenue, and engagement to optimize event portfolio
3. **Learning Effectiveness**: Monitor completion rates, scores, and career impact
4. **Marketing Performance**: Optimize campaigns based on open rates, click-through, and conversions
5. **Governance Health**: Ensure diverse participation and succession planning

### Process Automation

1. **Onboarding**: Automated welcome emails, resource delivery, and engagement tracking
2. **Renewals**: Proactive renewal reminders, automated invoicing, and payment processing
3. **Event Management**: Registration, invoicing, attendance tracking, and CEU awards
4. **Course Delivery**: Enrollment, progress tracking, automated certification
5. **Communications**: Segmented targeting, personalized content, engagement tracking

---

For detailed schema information, see [SCHEMA_OVERVIEW.md](SCHEMA_OVERVIEW.md).

For sample SQL queries, see [SAMPLE_QUERIES.md](SAMPLE_QUERIES.md).
