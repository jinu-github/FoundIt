# FoundIt --- Project Brief for Codex

## 1. Project summary

**FoundIt** is a personal, searchable library for information people
save but struggle to find later. It should help users collect and
retrieve:

-   Screenshots and other images
-   Web links
-   Copied text
-   Personal notes

The first version is for personal use on Windows. The longer-term goal
is to add an Android companion and, only after the local-first workflow
is reliable, explore optional cross-device synchronization.

**Core promise:** save useful information quickly, then find it later
without remembering which folder, app, or conversation it came from.

## 2. Product principles

1.  **Local-first:** user data stays on the user's device by default.
2.  **No AI requirement:** no generative AI, LLM API, paid API, or cloud
    AI is needed.
3.  **Privacy by default:** OCR and search should run locally. Do not
    upload saved content.
4.  **Free to develop and use:** prefer open-source packages and
    browser/device capabilities. Do not introduce paid services.
5.  **Reliable over flashy:** data integrity, search quality, backup,
    and restore matter more than decorative UI.
6.  **Incremental development:** implement one phase at a time; do not
    scaffold every future feature immediately.
7.  **Honest UX:** explain when OCR is processing, when it fails, and
    what data is stored locally.
8.  **Accessible and responsive:** usable on desktop widths and
    adaptable to smaller screens, even though Windows is the first
    target.

## 3. Initial platform and proposed stack

Start with a Windows-friendly web app that can later be installed as a
Progressive Web App (PWA).

-   **Frontend:** React + TypeScript + Vite
-   **Local database:** IndexedDB using Dexie.js
-   **OCR:** Tesseract.js, running locally in the browser
-   **Search:** local full-text search, initially MiniSearch or a
    similarly lightweight library
-   **Styling:** choose a maintainable, accessible approach that fits
    the existing repository; do not add a large UI framework without a
    reason
-   **Testing:** use the repository's existing test tools if present;
    otherwise choose a lightweight setup suitable for the stack
-   **Package manager:** respect the repository's existing lockfile and
    package manager

Before adding dependencies or changing project structure, inspect the
existing repository. If a project already exists, adapt it rather than
replacing it wholesale.

Do not add a backend, account system, cloud database, analytics,
telemetry, or external AI service to the MVP.

## 4. Main user workflows

### A. Save information

The user should be able to:

-   Import an image or screenshot from the computer.
-   Paste or enter a URL.
-   Paste copied text.
-   Create a note.
-   Give an item a title.
-   Add or remove tags.
-   Edit and delete saved items.
-   See when an item was created or last updated.

Saving should require as few steps as practical.

### B. Find information

The user should be able to search across:

-   Titles
-   Notes and saved text
-   URLs
-   Tags
-   OCR-extracted text from images

Search should be local. Results should show useful context, such as the
matching text or a short snippet, when practical. Provide basic filters
by item type and tags.

OCR text can contain mistakes. Preserve the original image and allow
users to edit metadata or add their own notes/tags so an item remains
findable even when OCR is imperfect.

### C. Keep data safe

The app should persist data across normal browser/app restarts. It
should request persistent browser storage where supported, but must not
promise that browser storage can never be cleared or lost.

A later backup phase must support exporting and restoring the user's
library. Do not claim data is backed up unless an export was actually
created.

## 5. Data model direction

Use stable IDs and explicit schema versions. Adapt the exact schema to
the implementation, but keep the following concepts separate where
appropriate:

-   `id`: stable unique identifier
-   `type`: image, link, text, or note
-   `title`
-   `url`: for link items, when applicable
-   `textContent`: pasted text or note body, when applicable
-   `ocrText`: text extracted from images
-   `tags`
-   `createdAt`
-   `updatedAt`
-   `sourceDevice`: optional metadata for future cross-device workflows
-   `deletedAt`: reserve for future sync/tombstone behavior only if it
    is useful; do not implement sync now
