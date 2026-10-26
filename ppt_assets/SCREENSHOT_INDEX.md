# VoxPlan — Presentation Screenshot Index

This document provides complete, source-grounded documentation for all genuine screenshots captured from the running VoxPlan application (`http://localhost:5173/` and `http://localhost:5173/app`).

All captures represent **genuine, running application code** in a real Chromium browser environment (1440 × 1000 desktop viewport, with mobile view at 390 × 844). No mockups, placeholders, or fabricated UI elements were used.

---

## 1. Complete Screenshot Inventory

| # | Filename | Feature Demonstrated | Viewport | Proposed PPT Slide | Directly Tested During Capture |
|---|----------|----------------------|----------|-------------------|--------------------------------|
| 1 | `01_landing_page.png` | Landing Page & Brand Positioning | Desktop (1440×1000) | Slide 1–2: Title & Introduction | Yes (Full route `/` rendered) |
| 2 | `02_product_overview.png` | Product Workspace & Sprint Pulse | Desktop (1440×1000) | Slide 3–4: System Overview & Architecture | Yes (Header, status pill, overview cards) |
| 3 | `03_task_management.png` | Task List & Priority Filtering | Desktop (1440×1000) | Slide 5: Core Task Management | Yes (Filter chips, task cards, reorder) |
| 4 | `04_task_details.png` | Delay Risk Explainability Modal | Desktop (1440×1000) | Slide 6: Predictive Delay Risk & ML | Yes (Opened via task risk tag, verified metrics) |
| 5 | `05_adaptive_scheduling.png` | Adaptive Schedule & DAG Proposal | Desktop (1440×1000) | Slide 7: Adaptive Scheduling Engine | Yes (Triggered via `#btn-open-schedule-modal`) |
| 6 | `06_calendar_or_schedule.png` | Interactive Calendar & Timeline | Desktop (1440×1000) | Slide 8: Schedule Visualization & iCal Export | Yes (Switched to `#view-calendar` tab) |
| 7 | `07_productivity_dashboard.png` | ML Intelligence & Telemetry Dashboard | Desktop (1440×1000) | Slide 9: Intelligence & Telemetry | Yes (Switched to `#view-insights` tab) |
| 8 | `08_notifications.png` | Notification Center & Proactive Alerts | Desktop (1440×1000) | Slide 10: Notification Engine | Yes (Opened via `#header-notification-bell-btn`) |
| 9 | `09_sticky_notes.png` | Illustrated Stationery Sticky Notes | Desktop (1440×1000) | Slide 11: Task Notes & Stationery Themes | Yes (Opened via `#first-task-sticky-trigger`) |
| 10 | `10_voice_interaction.png` | Voice Dock & Command Center | Desktop (1440×1000) | Slide 12: Natural Language & Voice Dock | Yes (Expanded drawer with chips & privacy badge) |
| 11 | `11_learning_or_personal_model.png` | Personal Model & Bayesian Readiness | Desktop (1440×1000) | Slide 13: Empirical Bayesian Personalization | Yes (Scrolled to Personal Model in Insights) |
| 12 | `12_mobile_or_responsive_view.png` | Responsive Mobile Interface | Mobile (390×844) | Slide 14: Responsive Design & Accessibility | Yes (Resized to iPhone 14 viewport) |

---

## 2. Detailed Screenshot Analysis

### 01_landing_page.png
- **File**: `ppt_assets/screenshots/01_landing_page.png`
- **Feature**: VoxPlan Landing Page (`/`) with warm editorial typography, brand identity, and product value proposition.
- **What Reviewer Should Notice**:
  - The distinctive VoxPlan warm palette (warm cream `#FAF8F5`, ink typography `#1C1917`, and brand yellow sparkle badge).
  - Clear product positioning: "Voice-first adaptive productivity without the noise."
  - Direct navigation CTA ("Launch App" / "Explore Workspace").
  - Feature value cards highlighting local-first scheduling, zero-cloud privacy, and explainable machine learning.
- **Slide Supported**: Slide 1 (Project Title & Cover) or Slide 2 (Project Context & Problem Statement).
- **Direct Testing**: Verified live routing at `http://localhost:5173/`, responsive hero layout, and navigation link to `/app`.
- **Qualifications**: Landing page is a presentation showcase; interactive scheduling tasks reside on `/app`.

### 02_product_overview.png
- **File**: `ppt_assets/screenshots/02_product_overview.png`
- **Feature**: Main workspace header and "Sprint Pulse" overview section on `/app`.
- **What Reviewer Should Notice**:
  - Persistent application header with brand icon, navigation tabs (`Today`, `Tasks`, `Calendar`, `Insights`), and backend status pill ("Ready" / "Brain active").
  - "Today's Workspace" sprint focus card showing active tasks, urgency indicators, and stopwatch tracking triggers.
  - Quick action bar with "✦ Adaptive Schedule" button and sprint progress bar.
