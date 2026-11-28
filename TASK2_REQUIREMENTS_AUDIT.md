# JOINEAZY TASK 2: FULL STACK ARCHITECTURE & REQUIREMENTS AUDIT

**Project:** Joineazy — Student, Group & Assignment Management System  
**Phase:** Phase 0 — Comprehensive Requirements Audit & Architecture Plan  
**Status:** Completed & Verified  
**Date:** 2026-11-28  

---

## 1. Full Task 2 Requirement Checklist

| Ref | Requirement Category | Detailed Requirement Description | Priority |
| :--- | :--- | :--- | :--- |
| **REQ-AUTH-01** | Authentication & Roles | Secure student registration with student ID, name, email, password; role locked to `STUDENT`. | High |
| **REQ-AUTH-02** | Authentication & Roles | Professor/Admin registration or administrative provisioning; role verification for `ADMIN`. | High |
| **REQ-AUTH-03** | Authentication & Roles | Smooth login with JWT issuance, secure token persistence, and role-based redirect (`/student` vs `/admin`). | High |
| **REQ-CRS-01** | Course Architecture | PostgreSQL schema for Courses: `courses` table (id, code, name, term, description, timestamps). | Critical |
| **REQ-CRS-02** | Course Architecture | Many-to-Many Student-Course enrollment: `course_enrollments` table (course_id, student_id, status, timestamps). | Critical |
| **REQ-CRS-03** | Course Architecture | Many-to-Many Professor-Course assignment: `course_professors` table (course_id, professor_id, timestamps). | Critical |
| **REQ-CRS-04** | Course Architecture | Assignments linked to courses: foreign key `course_id` on `assignments`. Safe migration of legacy assignments. | Critical |
| **REQ-CRS-05** | Course Architecture | Backend course APIs: list enrolled courses (student), list teaching courses (professor), course detail endpoint. | Critical |
| **REQ-DASH-01** | Student Dashboard | Course-centric student dashboard with clickable course cards displaying active course metrics and status. | High |
| **REQ-DASH-02** | Student Dashboard | Course detail page displaying course-specific assignments, active group info, upcoming deadlines, and progress. | High |
| **REQ-DASH-03** | Professor Dashboard | Teaching-course dashboard displaying course overview, assignment count, enrolled student counts, and completion rate. | High |
| **REQ-DASH-04** | Professor Dashboard | Clickable course views linking directly to course assignment management, roster, and submissions tracker. | High |
| **REQ-ASGN-01** | Assignment Management | Professor assignment creation scoped to a specific course taught by that professor. | High |
| **REQ-ASGN-02** | Assignment Management | Assignment audience targeting: individual students (all or specific course students) or groups (all or specific course groups). | High |
| **REQ-ASGN-03** | Assignment Management | Support external submission links (Dropbox File Request, OneDrive submission URLs) with validation. | High |
| **REQ-SUB-01** | Submission & Acknowledgment | Individual assignments: student submits via external link and confirms completion individually. | High |
| **REQ-SUB-02** | Submission & Acknowledgment | Group assignments: ONLY group leader can declare/acknowledge submission on behalf of the group. | Critical |
| **REQ-SUB-03** | Submission & Acknowledgment | Group assignments: non-leader group members see real-time status ("Pending leader acknowledgment" / "Submitted by leader [Name]"). | High |
| **REQ-SUB-04** | Submission & Acknowledgment | Two-step confirmation modal with clear warning before declaring group or individual submission. | High |
| **REQ-PROG-01** | Student Progress | Accurate progress calculation per-course and overall (completed, pending, overdue, completion rate). | High |
| **REQ-ANLY-01** | Professor Analytics & Tracker | Course-filtered submission tracker with drill-down into assignment and student/group submission states. | High |
| **REQ-ANLY-02** | Professor Analytics & Tracker | Visual analytics: submission rates by course, assignment completion rates, group submission rates, overdue lists. | High |
| **REQ-UI-01** | Design System & Styling | Clean SaaS theme inspired by Stravix: soft slate/emerald accents, crisp borders (`border-slate-200`), rounded cards (`rounded-xl`/`rounded-2xl`). | High |
| **REQ-UI-02** | Responsive Layout | Mobile, tablet, and desktop responsiveness across all student and professor pages with mobile slide-out navigation. | High |

---

## 2. Existing Implementation Status

### 2.1 Database Schema
- **Existing Tables:** `users`, `groups`, `group_members`, `group_invitations`, `assignments`, `assignment_targets`, `target_students`, `group_submissions`, `submission_confirmations`, `submission_verifications`, `dropbox_tokens`, `dropbox_accounts`, `assignment_submission_requests`.
- **Existing Functionality:** Groups, member invitations, assignments directly assigned to professor without course abstraction, group and individual submission targets, Dropbox token integration and file verification.

