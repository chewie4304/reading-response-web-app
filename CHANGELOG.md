# Changelog

All notable changes to the Reading Response Web App will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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