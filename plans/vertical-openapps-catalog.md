# MJ Vertical OpenApps — Catalog & Design Notes

## Overview

This document describes the vertical OpenApps that sit on top of **MJ Commons** (the shared foundation layer of People, Organizations, Submissions, Programs, Groups, and pre-built AI workflow agents). Each vertical app is a thin layer that adds:

1. **IS-A subtypes** — domain-specific extensions to Commons entities (via overlapping subtypes)
2. **Agent configuration** — parameterize the Commons Flow Agents for the specific workflow
3. **Custom UI** — Angular components for the domain-specific experience
4. **Custom Actions** — domain-specific operations exposed to agents and workflows
5. **Metadata** — prompts, templates, and agent definitions tuned to the vertical

### Architecture Recap

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Vertical OpenApps                            │
│  Abstracts │ Awards │ Mentoring │ Volunteers │ Committees │ ...     │
│  (thin: IS-A subtypes + agent config + UI + actions)                │
├─────────────────────────────────────────────────────────────────────┤
│                         MJ Commons                                  │
│  Person │ Organization │ Submission │ Program │ Group │ Agents      │
├─────────────────────────────────────────────────────────────────────┤
│                         MJ Core                                     │
│  Entity System │ IS-A │ Agents │ Actions │ Auth │ Metadata          │
└─────────────────────────────────────────────────────────────────────┘
```

### Cross-App Value

The single-Person-record model means AI can see the full engagement picture:
- "Jane is a reviewer for abstracts, a mentor in two programs, serves on the finance committee, and volunteers at the annual conference. Her expertise in machine learning (PersonSkill) is relevant to 12 pending abstract submissions."
- No vertical app could surface this insight alone. Commons makes it automatic.

---

## App 1: Abstract Management

**Schema**: `mj_abstracts`
**Package prefix**: `@mj/abstracts-*`

### What It Does

Manages the complete lifecycle of scholarly/professional content submission and peer review — from call-for-papers through session scheduling. Used by conferences, journals, research symposia, and any organization that solicits and curates expert-submitted content.

### Who Uses It

| Role | What They Do |
|------|-------------|
| **Authors/Submitters** | Submit abstracts, track status, receive feedback, upload full papers |
| **Reviewers** | Score assigned submissions against criteria, provide written feedback |
| **Program Chair** | Configure tracks, manage reviewer assignments, make accept/reject decisions, build the program |
| **Conference Organizer** | Manage timelines, communicate with authors, coordinate logistics |

### IS-A Subtypes

```sql
-- AbstractSubmission extends Submission
CREATE TABLE [mj_abstracts].[AbstractSubmission] (
    ID UNIQUEIDENTIFIER NOT NULL,
    Track NVARCHAR(255),                    -- Research track / topic area
    Keywords NVARCHAR(MAX),                 -- Author-provided keywords (JSON array)
    CoAuthors NVARCHAR(MAX),               -- JSON: [{name, email, affiliation, order}]
    PresentationType NVARCHAR(50),          -- 'Oral' | 'Poster' | 'Workshop' | 'Panel' | 'Lightning'
    SessionPreference NVARCHAR(255),
    FullPaperURL NVARCHAR(500),
    WordCount INT,
    CONSTRAINT PK_AbstractSubmission PRIMARY KEY (ID),
    CONSTRAINT FK_AbstractSubmission_Submission
        FOREIGN KEY (ID) REFERENCES [mj_commons].[Submission](ID)
);

-- CallForPapers extends Program
CREATE TABLE [mj_abstracts].[CallForPapers] (
    ID UNIQUEIDENTIFIER NOT NULL,
    Tracks NVARCHAR(MAX),                   -- JSON: available tracks with descriptions
    SubmissionGuidelines NVARCHAR(MAX),
    ReviewCriteria NVARCHAR(MAX),           -- JSON: scoring rubric definition
    ConferenceDate DATE,
    ConferenceName NVARCHAR(255),
    ConferenceLocation NVARCHAR(255),
    MaxSubmissionsPerAuthor INT,
    BlindReviewType NVARCHAR(50),           -- 'Single' | 'Double' | 'Open' | 'None'
    CONSTRAINT PK_CallForPapers PRIMARY KEY (ID),
    CONSTRAINT FK_CallForPapers_Program
        FOREIGN KEY (ID) REFERENCES [mj_commons].[Program](ID)
);

-- Session — accepted abstracts assigned to time slots
CREATE TABLE [mj_abstracts].[Session] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CallForPapersID UNIQUEIDENTIFIER NOT NULL,
    SessionName NVARCHAR(255) NOT NULL,
    Track NVARCHAR(255),
    Room NVARCHAR(100),
    StartTime DATETIMEOFFSET,
    EndTime DATETIMEOFFSET,
    ModeratorPersonID UNIQUEIDENTIFIER,
    CONSTRAINT PK_Session PRIMARY KEY (ID),
    CONSTRAINT FK_Session_CFP FOREIGN KEY (CallForPapersID)
        REFERENCES [mj_abstracts].[CallForPapers](ID)
);