### 2.2 Backend Modules
- **`auth`:** Functional JWT login and registration with bcrypt password hashing and student ID uniqueness.
- **`groups`:** Functional group creation, member invitation workflow, role protection.
- **`assignments`:** Functional assignment CRUD, audience targeting (`ALL_STUDENTS`, `SELECTED_GROUPS`), OneDrive & Dropbox URL validation.
- **`submissions`:** Backend enforces group leader submission declaration (`can_declare_group_submission`, `is_submission_authority`), individual student confirmations, Dropbox automated file checking.
- **`analytics`:** Basic dashboard counts and analytics for admin/student.

### 2.3 Frontend Application
- **Pages:** RoleDashboard (recently refreshed with modern charts and metrics), AssignmentsPage, AssignmentFormPage, AssignmentDetailsPage, GroupPage, InvitationsPage, ProgressPage, AdminSubmissionsPage, AnalyticsPage, DropboxIntegrationPage.
- **Routing:** Protected routes by role (`STUDENT`, `ADMIN`), AppShell layout with responsive sidebar and topbar.

---

## 3. Missing or Incomplete Features

1. **Missing Course Schema & Relational Structure (Core Gap):**
   - No `courses`, `course_enrollments`, or `course_professors` tables exist in PostgreSQL.
   - `assignments` table currently lacks `course_id`.
   - Existing assignments are directly bound to `professor_id` with no course context.
2. **Missing Course-Based Dashboards & Pages:**
   - Student dashboard currently displays flat assignments without course grouping or course cards.
   - Student cannot filter or view assignments by course.
   - Professor dashboard has no course selector or course breakdown.
   - No dedicated Course Details page for students or professors (`/student/courses/:courseId`, `/admin/courses/:courseId`).
3. **Assignment Creation Missing Course Scope:**
   - Assignment form does not allow or require selecting a course.
   - Targeting does not restrict groups or students to enrolled course members.
4. **Group Leader Submission UI Workflow Incompleteness:**
   - While the backend checks leader ID, the frontend UI needs the explicit two-step confirmation modal with cautionary warning text.
   - Non-leader group members require an informative read-only state banner indicating leader status.
5. **Universal UI Refinement Across Non-Dashboard Pages:**
   - While `RoleDashboard` was recently upgraded, pages such as `AssignmentsPage`, `AssignmentDetailsPage`, `GroupPage`, `ProgressPage`, `AdminSubmissionsPage`, and `AnalyticsPage` need alignment with the SaaS design format (clean table formatting, status pills, filter tabs, side-detail preview sheets, responsive cards).

---

## 4. Impacted Frontend Files

