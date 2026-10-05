# Changelog

All notable changes to the Reading Response Web App will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-10-05

### Added
- Added keyboard support to the Teacher Access passcode modal, allowing teacher to press the **Enter** key to log into the Teacher Dashboard directly without clicking "Access Dashboard."
- Added dynamic save status indicators (**"Saved"** / **"Not Saved"**) beside teacher comment fields to reflect edit state in real time.
- Added prompt hover tooltips/textboxes on Teacher Dashboard response cards, allowing teachers to view full prompt text by hovering over prompt titles.

## Changed
- Updated the "Save Comment" button on Teacher Dashboard cards to react to click events and provide immediate visual status confirmation upon saving to Supabase.

## [1.1.0] - 2026-09-27

### Added
- Added a **Student Submission History & Feedback Panel** positioned below the weekly response form, enabling students to review past reflections, rubric scores, and teacher comments.
- Added a **Show / Hide** toggle button for collapsing or expanding the student submission history section.
- Added student self-service controls allowing students to **edit** or **delete** their own submissions as long as they remain ungraded (`score1` and `score2` are null).
- Added a custom modal (`#student-edit-modal`) for students to update book details and prompt responses before grading.

### Changed
- Automatically hide student submission history when clearing or resetting the student selection input.
- Dynamically hide edit/delete controls on submission cards once a teacher assigns a score to preserve evaluations.

## [1.0.0] - 2026-09-27

### Added
- Migrated backend infrastructure from Google Apps Script / Google Sheets to Supabase PostgreSQL.
- Added Class Roster Management panel to Teacher Dashboard allowing teachers to view, edit, and delete student roster entries directly.
- Added in-dashboard "Change Passcode" feature backed by Supabase `reading_settings`.
- Replaced native browser popups (`confirm()`, `prompt()`) with custom styled modal dialogs for editing and deleting roster entries.

### Changed
- Refactored `app.js` to utilize the official `@supabase/supabase-js` client library.
- Prefixed all database tables (`reading_students`, `reading_prompts`, `reading_responses`, `reading_settings`) to support sharing a single free-tier Supabase project across multiple web apps.
- Corrected `index.html` stylesheet reference from `styles.css` to `style.css`.
- Secured passcode security by removing client-side recovery keys; emergency resets are handled via the Supabase Table Editor.

### Fixed
- Resolved page reload glitch on adding students by adding `e.preventDefault()` to form submit handlers.
- Corrected Supabase project domain URL string.
- Fixed field name mapping (`snake_case` vs. `camelCase`) for student response cards on the Teacher Dashboard.

## [0.3.0] - 2026-09-20

### Added
- Full keyboard accessibility (`ArrowDown`, `ArrowUp`, `Tab`, `Enter`) for the student type-ahead search box.
- Filter responses by grade level on Teacher Dashboard.
- Export responses to CSV button.
- Teacher comment field per prompt response, saved via a new `saveComment` backend action and displayed on the Teacher Dashboard.
- 14-day cooldown restricting students from resubmitting a prompt with a standard they already completed recently, enforced both client-side (disabled/labeled dropdown options) and server-side (`findCooldownViolation`).
- Client- and server-side validation preventing the same prompt from being selected for both Response 1 and Response 2 in a single submission.

### Changed
- Replaced native `<datalist>` dropdown with a custom type-ahead search box to prevent accidental student name selections.
- Cleaned student name parsing and display to exclude trailing grade tags and commas.
- Refactored array indexing across `app.js` using `.at()` for safer data access.
- Prompt dropdowns now submit raw prompt title instead of display label to match Google Sheet prompt titles.
- Teacher Dashboard reattaches standard label to prompt titles for display while preserving raw data for cooldown matching.

### Fixed
- Fixed grade badge display issue when selecting a student by ensuring grade level properties are properly assigned.
- Fixed initial data loading runtime error caused by deprecated call to `populateStudentDatalist`.
- Added `autocomplete="off"` and password-manager ignore hints (`data-lpignore`, `data-1p-ignore`, `data-bwignore`, `data-form-type`) to teacher passcode field to stop Bitwarden and password extensions from prompting to save it.

## [0.2.0] - 2026-09-20

### Added
- Integrated Google Sheets API backend via Google Apps Script Web App.
- Student autocomplete selection dynamically linking student name to grade level (`6th`, `7th`, `8th`).
- Grade-filtered curriculum prompt selection requiring two distinct prompt responses per submission.
- Real-time submission posting directly into Google Sheet `responses` tab.
- Protected Teacher Dashboard verifying passcodes from Google Sheet `settings` tab.
- Teacher tool to add new students directly to roster from dashboard.

## [0.1.0] - 2026-09-20

### Added
- Initial project structure with `index.html`, `styles.css`, `app.js`, and `CHANGELOG.md`.
- Student reading response form (Name, Book Title, Author, Response).
- Passcode-protected Teacher Dashboard modal with temporary passcode validation.
- Responsive mobile-friendly CSS layout.
- `.gitignore` for OS metadata files.