# VoxPlan — Authoritative Project Scope & Completion Register

**Version**: 1.0.0-baseline  
**Effective Date**: October 20, 2026  
**Status**: Authoritative Reference Document  
**Repository**: `https://github.com/kanwal-vyas/VoxPlan`  

---

## 1. Executive Definition: What VoxPlan Is & What Problem It Solves

### The Problem
Traditional sprint and task management applications are static, manual, and disconnected from reality:
- Users set arbitrary deadlines without knowing delivery risk or historical completion speed.
- Complex dependency chains are scheduled blindly, causing downstream bottlenecks.
- Algorithmic schedulers are opaque black boxes that silently scramble user schedules without explanation.
- Cloud productivity tools compromise user privacy by transmitting personal tasks and notes to remote servers and third-party LLMs.

### The Solution: VoxPlan
**VoxPlan** is a local-first, privacy-preserving, predictive task and scheduling intelligence platform. It combines:
1. **Deterministic constraint-based scheduling** (Kahn's DAG topological ordering, daily working capacity limits, multi-day chunking, and intraday focus windows).
2. **Supervised machine learning** (scikit-learn Random Forest estimating task delay risk and Gini feature importances).
3. **Empirical Bayesian personalization** (learning individual estimation bias with weighted median and Bayesian shrinkage toward 1.0).
4. **Natural-language and voice interaction** (Web Speech API dictation and typed command symmetry with zero cloud LLM transmission).
5. **Rigorous evidence-gated safety boundaries** (candidate weights evaluated in shadow mode only; production weights remain strictly immutable).

### Scope Distinction: Immediate Demo Milestone vs. Eventual v1.0 Release
- **Immediate 48–72 Hour Demo Milestone**: A rock-solid, repeatable demonstration of all core planning, scheduling, ML explainability, voice interaction, time-blocking, and shadow safety features.
- **Eventual v1.0 Final Project Milestone**: Formal WCAG 2.1 AA certification, encrypted backups, code-splitting, and offline PWA service worker (Phase 8).

---

## 2. Authoritative Scope Register

Every capability in VoxPlan is assigned to exactly one of the six authoritative categories:

```
[A. In Scope & Implemented] ────────► Core demonstrable engine & UI
[B. In Scope but Unfinished] ───────► None in core demo path
[C. Explicitly Out of Scope] ───────► Cloud accounts, third-party LLMs, mobile apps
[D. Deferred Until After Demo] ─────► Phase 8 release hardening (PWA, a11y audit, bundle split)
[E. Blocked or Conditional] ────────► Supervised weight adaptation (requires genuine PKI trust anchor)
[F. Superseded or Redundant] ───────► Legacy depth penalties, ad-hoc schedulers
```

### Category A: In Scope & Implemented (Independently Verified)

| Capability / Module | Implementation Artifacts | Verification Evidence |
|---|---|---|
| **Deterministic DAG Scheduling** | `src/scheduler/adaptiveScheduler.js` | Topological Kahn sort, unblocking bonuses, daily capacity clamping, weekend rollover. Verified by 81 automated tests. |
| **Supervised ML Risk & Explanations** | `backend/ml/`, `src/components/TaskExplanationModal.jsx` | Random Forest trained (88.3% accuracy, 92.9% F1). Gini feature importance & confusion matrix. 27 backend tests passing. |
| **Offline Resilience & Degradation** | `src/api/mlApi.js`, `src/App.jsx` | Client operates 100% offline if backend is unreachable; displays honest "Awaiting analysis" without crashing. |
| **Stopwatch Duration Tracking** | `src/telemetry/taskLifecycle.js`, `src/components/TaskList.jsx` | Live stopwatch accumulating focused seconds, distinguishing tracked from self-reported or unknown durations. |
| **Empirical Bayesian Duration Model** | `src/telemetry/personalModel.js`, `PersonalModelDashboard.jsx` | Weighted median ratio with Bayesian shrinkage ($K=3.0$), chronological walk-forward holdout validation. |
| **Behavioral Habit Insights** | `src/telemetry/behavioralStats.js`, `BehavioralHistoryPanel.jsx` | Category breakdown, estimation variance, weekday velocity, JSON telemetry export, double-confirmed history clear. |
| **Conversational Planning & Voice** | `src/conversation/`, `src/components/CommandBar.jsx` | Web Speech API voice dictation with typed fallback, clarification dialogs, confirmation safeguards. 232 tests passing. |
| **Intraday Time-Blocking & Focus** | `src/scheduler/timeBlockScheduler.js` | Half-open intervals `[start, end)`, meeting blackout collision avoidance, focus window scoring. |
| **Multi-Day Task Chunking** | `src/scheduler/taskChunker.js` | Partitions oversized tasks across daily capacity while preserving parent task identity. |
| **Visual Proposal Override Canvas** | `src/scheduler/proposalEditor.js`, `AdaptiveScheduleModal.jsx` | Manual day/time drag overrides on draft proposals with live metric recalculation and Undo/Revert stack. |
| **RFC 5545 iCalendar (.ics) Export** | `src/scheduler/icalExporter.js` | Standards-compliant `.ics` export strictly bound to accepted schedules; disabled before acceptance. |
| **Shadow-Only Adaptation Sandbox** | `src/scheduler/shadowSchedulerEvaluator.js`, `AdaptationSandboxCard.jsx` | Candidate weights isolated to shadow simulation; factory weights strictly immutable. |
| **Sampling Assurance Trust Boundary** | `src/scheduler/activationGateEvaluator.js` | Rejects unauthenticated caller claims; synthetic evidence isolated to simulation mode; production gate fails closed. |
| **Demo Seeding & Reset Utility** | `src/utils/demoDataSeeder.js`, `scripts/demoLauncher.mjs` | Deterministic 12-task showcase profile seeding with overwrite confirmation, versioned backup envelopes, non-demo task merge preservation, corrupted backup quarantine, atomic rollback, and selective teardown. 18 dedicated tests passing. |

### Category B: In Scope but Unfinished
- **None for the 72-hour demonstration milestone**. All core demonstration flows and safety boundaries are implemented and passing.

### Category C: Explicitly Out of Scope (Approved Architectural Exclusions)

| Capability | Architectural Rationale & Exclusion Justification | Approval Status |
|---|---|---|
| **Cloud User Accounts & Authentication** | VoxPlan is architected as an anonymous, local-first personal planning tool storing data in client `IndexedDB` and `localStorage`. Cloud auth introduces tracking and data liability. | Approved Product Boundary |
| **Centralized Database & Multi-User Sync** | Multi-device sync requires cloud conflict resolution (CRDT/OT) and remote databases. Local-first privacy is a foundational project pillar. | Approved Product Boundary |
| **External Cloud LLM APIs (OpenAI, Anthropic, etc.)** | All conversational planning uses deterministic local grammar and scikit-learn models. No task descriptions or transcripts are ever transmitted to third-party AI APIs. | Approved Architectural Decision |
| **Native Mobile Apps (iOS / Android)** | The project targets modern desktop/laptop browsers (Google Chrome, Microsoft Edge) where Web Speech API and complex scheduling layouts excel. | Approved Scope Exclusion |
| **Automated Background Production Adaptation** | Scheduler weights must remain frozen at canonical defaults (`50.0`, `100.0`, `15.0`, `25.0`). Automated adaptation without external PKI trust anchors is unsafe. | Approved Safety Boundary |

### Category D: Deferred Until After the Demo (Phase 8 Release Engineering)

| Stage & Feature | Scope & Rationale for Deferral | Resuming Prerequisite |
|---|---|---|
| **Stage 8.1: Full WCAG 2.1 AA Audit** | Comprehensive Axe-core automation and screen-reader audit. Basic keyboard navigation and ARIA tags are currently in place. | Post-demo release sprint |
| **Stage 8.2: Data Governance & Backup** | Web Crypto AES-GCM encrypted JSON backup and automated schema migrations. Standard JSON export is currently available in Section 04. | Post-demo release sprint |
| **Stage 8.3: PWA & Bundle Code-Splitting** | Service Worker offline caching and `React.lazy()` bundle splitting. Current bundle loads in ~20ms on `localhost`. | Post-demo release sprint |
| **Stage 8.4: CI Pipeline & Production Hosting** | Automated GitHub Actions CI workflow, CSP headers, and containerized deployment. Local Vite + Uvicorn run reliably. | Final v1.0 release |

### Category E: Blocked or Conditional

| Capability | Dependency & Blocking Condition | Current Disposition |
|---|---|---|
| **Phase 7 Stage 7.4.4B: Supervised Production Activation** | Requires genuine multi-tenant sampling assurance, cryptographic PKI trust anchors, and longitudinal multi-window data to detect shared macro-shocks. | **Permanently blocked in single-client local architecture**. Production adaptation remains safely locked (`isAdaptationUnlocked === false`). |

### Category F: Superseded or Redundant

| Previous Requirement / Design | Superseding Decision & Rationale |
|---|---|
| **Topological Depth Penalties (Phase 4.1)** | Superseded in Phase 4.4 by bounded downstream unblocking bonuses (`+ min(45, unblockCount * 15)`), eliminating critical-path churn. |
| **Public FNV-1a Checksum Provenance (Phase 7.4.4A.8)** | Superseded in Phase 7.4.4A.9: recognized that public checksums do not authenticate creator authority. Production gate now rejects caller-created evidence. |
| **Unstratified Cluster Bootstrap** | Superseded in Phase 7.4.4A.6 by explicit conditional cluster sampling inference. |

---

## 3. Specific Scope Boundaries Review

| Capability | Scope Classification | Current Status & Limitations |
|---|---|---|
| **Deterministic scheduling & hard constraints** | **In Scope & Implemented** | Kahn DAG order, daily capacity, weekend rollover. 100% verified. |
| **ML risk prediction and explainability** | **In Scope & Implemented** | FastAPI Random Forest online. Gracefully falls back to offline mode. |
| **Conversational planning & voice rescheduling** | **In Scope & Implemented** | Web Speech API on Chromium; typed fallback on Firefox. |
| **Time-blocking, multi-day chunking, .ics export** | **In Scope & Implemented** | RFC 5545 export verified on accepted schedules. |
| **Bayesian shrinkage & shadow evaluation** | **In Scope & Implemented** | Evaluates candidate weights without production weight mutation. |
| **Supervised production adaptation** | **Blocked / Conditional** | Stage 7.4.4B intentionally unstarted. Weights remain frozen. |
| **Production sampling trust anchor** | **Blocked / Conditional** | Local-first architecture lacks cross-client PKI registry. |
| **Encrypted backup & retention governance** | **Deferred (Phase 8.2)** | Unencrypted JSON telemetry export currently supported. |
| **Offline PWA & Service Worker** | **Deferred (Phase 8.3)** | Local dev & build operate offline; PWA cache deferred. |
| **WCAG 2.1 AA Accessibility** | **Deferred (Phase 8.1)** | Keyboard nav & ARIA present; formal audit deferred. |
| **Bundle code-splitting** | **Deferred (Phase 8.3)** | Bundle is 1,052 kB uncompressed; load time is ~20ms locally. |
| **CSP, dependency audit, CI/CD** | **Deferred (Phase 8.4)** | Local test suites passing; remote CI pipeline deferred. |
| **Cloud accounts & multi-user sync** | **Explicitly Out of Scope** | Local-first privacy architecture strictly preserved. |
| **External LLM APIs** | **Explicitly Out of Scope** | 100% deterministic local algorithms; zero cloud data transmission. |

---

## 4. Testable Definition of "VoxPlan is Complete"

VoxPlan achieves the definition of **Demonstration Complete** when all of the following conditions are verified:
1. **Application Launch**: Starts with a single command (`npm run demo` or `run-demo.bat`) with zero port conflicts and active readiness checks.
2. **Task Operations**: Allows manual and natural-language creation, title edits, priority changes, due-date adjustments, and deletions.
3. **Focus Tracking**: Stopwatch timers track working seconds, surviving page reloads without conflating elapsed wall-clock time.
4. **Machine Learning**: Predicts task delay risk, displays Gini feature importances, and provides honest explanations without fabrication.
5. **Adaptive Scheduling**: Generates deterministic schedules respecting DAG dependencies, daily capacity, focus windows, and multi-day chunking.
6. **Proposal Interaction**: Supports manual overrides on the visual canvas with real-time validation, undo/revert, and acceptance.
7. **Schedule Export**: Exports RFC 5545 compliant `.ics` calendar files upon user acceptance.
8. **Behavioral Intelligence**: Renders habit trends and walk-forward duration estimation curves when seeded with showcase observations.
9. **Safety Boundaries**: The Adaptation Sandbox visibly enforces "Shadow-Only" evaluation, rejects synthetic claims in production, and guarantees factory weights remain invariant.
10. **Test Integrity**: 100% passing test suites across both frontend (`npm test`, 861 tests) and backend (`pytest`, 27 tests).

---

## 5. Risk-Based Completion Matrix

### List 1: Next 48–72 Hours (Immediate Demo Readiness Focus)

| Item | Priority | Status | Verification Method | Blocker / Dependency |
|---|:---:|:---:|---|---|
| **Demo Launch Orchestration** | P1 | **DONE** | Tested `node scripts/demoLauncher.mjs --no-open` | None |
| **Showcase Profile Seeding & Teardown** | P1 | **DONE** | Tested `node --test tests/demo_data_seeder.test.js` (37/37 passed) | None |
| **Header Demo Control UI** | P1 | **DONE** | Verified in browser subagent walk-through | None |
| **End-to-End Demo Journey Verification** | P1 | **DONE** | Browser subagent walk-through and recording generated | Chromium browser for voice |
| **Presenter Runbook Documentation** | P2 | **DONE** | Documented in `README.md` and `PROJECT_SCOPE.md` | None |

### List 2: After the Demo (Phase 8 v1.0 Release Roadmap)

| Item | Priority | Estimated Effort | Target Phase | Dependencies |
|---|:---:|:---:|:---:|---|
| **WCAG 2.1 AA Formal Audit** | P2 | 8–12 hours | Phase 8.1 | Axe-core test integration |
| **Web Crypto AES-GCM Encrypted Backup** | P2 | 6–8 hours | Phase 8.2 | Web Crypto API |
| **Bundle Code-Splitting & Lazy Loading** | P3 | 4–6 hours | Phase 8.3 | React.lazy / dynamic import |
| **Offline PWA Manifest & Service Worker** | P3 | 6–8 hours | Phase 8.3 | Workbox or native sw.js |
| **Automated GitHub Actions CI Workflow** | P2 | 4–6 hours | Phase 8.4 | GitHub repo permissions |
| **Supervised Production Activation (Stage 7.4.4B)** | P3 | Conditional | Post-v1.0 | External PKI Trust Anchor |

---

## 6. Authoritative Presenter Runbook (5-Minute Demonstration)

1. **Launch**:
   Run `npm run demo` in the terminal. The launcher verifies Node/Python, checks ports 5173/8000, starts any missing services, and opens Google Chrome to `http://localhost:5173/`.
2. **Seed Showcase Data**:
   Click the **⚡ Demo Seed** button in the header. Confirm the dialog. This populates 8 completed tasks and 4 active tasks with compliant Schema v2 telemetry.
3. **Showcase ML & Explanations**:
   Scroll to Section 01 & 02. Notice delay risk tags. Click any risk tag to open `TaskExplanationModal`, showing Random Forest baseline probability, personal Bayesian shrinkage, and Gini feature importance.
4. **Demonstrate Adaptive Scheduling**:
   In Section 01, click `Adaptive Schedule`. Highlight:
   - Topological dependency order (Task A2 scheduled after Task A1).
   - Multi-day chunking (Task A3 8.0h task split across days).
   - Intraday focus windows avoiding meeting blackouts.
   - Drag a session on the visual canvas, test Undo, and click `✓ Apply Schedule`.
5. **Export to Calendar**:
   Click `Export Calendar (.ics)` to download the accepted schedule.
6. **Showcase Personal Intelligence & Habits**:
   Scroll to Section 04 (Habit Insights) and Section 05 (Personal Model Dashboard). Highlight the walk-forward holdout curves and Bayesian shrinkage ($K=3.0$).
7. **Explain Safety Architecture**:
   Open the Adaptation Sandbox tab in the modal. Point to the **Shadow-Only** badge and the **No Production Trust Anchor Configured** disclosure, demonstrating that production scheduler weights are permanently protected against unauthorized automated modification.
8. **Reset**:
   Click **Reset** in the header to return the application to clean default welcome state.