-   image blob/file data stored in IndexedDB rather than converted to
    large base64 strings in ordinary metadata records

Avoid storing the same large image content in multiple places. Define
clear TypeScript types and validation for persisted records. Use
migrations or versioned database upgrades when the schema changes.

## 6. OCR and search requirements

-   OCR must run on-device/in-browser with Tesseract.js; do not send
    images to a remote service.
-   Make OCR status visible: queued/processing, completed, or failed.
-   Avoid blocking the whole interface during OCR.
-   Handle large images and OCR errors gracefully.
-   Store OCR output so reopening the app does not require re-running
    OCR on every image.
-   Provide a way to retry OCR if it fails.
-   Index only the fields needed for search, and update the index when
    relevant item fields change.
-   Rebuild the search index from persisted data if necessary; the index
    should not be the only copy of user data.
-   Add tests for indexing, editing, deleting, and searching items.

## 7. Backup and restore --- planned phase, not necessarily first implementation

Use a documented, versioned archive format, likely a ZIP containing a
manifest, item metadata, OCR text, and original image files.

Restore must validate the archive and its version before changing the
library. Provide a clear choice between restoring into an empty library
and merging with the current library. Avoid silently overwriting
existing items. Define duplicate handling using stable IDs and/or
content fingerprints. Test invalid, corrupt, unsupported-version, and
duplicate-containing archives.

Do not invent custom encryption. If password-protected backups are added
later, use a reputable, maintained implementation and document the
limitations.

## 8. Android and synchronization --- future phases

Android is not part of the initial Windows MVP.

When the web MVP is stable, evaluate a Flutter Android companion that
can receive shared images, URLs, and text through Android's Share menu.
Reuse the documented export/import format where practical.

Manual export/import can be the first way to move data between devices.
Cross-device sync is a separate design decision and must not be implied
to exist just because both apps use local storage.

Before implementing sync, compare free/low-cost options and clearly
explain trade-offs, privacy implications, conflict handling, and
possible future operating costs. Do not add a paid service without
explicit approval.

## 9. Phases and acceptance criteria

### Phase 0 --- Repository inspection and implementation plan

-   Inspect the current folder, package files, existing code, and
    available tests.
-   Report what already exists and what should be reused.
-   Identify relevant risks and propose the smallest first milestone.
-   Do not overwrite or delete existing work.
-   Ask before making large architectural changes if the repository's
    current state conflicts with this brief.

### Phase 1 --- Basic local library

Implement a usable app shell and local persistence for images, links,
pasted text, and notes.

Acceptance criteria:

-   The user can add each supported item type.
-   The user can edit titles, notes/text, and tags.
-   The user can view, open, and delete saved items.
-   Items remain after a normal app/browser restart.
-   Image blobs are stored in IndexedDB without base64 duplication.
-   Empty, loading, success, and error states are handled.
-   Core data operations have automated tests.
-   No login, cloud sync, AI API, or backend is required.

### Phase 2 --- OCR and search

Acceptance criteria:

-   Importing an image can trigger local OCR.
-   OCR progress and failures are visible, and retry is possible.
-   OCR text is persisted.
-   Search finds terms in titles, notes, text, URLs, tags, and OCR text.
-   Results include useful matching context when feasible.
-   Search and OCR behavior have automated tests.

### Phase 3 --- Backup and restore

Acceptance criteria:

-   The user can export a versioned archive containing all necessary
    metadata and original images.
-   The user can restore from a valid archive.
-   Restore validates content before modifying the database.
-   Merge/restore behavior and duplicate handling are explicit.
-   Invalid or unsupported archives do not partially corrupt the current
    library.
-   Backup and restore have automated tests.

### Phase 4 --- Installable desktop/PWA polish

Evaluate PWA installability and offline behavior. Add it only if it does
not compromise the reliability of local data storage. Document supported
browsers and any limitations.

### Phase 5 --- Android companion