-- SessionSlot — individual presentation within a session
CREATE TABLE [mj_abstracts].[SessionSlot] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SessionID UNIQUEIDENTIFIER NOT NULL,
    AbstractSubmissionID UNIQUEIDENTIFIER NOT NULL,
    SlotOrder INT NOT NULL,
    DurationMinutes INT NOT NULL DEFAULT 20,
    CONSTRAINT PK_SessionSlot PRIMARY KEY (ID),
    CONSTRAINT FK_SessionSlot_Session FOREIGN KEY (SessionID)
        REFERENCES [mj_abstracts].[Session](ID),
    CONSTRAINT FK_SessionSlot_Abstract FOREIGN KEY (AbstractSubmissionID)
        REFERENCES [mj_abstracts].[AbstractSubmission](ID)
);
```

### Agent Configuration

**Submission Review Agent** configured with:
- **Validation**: require Track, Keywords, PresentationType, minimum 100-word Description
- **Reviewer matching**: match on Track + Keywords + PersonSkill overlap
- **Blind review**: double-blind (strip author and reviewer identities)
- **Review rounds**: 2 (initial review, then second round for borderline submissions)
- **Auto-decision threshold**: accept if AI confidence > 0.9 AND all reviewers agree on Accept
- **Conflict detection**: reviewer cannot share affiliation (Organization) with any co-author

**Program Lifecycle Agent** configured with:
- **Phases**: Call Open → Submissions Closed → Review Period → Decisions → Program Building → Conference
- **Notifications**: submission received, review assigned, decision made, session scheduled
- **Deadline enforcement**: auto-close submissions at deadline, reminder emails at 1 week and 1 day

### Custom Actions

| Action | Description |
|--------|-------------|
| Schedule Session | AI-assisted session scheduling: group accepted abstracts by track/topic, assign to rooms/time slots with constraint satisfaction (no author in two concurrent sessions, room capacity, equipment needs) |
| Generate Conference Program | Produce formatted program (PDF, web, mobile) from scheduled sessions |
| Send Author Notifications | Batch notification of accept/reject decisions with reviewer feedback (anonymized if blind review) |
| Export to Conference System | Integration with conference management platforms (Cvent, Whova, Sched) |

### Competitive Context

- **Existing tools**: Ex Ordo, OpenConf, EasyChair, ConfTool, Scholastica
- **What's different**: AI-powered reviewer matching (using the full PersonSkill + engagement history across Commons), AI content analysis, integrated with the org's full membership data (not a siloed conference system)

---

## App 2: Awards & Grants

**Schema**: `mj_awards`
**Package prefix**: `@mj/awards-*`

### What It Does

Manages nomination/application intake, judge panel evaluation, scoring, and winner selection for awards programs, scholarship programs, grant competitions, and fellowship applications. Handles everything from "Employee of the Year" to multi-million-dollar research grants.

### Who Uses It

| Role | What They Do |
|------|-------------|
| **Nominators/Applicants** | Submit nominations or applications with supporting materials |
| **Judges/Reviewers** | Score applications against criteria, provide written evaluations |
| **Program Administrator** | Configure award criteria, manage judge panels, oversee timeline |
| **Board/Selection Committee** | Final approval of winners, especially for high-value awards |

### IS-A Subtypes

```sql
-- AwardNomination extends Submission
CREATE TABLE [mj_awards].[AwardNomination] (
    ID UNIQUEIDENTIFIER NOT NULL,
    NominatorPersonID UNIQUEIDENTIFIER,       -- Who nominated (if not self-nomination)
    NomineePersonID UNIQUEIDENTIFIER,         -- Who is nominated (if individual award)
    NomineeOrganizationID UNIQUEIDENTIFIER,   -- Who is nominated (if organizational award)
    Category NVARCHAR(255),                   -- Award category
    SupportingMaterials NVARCHAR(MAX),        -- JSON: [{type, url, description}]
    LettersOfRecommendation NVARCHAR(MAX),    -- JSON: [{recommenderName, email, status, url}]
    CONSTRAINT PK_AwardNomination PRIMARY KEY (ID),
    CONSTRAINT FK_AwardNomination_Submission
        FOREIGN KEY (ID) REFERENCES [mj_commons].[Submission](ID)
);

-- GrantApplication extends Submission
CREATE TABLE [mj_awards].[GrantApplication] (
    ID UNIQUEIDENTIFIER NOT NULL,
    RequestedAmount DECIMAL(18,2),
    ProjectTitle NVARCHAR(255),
    ProjectAbstract NVARCHAR(MAX),
    Budget NVARCHAR(MAX),                     -- JSON: line-item budget
    Timeline NVARCHAR(MAX),                   -- JSON: milestones with dates
    MatchingFunds DECIMAL(18,2),              -- Co-funding from other sources
    PreviousGrantHistory NVARCHAR(MAX),       -- Prior awards from this organization
    CONSTRAINT PK_GrantApplication PRIMARY KEY (ID),
    CONSTRAINT FK_GrantApplication_Submission
        FOREIGN KEY (ID) REFERENCES [mj_commons].[Submission](ID)
);

-- AwardProgram extends Program
CREATE TABLE [mj_awards].[AwardProgram] (
    ID UNIQUEIDENTIFIER NOT NULL,
    AwardType NVARCHAR(50),                   -- 'Individual' | 'Organizational' | 'Project' | 'Lifetime'
    Categories NVARCHAR(MAX),                 -- JSON: available categories
    TotalBudget DECIMAL(18,2),                -- Total funds available (for grants)
    MaxAwardAmount DECIMAL(18,2),
    NumberOfWinners INT,                      -- Expected winners per category
    SelfNominationAllowed BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_AwardProgram PRIMARY KEY (ID),
    CONSTRAINT FK_AwardProgram_Program
        FOREIGN KEY (ID) REFERENCES [mj_commons].[Program](ID)
);

