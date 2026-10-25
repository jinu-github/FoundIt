# FoundIt — Phase 1

A local-first Windows-friendly web library for screenshots/images, links, copied text, and notes. Built with React, TypeScript, Vite, and Dexie. The project brief is preserved in `FOUNDIt.md`.

## Run locally

Requires Node.js 22.12+ (verified with Node 24.20.0) and npm.

```powershell
cd D:\FoundIt
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/** in your browser. Keep the terminal running. The server binds only to the local machine; it serves frontend files and does not store your library. Dependencies require internet access during installation; the application does not require an external service.

Always use the same browser profile and this exact origin. `localhost`, another port, private browsing, or another browser has separate storage. Strict port selection prevents silently starting at a different origin.

To serve the production build, stop the development server, then run:

```powershell
npm run build
npm run preview
```

## Features and limits

- Add images, HTTP(S) links, copied text, and notes.
- Edit titles, text/notes, URLs, and comma-separated tags. Tags are trimmed, lowercased, and deduplicated.
- Browse all items or an item type, view image previews, open images/links, and confirm permanent deletion.
- Titles: 200 characters; text/notes: 100,000 characters; tags: 20 per item, 40 characters each.
- Images: nonempty PNG, JPEG, WebP, or GIF, at most **10 MiB (10,485,760 bytes)** each. Unsupported or corrupt images show an unavailable-preview message. Original files are retained without base64 conversion.
- Loading, empty, success, validation, and storage-failure states; responsive layout, form labels, and visible keyboard focus.

## Local storage and privacy

IndexedDB database `foundit-library` uses schema version 1. `items` contains metadata with UUIDs and creation/update timestamps; `images` contains one original Blob per image ID. Saving and deleting use a single transaction spanning both tables, so a failed image write/delete rolls back its metadata operation. Editing image metadata retains the existing blob. Future schema changes must add an explicit Dexie version and tested upgrade.

No backend API, account, cloud service, external fonts, analytics, telemetry, or AI is included. Saved content is rendered as text; URLs are limited to HTTP(S) without embedded credentials. Links open only when clicked, in a separate tab without a referrer/opener. Temporary image object URLs are revoked on unmount.

Use **Protect local storage** to request persistent storage where the browser supports it. A browser may deny this request. Clearing site data, deleting the browser profile, or using private browsing can still lose data. **There is no backup/restore yet.** Use one app tab at a time; refresh to see changes made in another tab. Canceling or switching away from an editor discards unsaved changes.

Search, OCR, backup/restore, PWA installation/service workers, Android, synchronization, accounts, and AI are outside Phase 1.

## Verification

```powershell
npm run typecheck
npm run lint
npm run test -- --run
npm run build
```

Automated tests cover all four data types, persistence across closing/reopening the database, metadata edits/timestamps, blob retention/cleanup, failed-write and failed-delete rollback, stale edits, validation boundaries, unsafe links, the note create/edit/reload/delete UI workflow, and storage-read error recovery. Tests use fake-indexeddb; they do not replace checking a real browser restart.

Manual acceptance checks in your preferred Windows browser:

1. Import a real PNG/JPEG/WebP/GIF. Inspect its thumbnail and full preview, then open the original image.
2. Try an unsupported file and an image larger than 10 MiB; check the message and that neither becomes a saved item.
3. Save one link, copied-text item, and note. Edit titles, URLs, text, and tags. Check category counts and creation/update times.
4. Open a saved link; confirm it opens a separate tab.
5. Close and reopen the browser using the same profile and `http://127.0.0.1:5173/`; confirm all items and image previews remain.
6. Delete a disposable image and note; refresh and confirm they stay deleted.
7. Navigate with Tab/Enter and check a narrow window. Request persistent storage and read the result.