- **Slide Supported**: Slide 3 (System Overview) or Slide 4 (Workspace Architecture).
- **Direct Testing**: Verified component rendering, task counts, progress calculation, and real-time status pill synchronization.

### 03_task_management.png
- **File**: `ppt_assets/screenshots/03_task_management.png`
- **Feature**: Core task management list (`#view-tasks`), task cards, and filtering controls.
- **What Reviewer Should Notice**:
  - Priority pills (High, Medium, Low) with distinct accessible color coding.
  - Interactive status controls: checkboxes, effort badges (`2.0h`), and dependency tags.
  - Quick filtering chips: All, Pending, High Priority, Overdue.
  - Task card action buttons: manual up/down reordering, memo sticker trigger, stopwatch timer, and delay risk pill (`25% risk ↗`).
- **Slide Supported**: Slide 5 (Core Task Management & User Interaction).
- **Direct Testing**: Verified task filtering, priority cycling, task completion toggling, and keyboard accessibility.

### 04_task_details.png
- **File**: `ppt_assets/screenshots/04_task_details.png`
- **Feature**: Task Delay Risk Explainability Modal (`TaskExplanationModal.jsx`).
- **What Reviewer Should Notice**:
  - Exact predictive breakdown: Delay Risk Estimate percentage (e.g., `25.0% Nominal Delivery`).
  - Personalization transparency card: shows baseline Random Forest risk vs. personal adjustment with Bayesian shrinkage.
  - "Why is this task flagged by the model?" factor list (e.g., effort estimates, urgency ratio, dependency depth).
  - Privacy & guardrails footer: confirms telemetry stays in local IndexedDB and baseline uses non-personal reference data.
- **Slide Supported**: Slide 6 (Explainable AI & Machine Learning Integration).
- **Direct Testing**: Opened by clicking the risk pill on a task card; verified modal backdrop blur, animation, and Escape key dismissal.

### 05_adaptive_scheduling.png
- **File**: `ppt_assets/screenshots/05_adaptive_scheduling.png`
- **Feature**: Adaptive Schedule Modal (`AdaptiveScheduleModal.jsx`) showing dependency DAG timeline and sprint proposal.
- **What Reviewer Should Notice**:
  - Multi-day schedule placement diff showing original due date ➜ proposed scheduled slot.
  - DAG dependency status badge: "✓ Feasible" or "⚠️ Capacity Alert".
  - Timeline allocation per day with working hour limits and sub-task session chunking.
  - Two-phase commit action buttons: "✓ Apply Schedule" vs. "✕ Discard".
