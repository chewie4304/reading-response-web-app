# Changelog

All notable changes to the Reading Response Web App will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Full keyboard accessibility (`ArrowDown`, `ArrowUp`, `Tab`, `Enter`) for the student type-ahead search box.
- Filter responses by grade level on Teacher Dashboard.
- Export responses to CSV button.

### Changed
- Replaced native `<datalist>` dropdown with a custom type-ahead search box to prevent accidental student name selections.
- Cleaned student name parsing and display to exclude trailing grade tags and commas.
- Refactored array indexing across `app.js` using `.at()` for safer data access.

### Fixed
- Fixed grade badge display issue when selecting a student by ensuring grade level properties are properly assigned.
- Fixed initial data loading runtime error caused by deprecated call to `populateStudentDatalist`.

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