Plan and implement a Flutter app only after the web app's data model and
archive format are stable. Prioritize Android Share-menu capture, local
persistence, and search.

### Phase 6 --- Optional synchronization research

Research viable approaches before implementing. Do not assume a free
tier will remain free. No synchronization implementation until its
costs, security, conflicts, and user experience are understood.

## 10. UI direction

Aim for a calm, practical information-organizer interface rather than a
generic admin dashboard.

Suggested layout:

-   A compact sidebar or navigation area for All Items, Images, Links,
    Text, and Notes
-   A prominent search field
-   A clear Add/Import action
-   A results grid or list that suits image-heavy content
-   A details view for the selected item, including title, tags, notes,
    and OCR text
-   Useful empty states that explain how to add the first item

Prioritize legibility, keyboard usability, responsive behavior, and
efficient retrieval. Avoid unnecessary animations, excessive gradients,
and decorative UI that slows down common actions. Do not spend the first
milestone polishing a large design system before storage works.

## 11. Security, privacy, and data integrity

-   Do not transmit user content to third-party services.
-   Do not add telemetry or analytics by default.
-   Sanitize and safely render saved text and URLs; do not render
    arbitrary saved HTML as trusted markup.
-   Validate imported files and user-provided values.
-   Handle unsupported or unusually large images gracefully.
-   Revoke temporary object URLs when no longer needed.
-   Avoid logging private notes, OCR contents, or full URLs to the
    console.
-   Explain that clearing site data/browser data may delete a local
    library unless it has been exported.
-   Use safe database upgrades and test them.
-   Never claim a feature works without testing it.

## 12. Development workflow for Codex

For each phase:

1.  Inspect the relevant code before editing.
2.  State a short implementation plan and list the files likely to
    change.
3.  Implement only the current phase and its necessary foundations.
4.  Add or update automated tests.
5.  Run the relevant tests, typecheck, lint, and build commands
    available in the repository.
6.  Fix regressions caused by the changes.
7.  Summarize changed files, decisions, test results, and any
    limitations.
8.  List the exact manual checks the user should perform.

Do not silently skip failing checks. Distinguish tests that passed,
failed, were skipped, or could not be run. Do not proceed to the next
phase automatically.

## 13. First milestone definition

The first milestone should be **Phase 0 followed by a small, testable
Phase 1 implementation**. Do not implement OCR, backup/restore, Android,
or synchronization in the first pass unless the user explicitly requests
a change to scope.

The first milestone is complete when a user can create, view, edit, and
delete image, link, text, and note items, add tags, close and reopen the
app, and still see the saved data.

## 14. Initial prompt to give Codex

Use this prompt after placing `FOUNDIt.md` in the project root:

> Read `FOUNDIt.md` completely and treat it as the project brief.
>
> First inspect the current repository, its package manager, scripts,
> dependencies, architecture, and tests. Do not modify files yet. Tell
> me:
>
> 1.  What already exists and what can be reused.
> 2.  Any conflicts between the repository and `FOUNDIt.md`.
> 3.  Your proposed minimal implementation plan for Phase 1.
> 4.  The files you expect to add or change.
> 5.  The commands you will run to verify the work.
>
> Keep the scope limited to the Phase 1 basic local library. Do not
> implement OCR, backup/restore, Android, cloud sync, accounts,
> analytics, or AI. Do not introduce paid services.
>
> After reporting the inspection and plan, stop and wait for my approval
> before editing files. Preserve existing work and avoid broad rewrites.

------------------------------------------------------------------------

## Product decisions to keep in mind

-   The app is called **FoundIt**.
-   The first target is Windows desktop usage through a local-first web
    app/PWA.
-   Android support is a future companion app, not a requirement for the
    first milestone.
-   The MVP does not require AI.
-   The MVP must not require an account, backend, or paid service.
-   Reliability, local search, data ownership, and backup are more
    important than adding many features quickly.