| File | Nature of Change |
| :--- | :--- |
| `frontend/src/api/courses.js` *(new)* | API client functions for course fetching, enrollment, and course-level assignments. |
| `frontend/src/pages/app/RoleDashboard.jsx` | Incorporate Course Cards section for Students (Enrolled Courses) and Professors (Teaching Courses). |
| `frontend/src/pages/app/CourseDetailsPage.jsx` *(new)* | Unified/role-aware course detail view (assignments, roster, completion rate). |
| `frontend/src/pages/app/AssignmentsPage.jsx` | Add Course filtering dropdown, course badges on assignment cards/table rows, responsive UI. |
| `frontend/src/pages/app/AssignmentFormPage.jsx` | Add course selection dropdown (populated with professor's teaching courses), validation. |
| `frontend/src/pages/app/AssignmentDetailsPage.jsx` | Add explicit two-step group leader acknowledgment modal; non-leader info banner; course context. |
| `frontend/src/pages/app/GroupPage.jsx` | UI alignment matching clean SaaS theme, member management cards, invitations status. |
| `frontend/src/pages/app/ProgressPage.jsx` | Group progress by enrolled course; course-level breakdown and charts. |
| `frontend/src/pages/app/AdminSubmissionsPage.jsx` | Course filter dropdown; slide-over drawer / inspection modal matching design reference. |
| `frontend/src/pages/app/AnalyticsPage.jsx` | Course-by-course analytics graphs; completion comparisons across courses. |
| `frontend/src/App.jsx` | Register new course routes (`/student/courses/:id`, `/admin/courses/:id`). |

---

## 5. Impacted Backend Files

| File | Nature of Change |
| :--- | :--- |
| `backend/src/db/migrations/008_courses_and_enrollments.sql` *(new)* | DDL for `courses`, `course_enrollments`, `course_professors`, alter `assignments` to add `course_id`. |
| `backend/src/modules/courses/` *(new module)* | Controller, repository, routes, and validation for course management and roster querying. |
| `backend/src/modules/assignments/repository.js` | Update queries to select and filter by `course_id`; populate course metadata in assignment responses. |
| `backend/src/modules/assignments/validators.js` | Validate `course_id` (UUID format, required for publication). |
| `backend/src/modules/submissions/repository.js` | Include course details in submission tracking and verification queries. |
| `backend/src/modules/analytics/repository.js` | Add course-level aggregation for student progress and professor analytics. |
| `backend/src/app.js` | Mount `/api/courses` router. |
| `backend/src/db/seed.js` | Add default courses and enrollments for test/demo environments. |

---

## 6. Database Migration Requirements

### Migration `008_courses_and_enrollments.sql` Strategy:
1. **Create `courses` Table:**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `code TEXT NOT NULL UNIQUE CHECK (length(btrim(code)) BETWEEN 2 AND 30)`
   - `name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 160)`
   - `term TEXT NOT NULL CHECK (length(btrim(term)) BETWEEN 2 AND 40)`
   - `description TEXT DEFAULT ''`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
2. **Create `course_enrollments` Table:**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE`
   - `student_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT`
   - `status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DROPPED'))`
   - `enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `UNIQUE (course_id, student_id)`
3. **Create `course_professors` Table:**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE`
   - `professor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT`
   - `assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `UNIQUE (course_id, professor_id)`
4. **Alter `assignments` Table:**
   - Add nullable column `course_id UUID REFERENCES courses(id) ON DELETE RESTRICT`.
   - **Legacy Data Migration:** Insert a default/system course (e.g. `GEN-101: General Studies`) and associate all existing historical assignments with this course:
     ```sql
     INSERT INTO courses (id, code, name, term, description)
     VALUES ('00000000-0000-0000-0000-000000000001', 'GEN-101', 'General Studies (Legacy)', 'Fall 2026', 'Default course for legacy assignments')
     ON CONFLICT (code) DO NOTHING;
     
     UPDATE assignments SET course_id = '00000000-0000-0000-0000-000000000001' WHERE course_id IS NULL;
     ALTER TABLE assignments ALTER COLUMN course_id SET NOT NULL;
     ```
   - Create index `assignments_course_idx ON assignments (course_id)`.
5. **Rollback Script (`rollback/008_courses_and_enrollments.sql`):**
   - Provide safe, tested rollback statements.

---

## 7. Security Risks & Mitigations

1. **Cross-Course Authorization Bypass:**
   - *Risk:* A student attempts to view or submit an assignment belonging to a course they are not enrolled in.
   - *Mitigation:* In `modules/submissions` and `modules/assignments`, verify that the requesting student has an active record in `course_enrollments` for the assignment's `course_id`.
2. **Professor Course Management Spoofing:**
   - *Risk:* A professor attempts to create or edit assignments for a course they do not teach.
   - *Mitigation:* Enforce `course_professors` ownership verification in assignment creation/modification endpoints.
3. **Group Leader Spoofing:**
   - *Risk:* Non-leader member modifies client payload to declare group submission.
   - *Mitigation:* Strict server-side verification: query `groups.leader_id = req.user.id` inside a database transaction before committing `group_submissions`.
4. **SQL Injection & Mass Assignment:**
   - *Mitigation:* Parameterized SQL queries (`$1, $2, ...`) throughout all new queries; strict schema validation on all inputs.

---

## 8. Regression Risks & Mitigations

1. **Existing Task 1 Tests Breaking:**
   - *Risk:* Modifying assignments table to require `course_id` could break existing tests that insert assignments without `course_id`.
   - *Mitigation:* Ensure default course exists in test setup, and repositories fallback to default course or populate `course_id` in fixtures.
2. **Dropbox Integration Regression:**
   - *Risk:* Changing submission or assignment queries might alter the fields expected by the Dropbox automated file-matching engine.
   - *Mitigation:* Retain all existing return columns and aliases in `getAssignmentSubmissionStatus` and `getAssignmentSubmissionStatusForProfessor`.
3. **UI Layout Disruption:**
   - *Risk:* Styling changes to tables or forms could break responsive behavior on smaller mobile viewports.
   - *Mitigation:* Test layouts at 375px (mobile), 768px (tablet), and 1440px (desktop) breakpoints; verify no horizontal overflow.

---

## 9. Module-by-Module Implementation Plan

Following the strict Git Commit Workflow, implementation is structured into the following sequence of isolated modules:

### Phase 1: Database & Backend Foundation
- **Module 1.1: Database Migration for Courses**
  - Create migration `008_courses_and_enrollments.sql` and rollback.
  - Implement schema for `courses`, `course_enrollments`, `course_professors`, and `assignments.course_id`.
  - Migrate legacy assignments to default course.
  - Verification: Run migration scripts and test database integrity.
  - Propose commit: `feat(db): add courses and enrollments schema`
- **Module 1.2: Backend Courses Module & APIs**
  - Implement `backend/src/modules/courses/` (repository, controller, routes, validators).
  - Add endpoints: `GET /api/courses`, `GET /api/courses/:id`, `GET /api/courses/:id/roster`.
  - Add course authorization middleware.
  - Verification: Backend unit & integration tests.
  - Propose commit: `feat(api): implement courses endpoints and authorization`
- **Module 1.3: Assignment & Submission Course Integration**
  - Update assignment repository to support `course_id` scoping and filtering.
  - Update submission status queries to include course metadata.
  - Verification: Run all 28 backend tests to ensure zero regressions.
  - Propose commit: `feat(assignments): integrate course scoping and queries`

### Phase 2: Frontend Course-Based Dashboards & Pages
- **Module 2.1: Course Store & API Integration**
  - Implement `frontend/src/api/courses.js` and course state management.
  - Add course navigation links in sidebar.
  - Verification: Frontend smoke and API contract checks.
  - Propose commit: `feat(courses): add frontend course api and store`
- **Module 2.2: Course-Centric Dashboards**
  - Update `RoleDashboard.jsx` for Students: clickable Enrolled Courses cards with progress and assignment counters.
  - Update `RoleDashboard.jsx` for Professors: clickable Teaching Courses cards with submission statistics.
  - Verification: Component tests and responsive check.
  - Propose commit: `feat(ui): add course cards to role dashboard`
- **Module 2.3: Dedicated Course Details Page**
  - Create `CourseDetailsPage.jsx` with course overview, assignment list, and roster tabs.
  - Register route `/student/courses/:id` and `/admin/courses/:id`.
  - Verification: Route and UI layout tests.
  - Propose commit: `feat(ui): build course details view`

### Phase 3: Assignment & Submission Workflows
- **Module 3.1: Course-Scoped Assignment Creation**
  - Update `AssignmentFormPage.jsx` to require course selection and course-filtered audience targeting.
  - Verification: Assignment creation flow verification.
  - Propose commit: `feat(assignments): add course selection to assignment form`
- **Module 3.2: Group Leader Acknowledgment Workflow & Modal**
  - In `AssignmentDetailsPage.jsx`, build the two-step confirmation modal with warning.
  - Implement non-leader group status view ("Pending leader acknowledgment").
  - Verification: State transition tests for leader vs non-leader view.
  - Propose commit: `feat(submissions): implement leader acknowledgment modal and status banners`

### Phase 4: Analytics, Tracker & Global UI Polish
- **Module 4.1: Course-Filtered Submission Tracker & Analytics**
  - Add course filter dropdown and slide-over detail drawer to `AdminSubmissionsPage.jsx`.
  - Update `AnalyticsPage.jsx` with course-based breakdown charts.
  - Verification: Analytics calculations and filter responsiveness.
  - Propose commit: `feat(analytics): add course filtering to submissions tracker`
- **Module 4.2: Global Design System & Responsive Alignment**
  - Standardize padding, typography, card borders, and status pills across `AssignmentsPage`, `GroupPage`, `ProgressPage`, and `WorkspacePage` matching the Stravix SaaS reference layout.
  - Ensure full responsiveness on mobile, tablet, and desktop.
  - Verification: Complete frontend production build and visual inspection.
  - Propose commit: `style(ui): standardize responsive layout and design across all pages`

---

## 10. Acceptance Criteria

1. **Course Structure:**
   - Every student belongs to one or more courses via `course_enrollments`.
   - Every professor manages one or more courses via `course_professors`.
   - All assignments reference a valid `course_id`. Legacy assignments reference the default legacy course.
2. **Dashboards:**
   - Student dashboard renders enrolled course cards with assignment metrics.
   - Professor dashboard renders teaching course cards with submission completion rates.
   - Clicking any course card navigates to the detailed course view.
3. **Submissions & Leader Acknowledgment:**
   - Group assignment submissions can strictly only be confirmed/declared by the group leader.
   - Confirmation requires acknowledging a two-step confirmation modal with clear cautionary warning.
   - Non-leader members view real-time status displaying when and by whom the submission was declared.
4. **UI & Responsiveness:**
   - All screens display clean typography, consistent spacing, light borders (`#E2E8F0`), and clear status indicators.
   - Flawless responsiveness across Mobile (< 640px), Tablet (640px - 1024px), and Desktop (> 1024px).
5. **Quality & Test Gates:**
   - 100% pass rate on backend unit and integration test suite.
   - 100% pass rate on frontend test suite.
   - Production build (`npm run build`) completes cleanly with zero errors.
