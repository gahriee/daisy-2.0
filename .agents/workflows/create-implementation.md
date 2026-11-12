---
description: Read AGENTS.md, architecture.md, project-status, and latest memory to create a comprehensive implementation plan.
---

# Create Implementation Plan Workflow

Follow this step-by-step workflow to analyze the repository state and generate an implementation plan for the next development phase:

---

## 1. Context Ingestion & State Analysis

Before drafting or modifying code, systematically view and analyze the following master source documents:

1. **Monorepo Guidelines & Protocols:**
   - Read [`AGENTS.md`](file:///c:/Users/Gary/Documents/idrrms/AGENTS.md) for session lifecycle, sub-project conventions, and testing requirements.
2. **System Architecture & Tech Stack:**
   - Read [`docs/architecture/architecture.md`](file:///c:/Users/Gary/Documents/idrrms/docs/architecture/architecture.md) for the active folder-deep hierarchy, database models, and service layer layout.
3. **Project Status & Regulatory Compliance:**
   - Read [`docs/project-status/project-status.md`](file:///c:/Users/Gary/Documents/idrrms/docs/project-status/project-status.md) for official NCDA TOR requirements, completed modules, open gaps, and progress billing milestones.
4. **Latest Active Memory Log:**
   - Read the latest active session file in [`docs/memory/`](file:///c:/Users/Gary/Documents/idrrms/docs/memory/) (e.g., `08-30-26-1.md`) to maintain continuity with recent code modifications and technical decisions.

---

## 2. Identify the Target Feature / Technical Objective

Cross-reference the open tasks from `project-status.md` against user instructions to define:
- **Feature / Task Name**
- **Affected Subsystem:** (e.g., IDDRMS JMC, ABIS, CRIS, AI-Assisted Analytics, Public Portal, Auth/Admin)
- **Target Layers:** Backend (`backend/app/`, `backend/routes/api.php`, `backend/database/`) and Frontend (`frontend/src/pages/`, `frontend/src/components/`, `frontend/src/services/`, `frontend/src/styles/`).

---

## 3. Generate Implementation Plan Artifact

Create or update the implementation plan artifact at `<appDataDir>\brain\<conversation-id>/implementation_plan.md` using the standard format:

```markdown
# Implementation Plan: [Feature / Task Title]

[Brief overview of the technical problem, user requirements, and desired outcome]

## User Review Required

> [!IMPORTANT]
> [Highlight any critical architectural decisions, schema changes, or breaking updates requiring user confirmation]

## Proposed Changes

### [Layer 1: Backend / API]

#### [NEW / MODIFY] [`path/to/file.php`](file:///c:/Users/Gary/Documents/idrrms/path/to/file.php)
- Detailed bullet points of classes, methods, relations, or routes being added/updated.

---

### [Layer 2: Frontend / UI]

#### [NEW / MODIFY] [`path/to/Component.jsx`](file:///c:/Users/Gary/Documents/idrrms/path/to/Component.jsx)
- Detailed bullet points of UI components, hooks, styles, route registration, or state management.

---

## Verification Plan

### Automated Tests
- Backend feature tests: `composer --working-dir=backend test -- --filter=TargetTest`
- Frontend build / lint: `npm run build --prefix frontend` / `npm run lint --prefix frontend`

### Manual Verification
- Step-by-step browser walkthrough, UI flow, and responsive/accessibility validation.
```

---

## 4. Obtain User Feedback & Proceed

1. Present the implementation plan to the user with `request_feedback: true`.
2. Await user confirmation before executing code changes.
3. Upon approval, execute the plan, run automated tests, record test logs in `docs/test/`, and update the active memory log in `docs/memory/`.