-- AwardWinner — records of past winners (historical record + public display)
CREATE TABLE [mj_awards].[AwardWinner] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AwardProgramID UNIQUEIDENTIFIER NOT NULL,
    SubmissionID UNIQUEIDENTIFIER NOT NULL,   -- The winning nomination/application
    Category NVARCHAR(255),
    AwardYear INT NOT NULL,
    AwardAmount DECIMAL(18,2),                -- Actual amount awarded (for grants)
    Citation NVARCHAR(MAX),                   -- Public citation text
    AnnouncedAt DATETIMEOFFSET,
    CONSTRAINT PK_AwardWinner PRIMARY KEY (ID),
    CONSTRAINT FK_AwardWinner_Program FOREIGN KEY (AwardProgramID)
        REFERENCES [mj_awards].[AwardProgram](ID),
    CONSTRAINT FK_AwardWinner_Submission FOREIGN KEY (SubmissionID)
        REFERENCES [mj_commons].[Submission](ID)
);
```

### Agent Configuration

**Submission Review Agent** configured with:
- **Validation**: category-specific requirements (letters of recommendation for awards, budgets for grants)
- **Judge matching**: match on category expertise, avoid conflicts (same organization, prior collaboration)
- **Blind review**: configurable per program (blind for grants, often not blind for awards)
- **Scoring**: weighted rubric with category-specific criteria
- **Budget-aware**: for grants, factor in total budget and award limits when making recommendations

### Custom Actions

| Action | Description |
|--------|-------------|
| Tabulate Scores | Aggregate judge scores, apply weights, rank nominees/applicants |
| Announce Winners | Generate personalized notification emails, public announcement content |
| Generate Winner Gallery | Produce public-facing winner profiles with citations and photos |
| Issue Award Certificate | Generate PDF/printable certificates from templates |
| Track Grant Milestones | Post-award: monitor grant recipient progress against proposed milestones |

### Competitive Context

- **Existing tools**: WizeHive (Zengine), Submittable, OpenWater, SmarterSelect, Good Grants
- **What's different**: AI-powered judge matching, integrated with full membership data, cross-award history (has this person won before?), AI content analysis of applications, open core

---

## App 3: Mentoring Programs

**Schema**: `mj_mentoring`
**Package prefix**: `@mj/mentoring-*`

### What It Does

Manages the complete mentoring lifecycle — intake, matching, relationship monitoring, and outcomes tracking. Supports 1:1 mentoring, group mentoring, peer mentoring, and reverse mentoring models. The AI matching engine uses PersonSkill, career goals, communication preferences, and availability to optimize pairings.

### Who Uses It

| Role | What They Do |
|------|-------------|
| **Mentors** | Apply, set availability/preferences, track meetings, provide feedback |
| **Mentees** | Apply, define goals, request topics, track progress |
| **Program Administrator** | Configure matching criteria, review AI-suggested matches, monitor engagement |
| **AI Matching Engine** | Analyze profiles, suggest optimal pairings, predict compatibility |

### IS-A Subtypes

```sql
-- MentoringProgram extends Program
CREATE TABLE [mj_mentoring].[MentoringProgram] (
    ID UNIQUEIDENTIFIER NOT NULL,
    MentoringModel NVARCHAR(50),              -- '1:1' | 'Group' | 'Peer' | 'Reverse' | 'Flash'
    DurationMonths INT,                       -- Expected program duration
    MeetingFrequency NVARCHAR(50),            -- 'Weekly' | 'Biweekly' | 'Monthly'
    MaxMenteesPerMentor INT DEFAULT 1,
    MatchingCriteria NVARCHAR(MAX),           -- JSON: weighted criteria for AI matching
    GoalCategories NVARCHAR(MAX),             -- JSON: available goal categories
    CONSTRAINT PK_MentoringProgram PRIMARY KEY (ID),
    CONSTRAINT FK_MentoringProgram_Program
        FOREIGN KEY (ID) REFERENCES [mj_commons].[Program](ID)
);

-- MentorApplication extends Submission (mentor signs up via submission workflow)
CREATE TABLE [mj_mentoring].[MentorApplication] (
    ID UNIQUEIDENTIFIER NOT NULL,
    ExpertiseAreas NVARCHAR(MAX),             -- JSON: areas willing to mentor on
    Availability NVARCHAR(MAX),               -- JSON: time slots, timezone
    MaxMentees INT DEFAULT 1,
    PreferredCommunication NVARCHAR(50),      -- 'Video' | 'Phone' | 'InPerson' | 'Chat'
    MentoringExperience NVARCHAR(MAX),
    Motivation NVARCHAR(MAX),
    CONSTRAINT PK_MentorApplication PRIMARY KEY (ID),
    CONSTRAINT FK_MentorApplication_Submission
        FOREIGN KEY (ID) REFERENCES [mj_commons].[Submission](ID)
);

-- MenteeApplication extends Submission
CREATE TABLE [mj_mentoring].[MenteeApplication] (
    ID UNIQUEIDENTIFIER NOT NULL,
    Goals NVARCHAR(MAX),                      -- JSON: what they want to achieve
    ChallengeAreas NVARCHAR(MAX),             -- JSON: areas they struggle with
    Availability NVARCHAR(MAX),
    PreferredCommunication NVARCHAR(50),
    CareerStage NVARCHAR(100),                -- 'Student' | 'Early Career' | 'Mid Career' | 'Senior' | 'Career Transition'
    CONSTRAINT PK_MenteeApplication PRIMARY KEY (ID),
    CONSTRAINT FK_MenteeApplication_Submission
        FOREIGN KEY (ID) REFERENCES [mj_commons].[Submission](ID)
);

-- MentoringMatch — the actual pairing
CREATE TABLE [mj_mentoring].[MentoringMatch] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    MentoringProgramID UNIQUEIDENTIFIER NOT NULL,
    MentorPersonID UNIQUEIDENTIFIER NOT NULL,
    MenteePersonID UNIQUEIDENTIFIER NOT NULL,
    MatchedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    MatchScore DECIMAL(5,2),                   -- AI confidence in this match (0-100)
    MatchRationale NVARCHAR(MAX),              -- AI explanation of why this pairing works
    Status NVARCHAR(50) NOT NULL DEFAULT 'Proposed',  -- 'Proposed'|'Accepted'|'Active'|'Completed'|'Dissolved'
    DissolvedReason NVARCHAR(MAX),
    CONSTRAINT PK_MentoringMatch PRIMARY KEY (ID),
    CONSTRAINT FK_MM_Program FOREIGN KEY (MentoringProgramID)
        REFERENCES [mj_mentoring].[MentoringProgram](ID),
    CONSTRAINT FK_MM_Mentor FOREIGN KEY (MentorPersonID) REFERENCES [mj_commons].[Person](ID),
    CONSTRAINT FK_MM_Mentee FOREIGN KEY (MenteePersonID) REFERENCES [mj_commons].[Person](ID)
);