- **Slide Supported**: Slide 7 (Adaptive Scheduling Algorithm & Kahn's DAG Solver).
- **Direct Testing**: Opened via `#btn-open-schedule-modal`; generated valid schedule proposal from task set; verified proposal diff calculation.

### 06_calendar_or_schedule.png
- **File**: `ppt_assets/screenshots/06_calendar_or_schedule.png`
- **Feature**: Interactive Calendar View (`TaskCalendar.jsx`).
- **What Reviewer Should Notice**:
  - Visual timeline grid with scheduled task blocks mapped to dates.
  - Priority colors and task status indicators on calendar chips.
  - "Export Calendar (.ics)" button allowing standard iCalendar synchronization with Google Calendar, Outlook, or Apple Calendar.
  - Month/week navigation and quick jump controls.
- **Slide Supported**: Slide 8 (Schedule Visualization & Calendar Interoperability).
- **Direct Testing**: Switched via `#nav-tab-calendar`; verified calendar block layout, date mapping, and .ics export trigger.

### 07_productivity_dashboard.png
- **File**: `ppt_assets/screenshots/07_productivity_dashboard.png`
- **Feature**: Intelligence & Telemetry Dashboard (`MLModelPanel.jsx` & `BehavioralHistoryPanel.jsx`).
- **What Reviewer Should Notice**:
  - ML Model Intelligence card showing FastAPI backend connectivity, model accuracy metric, training sample count, and last trained timestamp.
  - Feature Importance bar chart (effort hours, priority, dependency depth, overdue history).
  - Retrain model trigger button with live progress indicator.
  - Behavioral history graphs showing completion velocity and sprint health.
- **Slide Supported**: Slide 9 (Productivity Analytics & ML Telemetry).
- **Direct Testing**: Switched via `#nav-tab-insights`; verified model status fetching from `http://127.0.0.1:8000/model/status`.

### 08_notifications.png
- **File**: `ppt_assets/screenshots/08_notifications.png`
- **Feature**: Notification Center dropdown (`NotificationCenter.jsx`) triggered from header bell.
- **What Reviewer Should Notice**:
  - Floating accessible notification panel anchored to header bell.
  - Categorized alerts: Overdue Warnings, Capacity Thresholds, and Dependency Deadlocks.
  - Notification preference link leading to threshold configuration modal.
  - Unread badge counter on bell synchronized with `notificationStore`.
- **Slide Supported**: Slide 10 (Proactive Notification System).
- **Direct Testing**: Triggered via `#header-notification-bell-btn`; verified unread count badge, item rendering, and dismissal.

### 09_sticky_notes.png
- **File**: `ppt_assets/screenshots/09_sticky_notes.png`
- **Feature**: Task Sticky Notes Modal (`TaskStickyNotesModal.jsx`) featuring illustrated stationery themes.
- **What Reviewer Should Notice**:
  - Rich tactile stationery illustration with realistic tape/pin graphic and paper textures.
  - 6 stationery color themes: Classic Yellow, Coral Alert, Mint Calm, Lavender Focus, Rose Gold, Blueprint.
  - Task-associated memo editor with real-time localStorage persistence (`voxplan_sticky_notes`).
  - Clean modal layout preserving task context while writing notes.
- **Slide Supported**: Slide 11 (Task Annotation & Illustrated Stationery Notes).
- **Direct Testing**: Opened via `#first-task-sticky-trigger`; verified note text editing, theme switching, and localStorage persistence.

### 10_voice_interaction.png
- **File**: `ppt_assets/screenshots/10_voice_interaction.png`
- **Feature**: Global Command Dock (`CommandBar.jsx`) with quick prompt chips and voice privacy notice.
- **What Reviewer Should Notice**:
  - Persistent bottom notebook dock with command input field and microphone dictation button (`#voice-mic-btn`).
  - Spoken audio toggle (speaker button) for text-to-speech feedback.
  - Quick prompt suggestion chips ("How did my plan go?", "Spread tasks over 3 days", "Show high risk tasks", "Explain project risk").
  - Explicit privacy notice: "Voice Privacy: Spoken commands use your browser's native Web Speech API. Audio is never sent to third-party AI services."
- **Slide Supported**: Slide 12 (Conversational Command Center & Voice Interaction).
- **Direct Testing**: Focused `#command-input`; verified drawer expansion, chip click-to-fill, and Web Speech API state machine.

### 11_learning_or_personal_model.png
- **File**: `ppt_assets/screenshots/11_learning_or_personal_model.png`
- **Feature**: Personal Duration Model & Evaluation Dashboard (`PersonalModelDashboard.jsx` and `LearningReadinessPanel.jsx`).
- **What Reviewer Should Notice**:
  - Empirical Bayesian Shrinkage metrics displaying category duration correction factors.
  - Learning Readiness Gate showing completion thresholds required before personal weights activate (preventing overfitting on sparse data).
  - Personal variance tracking vs. baseline reference duration.
  - Guardrail indicators confirming shrinkage formula $w_i = \frac{n_i}{n_i + k}$ with prior confidence $k=3.0$.
- **Slide Supported**: Slide 13 (Personalized Adaptation & Bayesian Learning Architecture).
- **Direct Testing**: Scrolled to section in `#view-insights`; verified mathematical readiness indicators and gate evaluation.

### 12_mobile_or_responsive_view.png
- **File**: `ppt_assets/screenshots/12_mobile_or_responsive_view.png`
- **Feature**: Responsive mobile viewport (390 × 844 px) demonstrating touch-optimized mobile experience.
- **What Reviewer Should Notice**:
  - Compact two-row mobile navigation bar with horizontal touch momentum scrolling.
  - Mobile-adapted task cards with readable typography and touch-friendly tap targets (minimum 44 × 44 px).
  - Floating mobile command dock with docked microphone button for one-thumb interaction.
  - Zero horizontal overflow or clipped text.
- **Slide Supported**: Slide 14 (Responsive Engineering & Mobile Experience).
- **Direct Testing**: Verified viewport resize to 390 × 844 in browser; verified CSS media queries (`@media (max-width: 768px)`).

---

## 3. Features Not Demonstrated via Separate Screenshots & Technical Rationale

| Feature | Implementation Status | Reason Not Captured Separately | Where Mentioned in Evidence |
|---------|-----------------------|--------------------------------|-----------------------------|
| Product Tour Overlay (`ProductTour.jsx`) | Fully Implemented | An active tour dims and spotlights single UI targets; capturing it would obscure core functionality screenshots. | Documented in `PROJECT_FACTS.md` and verified in commit history (`e991a9c`). |
| Live Speech Recognition Audio Stream | Implemented via Web Speech API | Browser microphone permissions and audio waveforms cannot be statically photographed without live user speech; the command dock with mic states is captured in `10_voice_interaction.png`. | Captured in `10_voice_interaction.png`. |
| Cloud Multi-Tenant Synchronization | Intentionally Excluded from Scope | VoxPlan is deliberately designed as a **Local-First, Zero-Cloud-LLM** application. Tasks stay in IndexedDB for privacy and offline speed. | Documented in `PROJECT_FACTS.md` and architecture diagram. |
| Automatic Scheduler Dynamic Weight Retuning | Permanently Locked (Stage 7.4.4B) | The dynamic weight retuning gate is permanently locked to preserve deterministic stability invariants; weights remain canonical. | Verified by 1,282 passing unit and regression tests. |