-- MentoringCheckIn — periodic check-in records
CREATE TABLE [mj_mentoring].[MentoringCheckIn] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    MentoringMatchID UNIQUEIDENTIFIER NOT NULL,
    CheckInDate DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    MeetingOccurred BIT NOT NULL DEFAULT 1,
    TopicsDiscussed NVARCHAR(MAX),
    MentorFeedback NVARCHAR(MAX),
    MenteeFeedback NVARCHAR(MAX),
    HealthScore DECIMAL(5,2),                  -- AI-assessed relationship health (0-100)
    AIHealthNotes NVARCHAR(MAX),               -- AI analysis of engagement trajectory
    CONSTRAINT PK_MentoringCheckIn PRIMARY KEY (ID),
    CONSTRAINT FK_MC_Match FOREIGN KEY (MentoringMatchID)
        REFERENCES [mj_mentoring].[MentoringMatch](ID)
);
```

### Agent Configuration

**Program Lifecycle Agent** configured with:
- **Matching algorithm**: weighted criteria (skills overlap, goal alignment, availability compatibility, communication preference, seniority gap). AI optimizes globally (not greedy per-pair).
- **Check-in frequency**: configurable (weekly/biweekly/monthly). AI sends check-in prompts.
- **Health monitoring**: AI analyzes check-in sentiment, meeting frequency, goal progress. Flags at-risk pairs.
- **Escalation**: if health score drops below threshold, alert program admin with suggested interventions.
- **Milestone tracking**: program-defined milestones (first meeting, goal setting, mid-point review, final evaluation).
- **Re-matching**: if a pair dissolves, AI suggests new matches considering what went wrong.

### Custom Actions

| Action | Description |
|--------|-------------|
| Generate Match Recommendations | AI analyzes all mentor/mentee profiles, produces ranked match suggestions with rationale |
| Send Check-In Reminder | Automated check-in prompt with suggested discussion topics based on goals |
| Calculate Health Score | AI evaluates pair health from check-in data, meeting frequency, sentiment |
| Generate Impact Report | Aggregate outcomes across program (goals achieved, hours invested, satisfaction scores) |
| Re-Match | When a pair dissolves, find a new match for the unmatched participant |

### Competitive Context

- **Existing tools**: MentorcliQ, Together Platform, Chronus, PushFar, MentorCloud
- **What's different**: AI matching draws on the full PersonSkill + engagement history from Commons (not just a self-reported profile), cross-program visibility (this mentee also volunteers — suggest their volunteer lead as a mentor), open core

---

## App 4: Volunteer Management

**Schema**: `mj_volunteers`
**Package prefix**: `@mj/volunteers-*`

### What It Does

Manages volunteer recruitment, opportunity matching, scheduling, hours tracking, and impact reporting. Connects volunteer skills and interests to organizational needs using AI-powered matching.

### Who Uses It

| Role | What They Do |
|------|-------------|
| **Volunteers** | Browse opportunities, sign up for shifts, log hours, track impact |
| **Volunteer Coordinator** | Create opportunities, manage schedules, communicate with volunteers |
| **Program Administrator** | Define programs, set goals, generate impact reports |
| **AI Engine** | Match volunteers to opportunities, predict no-shows, optimize schedules |

### IS-A Subtypes

```sql
-- VolunteerProgram extends Program
CREATE TABLE [mj_volunteers].[VolunteerProgram] (
    ID UNIQUEIDENTIFIER NOT NULL,
    ProgramType NVARCHAR(50),                 -- 'Event' | 'Ongoing' | 'Seasonal' | 'Virtual' | 'Pro Bono'
    GoalHours INT,                            -- Target volunteer hours for the program
    RequiresBackgroundCheck BIT DEFAULT 0,
    MinimumAge INT,
    TrainingRequired BIT DEFAULT 0,
    TrainingMaterials NVARCHAR(MAX),          -- JSON: [{title, url, type}]
    CONSTRAINT PK_VolunteerProgram PRIMARY KEY (ID),
    CONSTRAINT FK_VolunteerProgram_Program
        FOREIGN KEY (ID) REFERENCES [mj_commons].[Program](ID)
);

-- VolunteerOpportunity — a specific volunteering opportunity
CREATE TABLE [mj_volunteers].[VolunteerOpportunity] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    VolunteerProgramID UNIQUEIDENTIFIER NOT NULL,
    Title NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX),
    Location NVARCHAR(255),                   -- Physical location or 'Virtual'
    StartDateTime DATETIMEOFFSET,
    EndDateTime DATETIMEOFFSET,
    SlotsAvailable INT NOT NULL DEFAULT 1,
    SlotsFilled INT NOT NULL DEFAULT 0,
    SkillsNeeded NVARCHAR(MAX),               -- JSON: skill IDs from Skill entity
    Status NVARCHAR(50) NOT NULL DEFAULT 'Open', -- 'Draft'|'Open'|'Full'|'In Progress'|'Completed'|'Cancelled'
    CONSTRAINT PK_VolunteerOpportunity PRIMARY KEY (ID),
    CONSTRAINT FK_VO_Program FOREIGN KEY (VolunteerProgramID)
        REFERENCES [mj_volunteers].[VolunteerProgram](ID)
);

-- VolunteerSignup — a person signing up for an opportunity
CREATE TABLE [mj_volunteers].[VolunteerSignup] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    VolunteerOpportunityID UNIQUEIDENTIFIER NOT NULL,
    PersonID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Registered', -- 'Registered'|'Confirmed'|'Attended'|'No Show'|'Cancelled'
    HoursLogged DECIMAL(5,2),
    FeedbackRating INT,                        -- 1-5 satisfaction rating
    FeedbackText NVARCHAR(MAX),
    CONSTRAINT PK_VolunteerSignup PRIMARY KEY (ID),
    CONSTRAINT FK_VS_Opportunity FOREIGN KEY (VolunteerOpportunityID)
        REFERENCES [mj_volunteers].[VolunteerOpportunity](ID),
    CONSTRAINT FK_VS_Person FOREIGN KEY (PersonID) REFERENCES [mj_commons].[Person](ID)
);

-- VolunteerProfile — extends Person with volunteer-specific preferences
CREATE TABLE [mj_volunteers].[VolunteerProfile] (
    ID UNIQUEIDENTIFIER NOT NULL,              -- Same as Person.ID (IS-A)
    Interests NVARCHAR(MAX),                   -- JSON: interest areas
    Availability NVARCHAR(MAX),                -- JSON: recurring availability windows
    PreferredLocations NVARCHAR(MAX),          -- JSON: location preferences
    TransportationMode NVARCHAR(50),           -- 'Car' | 'PublicTransit' | 'Walk' | 'Virtual Only'
    MaxWeeklyHours DECIMAL(5,2),
    TotalLifetimeHours DECIMAL(10,2) DEFAULT 0,
    BackgroundCheckStatus NVARCHAR(50),        -- 'NotRequired'|'Pending'|'Cleared'|'Expired'
    CONSTRAINT PK_VolunteerProfile PRIMARY KEY (ID),
    CONSTRAINT FK_VolunteerProfile_Person
        FOREIGN KEY (ID) REFERENCES [mj_commons].[Person](ID)
);
```

### Agent Configuration

**Program Lifecycle Agent** configured with:
- **Matching**: skills + interests + availability + location → opportunity fit scoring
- **No-show prediction**: AI learns patterns from past attendance, sends extra reminders to at-risk signups
- **Schedule optimization**: for events with many shifts, optimize coverage across time slots
- **Engagement scoring**: track frequency, reliability, satisfaction → identify and nurture super-volunteers
- **Recognition triggers**: milestone hours (50, 100, 500, 1000) → automatic recognition actions

### Custom Actions

| Action | Description |
|--------|-------------|
| Match Volunteers to Opportunities | AI matches based on skills, availability, location, interests |
| Log Hours | Record volunteer hours (self-reported or coordinator-verified) |
| Generate Impact Report | Aggregate hours, participation rates, satisfaction scores, economic value of volunteer time |
| Send Shift Reminder | Automated reminders with logistics details 24h and 2h before shift |
| Issue Service Certificate | Generate certificates for milestone hours |

### Competitive Context

- **Existing tools**: Galaxy Digital (formerly Get Connected), VolunteerHub, Better Impact, SignUpGenius, POINT
- **What's different**: AI matching draws on full PersonSkill profile, cross-app visibility (this volunteer is also a mentee — their mentor could co-volunteer), engagement scoring informs other apps (highly engaged volunteers are great committee candidates), open core

---

## App 5: Committee & Board Management

**Schema**: `mj_committees`
**Package prefix**: `@mj/committees-*`

### What It Does

Manages governed groups — committees, boards, task forces, advisory panels. Covers the full governance lifecycle: formation, member recruitment/election, meeting management, decision tracking, term management, and compliance monitoring.

### Who Uses It

| Role | What They Do |
|------|-------------|
| **Committee Members** | Attend meetings, vote on decisions, complete assigned tasks |
| **Committee Chair** | Set agendas, facilitate meetings, track action items |
| **Governance Administrator** | Manage committee structure, track terms, ensure compliance |
| **Board** | Oversight of committee activities, approve charters |

### IS-A Subtypes

```sql
-- Committee extends Group
CREATE TABLE [mj_committees].[Committee] (
    ID UNIQUEIDENTIFIER NOT NULL,
    CommitteeType NVARCHAR(50),               -- 'Standing' | 'Ad Hoc' | 'Task Force' | 'Advisory' | 'Board'
    Charter NVARCHAR(MAX),                    -- Committee's purpose and authority
    ParentCommitteeID UNIQUEIDENTIFIER,       -- Hierarchical (subcommittees)
    MinMembers INT,
    MaxMembers INT,
    MeetingFrequency NVARCHAR(50),            -- 'Weekly' | 'Monthly' | 'Quarterly' | 'As Needed'
    TermLengthMonths INT,
    MaxConsecutiveTerms INT,
    RequiresMinutes BIT NOT NULL DEFAULT 1,
    VotingMethod NVARCHAR(50),                -- 'SimpleMajority' | 'TwoThirds' | 'Unanimous' | 'RankedChoice'
    CONSTRAINT PK_Committee PRIMARY KEY (ID),
    CONSTRAINT FK_Committee_Group
        FOREIGN KEY (ID) REFERENCES [mj_commons].[Group](ID),
    CONSTRAINT FK_Committee_Parent FOREIGN KEY (ParentCommitteeID)
        REFERENCES [mj_committees].[Committee](ID)
);

-- Meeting — a committee meeting instance
CREATE TABLE [mj_committees].[Meeting] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CommitteeID UNIQUEIDENTIFIER NOT NULL,
    MeetingDate DATETIMEOFFSET NOT NULL,
    Location NVARCHAR(255),                   -- Physical or virtual meeting link
    AgendaJSON NVARCHAR(MAX),                 -- JSON: agenda items with time allocations
    MinutesText NVARCHAR(MAX),                -- Approved meeting minutes
    MinutesApprovedAt DATETIMEOFFSET,
    AttendanceJSON NVARCHAR(MAX),             -- JSON: [{personId, status: 'Present'|'Absent'|'Excused'}]
    QuorumMet BIT,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Scheduled', -- 'Scheduled'|'In Progress'|'Completed'|'Cancelled'
    CONSTRAINT PK_Meeting PRIMARY KEY (ID),
    CONSTRAINT FK_Meeting_Committee FOREIGN KEY (CommitteeID)
        REFERENCES [mj_committees].[Committee](ID)
);

-- ActionItem — tasks assigned during meetings
CREATE TABLE [mj_committees].[ActionItem] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    MeetingID UNIQUEIDENTIFIER NOT NULL,
    AssignedToPersonID UNIQUEIDENTIFIER NOT NULL,
    Description NVARCHAR(MAX) NOT NULL,
    DueDate DATE,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Open', -- 'Open' | 'In Progress' | 'Completed' | 'Deferred'
    CompletedAt DATETIMEOFFSET,
    CONSTRAINT PK_ActionItem PRIMARY KEY (ID),
    CONSTRAINT FK_AI_Meeting FOREIGN KEY (MeetingID)
        REFERENCES [mj_committees].[Meeting](ID),
    CONSTRAINT FK_AI_Person FOREIGN KEY (AssignedToPersonID)
        REFERENCES [mj_commons].[Person](ID)
);

-- Motion — formal motions and votes
CREATE TABLE [mj_committees].[Motion] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    MeetingID UNIQUEIDENTIFIER NOT NULL,
    MotionText NVARCHAR(MAX) NOT NULL,
    MovedByPersonID UNIQUEIDENTIFIER NOT NULL,
    SecondedByPersonID UNIQUEIDENTIFIER,
    VotesFor INT,
    VotesAgainst INT,
    Abstentions INT,
    Outcome NVARCHAR(50),                     -- 'Passed' | 'Failed' | 'Tabled' | 'Withdrawn'
    CONSTRAINT PK_Motion PRIMARY KEY (ID),
    CONSTRAINT FK_Motion_Meeting FOREIGN KEY (MeetingID)
        REFERENCES [mj_committees].[Meeting](ID)
);
```

### Agent Configuration

**Governance Agent** configured with:
- **Election/nomination**: manage intake of committee member nominations, eligibility checking against bylaws (term limits, membership requirements, diversity targets)
- **Meeting lifecycle**: AI-assisted agenda generation from pending action items and new business; post-meeting: minutes summarization from recording/notes, action item extraction
- **Compliance monitoring**: periodic health checks — meeting frequency requirements, attendance records (quorum tracking), term expiration dates, required diversity
- **Succession planning**: as terms approach expiration, AI analyzes committee composition gaps and recommends candidates from broader membership (using PersonSkill, engagement history)

### Custom Actions

| Action | Description |
|--------|-------------|
| Generate Meeting Agenda | AI compiles agenda from open action items, pending decisions, new business items |
| Summarize Meeting Minutes | AI generates structured minutes from meeting notes or recording transcript |
| Record Vote | Record formal motion outcomes with individual vote tracking |
| Generate Committee Health Report | Attendance trends, action item completion rates, meeting frequency compliance |
| Nominate Candidates | AI recommends members for open committee seats based on skills and engagement |

### Competitive Context

- **Existing tools**: BoardEffect, OnBoard, Diligent Boards, Boardable
- **What's different**: AI meeting summaries, AI candidate recommendation from full membership data, integrated with other engagement (committee members who also mentor and volunteer), term management with automated succession planning, open core

---

## App 6: Chapter / Affiliate Management

**Schema**: `mj_chapters`
**Package prefix**: `@mj/chapters-*`

### What It Does

Manages a network of local chapters, regional affiliates, or special interest groups within a parent organization. Tracks chapter health, officer leadership, compliance with parent org requirements, and inter-chapter benchmarking.

### Who Uses It

| Role | What They Do |
|------|-------------|
| **Chapter Officers** | Manage local chapter, report activities, maintain membership |
| **Chapter Members** | Participate in local events, connect with nearby members |
| **HQ Staff** | Monitor chapter health, enforce compliance, allocate resources |
| **AI Engine** | Benchmark chapters, predict at-risk chapters, recommend interventions |

### IS-A Subtypes

```sql
-- Chapter extends Organization (from Commons)
CREATE TABLE [mj_chapters].[Chapter] (
    ID UNIQUEIDENTIFIER NOT NULL,
    ParentOrganizationID UNIQUEIDENTIFIER NOT NULL,  -- The parent/national org
    ChapterType NVARCHAR(50),                 -- 'Geographic' | 'Special Interest' | 'Student' | 'Affiliate'
    Region NVARCHAR(100),
    Territory NVARCHAR(MAX),                  -- JSON: geographic boundaries or interest description
    CharterDate DATE,
    CharterStatus NVARCHAR(50),               -- 'Active' | 'Probation' | 'Suspended' | 'Revoked'
    AnnualDuesAmount DECIMAL(18,2),
    MemberCount INT DEFAULT 0,
    MinMembersRequired INT,
    CONSTRAINT PK_Chapter PRIMARY KEY (ID),
    CONSTRAINT FK_Chapter_Organization
        FOREIGN KEY (ID) REFERENCES [mj_commons].[Organization](ID),
    CONSTRAINT FK_Chapter_Parent FOREIGN KEY (ParentOrganizationID)
        REFERENCES [mj_commons].[Organization](ID)
);

-- ChapterOfficer — leadership positions within a chapter
CREATE TABLE [mj_chapters].[ChapterOfficer] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ChapterID UNIQUEIDENTIFIER NOT NULL,
    PersonID UNIQUEIDENTIFIER NOT NULL,
    OfficerRole NVARCHAR(100) NOT NULL,       -- 'President' | 'Vice President' | 'Treasurer' | 'Secretary'
    TermStart DATE NOT NULL,
    TermEnd DATE,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active', -- 'Active' | 'Completed' | 'Resigned' | 'Removed'
    CONSTRAINT PK_ChapterOfficer PRIMARY KEY (ID),
    CONSTRAINT FK_CO_Chapter FOREIGN KEY (ChapterID)
        REFERENCES [mj_chapters].[Chapter](ID),
    CONSTRAINT FK_CO_Person FOREIGN KEY (PersonID) REFERENCES [mj_commons].[Person](ID)
);

-- ChapterComplianceItem — tracking compliance with parent org requirements
CREATE TABLE [mj_chapters].[ChapterComplianceItem] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ChapterID UNIQUEIDENTIFIER NOT NULL,
    RequirementName NVARCHAR(255) NOT NULL,    -- 'Annual Report' | 'Financial Audit' | 'Officer Election' | 'Minimum Membership'
    DueDate DATE,
    CompletedDate DATE,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Pending', -- 'Pending'|'Completed'|'Overdue'|'Waived'
    Evidence NVARCHAR(MAX),                    -- URL or description of compliance evidence
    CONSTRAINT PK_ChapterComplianceItem PRIMARY KEY (ID),
    CONSTRAINT FK_CCI_Chapter FOREIGN KEY (ChapterID)
        REFERENCES [mj_chapters].[Chapter](ID)
);

-- ChapterHealthScore — periodic AI-generated health assessments
CREATE TABLE [mj_chapters].[ChapterHealthScore] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ChapterID UNIQUEIDENTIFIER NOT NULL,
    AssessmentDate DATE NOT NULL,
    OverallScore DECIMAL(5,2),                 -- 0-100 composite
    MembershipScore DECIMAL(5,2),              -- Member count trend
    EngagementScore DECIMAL(5,2),              -- Activity frequency and participation
    LeadershipScore DECIMAL(5,2),              -- Officer stability and effectiveness
    ComplianceScore DECIMAL(5,2),              -- Compliance completion rate
    FinancialScore DECIMAL(5,2),               -- Financial health indicators
    AIAnalysis NVARCHAR(MAX),                  -- AI narrative assessment
    AIRecommendations NVARCHAR(MAX),           -- AI recommended interventions
    CONSTRAINT PK_ChapterHealthScore PRIMARY KEY (ID),
    CONSTRAINT FK_CHS_Chapter FOREIGN KEY (ChapterID)
        REFERENCES [mj_chapters].[Chapter](ID)
);
```

### Agent Configuration

**Governance Agent** configured with:
- **Compliance monitoring**: track each chapter against parent org requirements (annual reports, audits, elections, minimum membership). Generate alerts for overdue items.
- **Health scoring**: periodic AI analysis of membership trends, event activity, officer continuity, financial indicators, compliance status. Composite score with drill-down.
- **Succession planning**: flag chapters with expiring officer terms and no nominees. Recommend candidates.
- **Benchmarking**: compare chapter metrics across the network. Identify best practices from top performers.

### Custom Actions

| Action | Description |
|--------|-------------|
| Generate Chapter Health Report | AI-powered assessment of chapter vitality with benchmarks against peers |
| Flag At-Risk Chapters | Identify chapters trending toward probation based on health trajectory |
| Generate Compliance Dashboard | Status of all chapters against all compliance requirements |
| Recommend Intervention | AI suggests specific actions for struggling chapters based on what worked for similar chapters |
| Benchmark Report | Cross-chapter comparison with anonymized peer benchmarking |

### Competitive Context

- **Existing tools**: Aptify (chapter modules), YourMembership, StarChapter, ClubExpress
- **What's different**: AI health scoring with predictive analytics, cross-chapter benchmarking, integrated with full member engagement data (a chapter's members are also mentors, volunteers, committee members — giving a richer health picture), open core

---

## App 7: Credentials & Continuing Education

**Schema**: `mj_credentials`
**Package prefix**: `@mj/credentials-*`

### What It Does

Manages professional certification programs, continuing education (CE/CPE/CME) tracking, recertification workflows, and public credential verification. Handles the full credential lifecycle from initial application through ongoing maintenance.

### Who Uses It

| Role | What They Do |
|------|-------------|
| **Applicants** | Apply for certification, submit evidence of qualifications |
| **Credential Holders** | Track CE credits, submit recertification evidence, maintain credential |
| **CE Providers/Instructors** | Submit courses for approval, report attendee completion |
| **Certification Board** | Set standards, review applications, approve CE activities |
| **Public** | Verify credentials via public registry |

### IS-A Subtypes

```sql
-- CertificationProgram extends Program
CREATE TABLE [mj_credentials].[CertificationProgram] (
    ID UNIQUEIDENTIFIER NOT NULL,
    CredentialAbbreviation NVARCHAR(20),       -- 'CPA' | 'PMP' | 'CAE' | 'CFRE'
    CertificationBody NVARCHAR(255),
    EligibilityRequirements NVARCHAR(MAX),     -- JSON: education, experience, exam, references
    RecertificationCycleDays INT,              -- Days between recertification (typically 365, 730, or 1095)
    RequiredCECredits DECIMAL(10,2),           -- CE credits per cycle
    CECategories NVARCHAR(MAX),               -- JSON: [{category, minCredits, maxCredits}]
    ExamRequired BIT DEFAULT 0,
    ApplicationFee DECIMAL(18,2),
    RenewalFee DECIMAL(18,2),
    CONSTRAINT PK_CertificationProgram PRIMARY KEY (ID),
    CONSTRAINT FK_CertificationProgram_Program
        FOREIGN KEY (ID) REFERENCES [mj_commons].[Program](ID)
);

-- CertificationApplication extends Submission
CREATE TABLE [mj_credentials].[CertificationApplication] (
    ID UNIQUEIDENTIFIER NOT NULL,
    CertificationProgramID UNIQUEIDENTIFIER NOT NULL,
    ApplicationType NVARCHAR(50),              -- 'Initial' | 'Recertification' | 'Reinstatement'
    EducationEvidence NVARCHAR(MAX),           -- JSON: degrees, transcripts
    ExperienceEvidence NVARCHAR(MAX),          -- JSON: employment history, years
    ExamScore DECIMAL(5,2),
    ExamDate DATE,
    ReferencesJSON NVARCHAR(MAX),              -- JSON: [{name, email, status, response}]
    CONSTRAINT PK_CertificationApplication PRIMARY KEY (ID),
    CONSTRAINT FK_CA_Submission FOREIGN KEY (ID)
        REFERENCES [mj_commons].[Submission](ID),
    CONSTRAINT FK_CA_Program FOREIGN KEY (CertificationProgramID)
        REFERENCES [mj_credentials].[CertificationProgram](ID)
);

-- Credential — an awarded credential (the active certification record)
CREATE TABLE [mj_credentials].[Credential] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    PersonID UNIQUEIDENTIFIER NOT NULL,
    CertificationProgramID UNIQUEIDENTIFIER NOT NULL,
    CredentialNumber NVARCHAR(50),             -- Unique public credential number
    IssuedDate DATE NOT NULL,
    ExpirationDate DATE,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active', -- 'Active'|'Expired'|'Suspended'|'Revoked'|'Lapsed'
    PublicVerificationEnabled BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_Credential PRIMARY KEY (ID),
    CONSTRAINT FK_Credential_Person FOREIGN KEY (PersonID) REFERENCES [mj_commons].[Person](ID),
    CONSTRAINT FK_Credential_Program FOREIGN KEY (CertificationProgramID)
        REFERENCES [mj_credentials].[CertificationProgram](ID)
);

-- CEActivity — an approved continuing education activity
CREATE TABLE [mj_credentials].[CEActivity] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CertificationProgramID UNIQUEIDENTIFIER NOT NULL,
    Title NVARCHAR(255) NOT NULL,
    ProviderName NVARCHAR(255),
    ProviderOrganizationID UNIQUEIDENTIFIER,   -- CE provider org (from Commons)
    ActivityType NVARCHAR(50),                 -- 'Course' | 'Webinar' | 'Conference' | 'Self-Study' | 'Teaching' | 'Publication'
    Category NVARCHAR(100),                    -- Maps to CertificationProgram.CECategories
    Credits DECIMAL(10,2) NOT NULL,
    ApprovalStatus NVARCHAR(50) DEFAULT 'Pending', -- 'Pending'|'Approved'|'Denied'
    ApprovedByPersonID UNIQUEIDENTIFIER,
    CONSTRAINT PK_CEActivity PRIMARY KEY (ID),
    CONSTRAINT FK_CEA_Program FOREIGN KEY (CertificationProgramID)
        REFERENCES [mj_credentials].[CertificationProgram](ID)
);

-- CECompletion — a person's completion of a CE activity
CREATE TABLE [mj_credentials].[CECompletion] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CredentialID UNIQUEIDENTIFIER NOT NULL,
    CEActivityID UNIQUEIDENTIFIER NOT NULL,
    CompletionDate DATE NOT NULL,
    CreditsEarned DECIMAL(10,2) NOT NULL,
    EvidenceURL NVARCHAR(500),                 -- Certificate, transcript, etc.
    VerificationStatus NVARCHAR(50) DEFAULT 'Self-Reported', -- 'Self-Reported'|'Provider-Verified'|'Audited'
    CONSTRAINT PK_CECompletion PRIMARY KEY (ID),
    CONSTRAINT FK_CEC_Credential FOREIGN KEY (CredentialID)
        REFERENCES [mj_credentials].[Credential](ID),
    CONSTRAINT FK_CEC_Activity FOREIGN KEY (CEActivityID)
        REFERENCES [mj_credentials].[CEActivity](ID)
);
```

### Agent Configuration

**Submission Review Agent** configured with:
- **Validation**: eligibility checking against program requirements (education, experience, exam)
- **Reference checking**: automated outreach to references with structured verification forms
- **Evidence analysis**: AI reviews submitted documentation for completeness and consistency
- **Board review**: route complex applications to certification board members

**Program Lifecycle Agent** configured with:
- **Recertification monitoring**: track CE credit accumulation against requirements
- **Expiration warnings**: automated notifications at 90, 60, 30 days before expiration
- **CE audit**: random audit selection with AI-powered evidence verification
- **Lapse prevention**: escalating interventions for credential holders falling behind on CE

### Custom Actions

| Action | Description |
|--------|-------------|
| Verify Credential | Public API endpoint to verify a person's credential status by credential number |
| Issue Certificate | Generate digital certificate (PDF, shareable badge) |
| Calculate CE Progress | Aggregate CE completions against requirements by category |
| Trigger Recertification | Generate recertification application when cycle approaches |
| Run CE Audit | Select random sample of credential holders for CE verification |
| Approve CE Activity | Route CE activity submission through approval workflow |

### Competitive Context

- **Existing tools**: Certemy, CE21, Abila/Community Brands (Freestone), Heuristics, LearningBuilder
- **What's different**: AI-powered application review, integrated with full membership engagement (volunteer hours could count toward CE in some programs), PersonSkill automatically updated when certifications earned, public verification API, open core

---

## App 8: RFP & Procurement Management

**Schema**: `mj_procurement`
**Package prefix**: `@mj/procurement-*`

This app has its own detailed research document: **[rfp-procurement-openapp-research.md](rfp-procurement-openapp-research.md)**

### Summary

Manages the complete RFP lifecycle for nonprofits: drafting, distribution, vendor Q&A, committee evaluation, and award. Features AI-powered proposal analysis, **AI voice interviews with vendors** (complete market whitespace), committee governance with conflict-of-interest management, and nonprofit compliance awareness (2 CFR 200, IRS, state requirements).

### Key Differentiators
- AI voice vendor interviews ($4-12/interview vs $500-2K human)
- Purpose-built for nonprofit compliance requirements
- Committee-first evaluation (not procurement-professional-first)
- Consensus scoring with AI bias detection
- Audit package generation

See the dedicated research doc for full entity model, agent configuration, competitive analysis, and technical feasibility assessment.

---

## Implementation Priority

Suggested ordering based on market demand, Commons coverage, and complexity:

| Priority | App | Rationale |
|----------|-----|-----------|
| 1 | **Abstract Management** | Cleanest Submission Review workflow. High demand. Validates the Commons model end-to-end. |
| 2 | **Committee Management** | Cleanest Governance workflow. Every org needs it. Validates Group + governance agents. |
| 3 | **Awards & Grants** | Very similar to Abstracts (submission + review) but with budget awareness. Low incremental effort. |
| 4 | **Credentials & CE** | High value, complex domain. Uses both Submission Review (applications) and Program Lifecycle (recertification monitoring). Validates both agents together. |
| 5 | **Mentoring** | Highest AI value (matching engine). Validates Program Lifecycle agent's matching and health monitoring. |
| 6 | **Volunteer Management** | Similar matching patterns to mentoring. Validates at-scale engagement tracking. |
| 7 | **Chapter Management** | Requires the most mature Commons (Organization + Group + governance + health scoring all working). |
| 8 | **RFP & Procurement** | Most novel (AI voice interviews). Most complex compliance. Benefits from all other apps being mature. |

### Cross-App Dependencies

```
MJ Commons
  ├── Abstract Management ←── validates Submission Review Agent
  ├── Committee Management ←── validates Governance Agent
  ├── Awards & Grants ←── similar to Abstracts, adds budget
  ├── Credentials & CE ←── uses both Submission Review + Program Lifecycle
  ├── Mentoring ←── validates Program Lifecycle Agent matching
  ├── Volunteer Management ←── similar matching patterns to Mentoring
  ├── Chapter Management ←── needs mature Organization + Governance
  └── RFP & Procurement ←── most novel, needs mature Commons
```

Each app validates and stress-tests different parts of Commons, building confidence incrementally. By the time we reach RFP/Procurement (the most ambitious), the entire Commons foundation will be battle-tested.

---

## Cross-App Intelligence: The Compound Value

The real power emerges when multiple apps are active simultaneously:

### Example Scenario
An association running Abstract Management + Mentoring + Committees + Credentials:

1. **Jane submits an abstract** on machine learning in healthcare
2. **AI reviewer matching** (Abstract app) uses PersonSkill to find reviewers — and discovers that **Dr. Smith** has ML expertise (PersonSkill), serves on the Research Committee (Committee app), and mentors two early-career data scientists (Mentoring app)
3. **Dr. Smith is assigned as reviewer** — but the AI also notes he co-authored a paper with Jane last year (conflict detection from Person relationships)
4. **After the conference**, Jane's presentation earns CE credits (Credentials app) automatically logged to her professional development record
5. **The mentoring AI** notices that Jane's mentees would benefit from the presentation content and suggests sharing the session recording
6. **The committee governance AI** flags that the Research Committee needs a new member with ML expertise — and recommends Jane based on her abstract acceptance, skills profile, and volunteer history

No single vertical app could orchestrate this. Commons + the shared Person record makes it automatic.
