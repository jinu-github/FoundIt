# FoundIt — Phase 3

A local-first Windows-friendly web library for screenshots/images, links, copied text, and notes, with local English OCR and full-text search. Built with React, TypeScript, Vite, Dexie, Tesseract.js, and MiniSearch. The project brief is preserved in `FOUNDIt.md`.

## Run locally

Requires Node.js 22.12+ (verified with Node 24.20.0) and npm.

```powershell
cd D:\FoundIt
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/** in your browser. Keep the terminal running. The server binds only to the local machine; it serves frontend files and does not store your library. Dependencies require internet access during installation; the application does not require an external service.

Use a current Windows Edge or Chrome browser with IndexedDB, Web Workers, WebAssembly, `createImageBitmap`, and Web Locks enabled. If Web Locks is unavailable, the library remains usable and shows why automatic OCR cannot start.

### OCR assets and development network access

`npm ci` downloads packages from npm, including pinned `tesseract.js`, `minisearch`, and `@tesseract.js-data/eng`. This is a development/setup download, not an upload of library content. Tesseract's optional donation-message postinstall is not required for recognition.

`npm run dev` and `npm run build` automatically run `npm run prepare:ocr`. That script **only copies installed files** into ignored `public/ocr/`: the browser worker, all available WASM/core variants, and English trained data. It makes no network requests. Vite copies these assets into `dist/ocr/` during the build. If files are missing, preparation fails; it does not substitute a CDN. Run `npm ci` to restore missing dependencies and then retry preparation.

At runtime, the app explicitly loads `/ocr/worker.min.js`, `/ocr/core/`, and `/ocr/lang/eng.traineddata.gz` from the same local origin. Tesseract's separate language cache is disabled; the reusable worker keeps the language loaded in memory for the current session. No remote fallback is configured. Keep the local server running even if disconnected from the internet.

Vite development and preview servers send a Content Security Policy restricting scripts, workers, and connections to the same origin. Development additionally permits its local HMR WebSocket and uses a per-server-start nonce for Vite's inline initialization script. Production preview does not permit external connections or inline scripts. If serving `dist` with another server, preserve the policy from `vite.config.ts` on **both HTML and worker responses** and serve at the origin root. No PWA/offline cache or service worker is included.

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
- Search titles, notes/copied text, URLs, tags, and extracted image text. Search is case-insensitive, supports word prefixes, and requires all entered terms. Results rank titles/tags more strongly and show a matching text excerpt when possible. Type and tag filters combine with the query; an empty query restores recently-updated ordering. This is lexical search, not semantic/AI search.
- Titles: 200 characters; text/notes: 100,000 characters; tags: 20 per item, 40 characters each.
- Images: nonempty PNG, JPEG, WebP, or GIF, at most **10 MiB (10,485,760 bytes)** each. Unsupported or corrupt images show an unavailable-preview message. Original files are retained without base64 conversion.
- Loading, empty, success, validation, and storage-failure states; responsive layout, form labels, and visible keyboard focus.

## Local storage and privacy

IndexedDB database `foundit-library` uses schema version 3. `items` contains metadata with UUIDs and creation/update timestamps; `images` contains one original Blob per image ID. Saving and deleting use a single transaction spanning both tables, so a failed image write/delete rolls back its metadata operation. Editing image metadata retains the existing blob and OCR result.

The version 1 → 2 migration adds pending OCR metadata to existing images and an OCR status index. It preserves original blobs, IDs, titles, notes, tags, and timestamps; non-image records are unchanged. Recognition starts after the migration transaction commits. Close other old-version tabs if they block an upgrade. Schema upgrades do not implement backup or restore.

OCR text/status are persisted in each image's metadata. Search indexes exist only in worker memory and are rebuilt from IndexedDB on every opening. Database subscriptions update the library and index after committed changes; a details editor keeps its unsaved local draft while OCR or another tab changes the database. OCR completion only patches its own fields and leaves manual edit timestamps unchanged. If another tab deletes the item being edited, saving reports that it no longer exists instead of recreating it.

No backend API, account, cloud service, external fonts, analytics, telemetry, or AI is included. Saved content is rendered as text; URLs are limited to HTTP(S) without embedded credentials. Links open only when clicked, in a separate tab without a referrer/opener. Temporary image object URLs are revoked on unmount.

Use **Protect local storage** to request persistent storage where the browser supports it. A browser may deny this request. Clearing site data, deleting the browser profile, or using private browsing can still lose data. **Export backups regularly using Backup and restore.** Multiple tabs share database updates; only one holds the OCR processing lock. Avoid editing the same item simultaneously in multiple tabs: the last manual save wins. Canceling or switching away from an editor discards unsaved changes.

## OCR behavior and limitations

- Importing an image, or upgrading an existing Phase 1 image, queues English OCR automatically. The UI shows **pending**, **processing**, **completed**, or **failed**. Processing is sequential in a browser worker, so the library remains available.
- Successful text is saved once and reused after reload. An empty result is completed with “No text detected.” English recognition can misread handwriting, tiny text, rotated layouts, low contrast, or other languages. Original images, notes, and tags remain available regardless of OCR accuracy.
- Failed items show a safe error and **Retry OCR**. Failures do not retry forever. Restarting the app recovers interrupted processing jobs with new job identifiers; completed jobs are not repeated. Stale results cannot overwrite a newer attempt or recreate a deleted item.
- The import limit remains 10 MiB. OCR refuses decoded images above 40 megapixels; larger accepted working images are reduced to at most 6 megapixels and a 4,000-pixel longest edge without changing the stored original. Decoding itself still consumes browser memory; a compressed image can be expensive to decode.
- Each OCR attempt has a two-minute deadline including decoding/initialization. A failure or timeout resets the worker for later jobs. Keep a tab open to process the queue; closing the app stops processing until reopening. Browser background throttling can slow recognition.
- Full-text indexing/search runs in a separate worker with a short input debounce. Index memory and initial rebuild time grow with the library; this version does not promise unlimited library size.

PWA installation/service workers, Android, desktop packaging, synchronization, accounts, and generative AI remain outside scope.

## Verification

```powershell
npm run typecheck
npm run lint
npm run test -- --run
npm run build
```

Automated tests retain Phase 1 coverage and add a real v1→v2 test-database migration, OCR persistence, interrupted-job recovery, stale/deleted-job rejection, sequential processing, timeout/failure/retry/empty results, local asset configuration, image decode limits, all searchable fields, index rebuilding, editing/deletion, snippets, and preserving an unsaved editor draft during OCR updates. OCR is mocked; tests do not depend on recognition accuracy or live language downloads. fake-indexeddb does not replace checking a real browser restart.

Manual acceptance checks in your preferred Windows browser:

1. Import a real PNG/JPEG/WebP/GIF. Inspect its thumbnail and full preview, then open the original image.
2. Try an unsupported file and an image larger than 10 MiB; check the message and that neither becomes a saved item.
3. Save one link, copied-text item, and note. Edit titles, URLs, text, and tags. Check category counts and creation/update times.
4. Open a saved link; confirm it opens a separate tab.
5. Close and reopen the browser using the same profile and `http://127.0.0.1:5173/`; confirm all items and image previews remain.
6. Delete a disposable image and note; refresh and confirm they stay deleted.
7. Navigate with Tab/Enter and check a narrow window. Request persistent storage and read the result.

### Phase 2 manual checklist

1. **Accuracy:** import a clear English screenshot with a distinctive word that is absent from its title, notes, and tags. Observe pending/processing/completed, compare extracted text with the original, and search for that word. Try handwriting, blurry text, and an image with no text; errors or imperfect recognition must leave the original usable.
2. **Search:** try title, note, copied-text, URL, tag, and OCR terms; combine type/tag filters and clear the query. Edit a matching term away and confirm the old search no longer matches; delete a disposable result and confirm it remains absent after reload.
3. **Draft preservation:** while a new image processes, edit its title, notes, and tags without saving. Allow OCR to finish. Confirm your draft is unchanged, then save and check that OCR text remains.
4. **Reload recovery:** reload while an image is processing. It should resume from pending and eventually finish. Reload completed items and confirm their text remains without another processing cycle. Delete a disposable image during OCR and confirm no late result recreates it.
5. **Failure/retry:** use DevTools request blocking for the local English language asset, reload to discard the in-memory OCR worker, and import a disposable image. Confirm failure. Unblock the asset and click Retry OCR; confirm completion. Do not clear site storage for this check.
6. **Local-only network:** run the production preview, open DevTools Network, enable Preserve log and Disable cache, then reload and import a new image. Worker, core/WASM and language requests must all be under `http://127.0.0.1:5173/ocr/`. The search worker must also be local. There should be no CDN, OCR API, analytics, or content-upload request. Open the worker response headers and confirm `connect-src 'self'` and `script-src 'self' 'wasm-unsafe-eval'`. Some core variants embed WASM in their `.wasm.js` file instead of making a separate `.wasm` request.
7. **Internet independence:** with dependencies/assets already installed, disconnect external internet access while keeping the local server reachable, reload, and import a fresh screenshot. OCR and search should still work. Do not use DevTools' global Offline mode, which can also block required localhost asset requests.

During implementation, the production preview recognized the existing test screenshot under the same-origin-only policy, and searching an extracted-only word returned it. Local worker/core/language endpoints returned HTTP 200 with that policy. Broader OCR accuracy and full Windows browser-restart checks remain manual.

## Phase 3: local backup and restore

Open **Backup and restore** above the search bar. Exports include all saved item types, tags, notes/text, URLs, timestamps, original images, and OCR results/status. Unsaved editor drafts are not included and remain open during backup operations.

**Backups are unencrypted.** Anyone with the ZIP can read your private content. Store it securely, outside browser site storage, and keep a known-good copy before reorganizing or clearing data. Checksums detect damage; they do not prove a backup came from a trusted source. Export is manual, not an automatic or cloud backup.

### Export

1. Click **Export backup**. On supported Edge/Chrome versions, choose the local destination in the Save File picker; the ZIP is streamed to that file.
2. If the picker is unavailable, a regular download is offered instead. Confirm that the file actually appears in your downloads; the app cannot verify that you kept it.
3. Keep the ZIP unchanged. This version writes ZIP STORE entries (no compression); recompressing or password-protecting it makes it unsupported for restore.

The export captures a consistent snapshot of saved data. Edits and OCR finishing later are not included until another export. Completed OCR text is preserved. A processing job is recorded as processing and will safely return to pending when restored.

### Restore or merge

1. Choose a `.zip` using **Choose backup to validate**. Validation checks every entry, checksum, metadata field, and image reference before offering Restore. Nothing is inserted into the live library during validation.
2. Review the counts and list of conflicting IDs. **Merge** adds new IDs and skips existing IDs, keeping their current content even if the backup version differs. Backup versions of skipped IDs are not restored. Different IDs remain separate even if their content is identical.
3. Select **Restore into empty library** only when the library is empty. It never clears or replaces existing data. Otherwise use Merge.
4. Click **Restore validated backup**, or **Cancel restore**. Final counts are recalculated because another tab may have added/deleted items since the preview. A failed final transaction leaves the live library unchanged. You can retry or cancel after resolving a storage error.
5. Check the final skipped-ID list, search restored items, and verify image previews. Completed OCR is reused; failed OCR keeps its retry option. Interrupted processing jobs receive fresh tokens and can resume.

Restore requires Web Locks (current Edge/Chrome). Only one tab may hold a restore session per library. Finish/cancel its preview, or close that tab, before starting in another. The app never times out another tab's staging data. If a tab crashes or closes, its browser lock is released and the next restore session cleans abandoned staging before validation. Cleanup failure may leave temporary storage behind until a later successful session; it does not expose staged items to OCR/search.

### Limits, storage, and setup

- ZIP import/export limit: 512 MiB; download fallback: 128 MiB. Export reserves 3 MiB for manifest/headers, reducing the payload budget.
- At most 5,000 items, 16 MiB of item metadata (including OCR text), and 2 MiB of manifest data. Existing per-item field and 10 MiB image limits still apply. Excess data is rejected, never truncated or silently omitted.
- Restore requires temporary staging storage plus room for the final data and IndexedDB's transaction overhead. Browser quota and memory behavior vary. Close unnecessary tabs and retain the backup file if storage runs out; do not clear your only library to make space.
- Original image buffers are handled sequentially; export retains a snapshot of Blob references. Browser implementations may still use substantial memory. Representative large-library testing remains necessary.
- `npm ci` downloads the pinned `@zip.js/zip.js` package during development/setup. Backup and restore operate entirely locally at runtime, with ZIP compression and ZIP workers disabled. They do not fetch remote codecs, use an API, or relax the existing Content Security Policy.
- IndexedDB upgrades from v2 to v3 add only two temporary staging stores; existing items, images, OCR and indexes are preserved. The search index remains rebuildable from live items.

See [the versioned archive specification](docs/backup-format.md) for paths, schema, validation rules, restore transaction boundaries, and concurrency details. No encryption, cloud storage, Android, desktop packaging, or later phase is included.

### Phase 3 manual checklist

1. Export a library containing all four item types, tags, URLs, images, completed/failed/pending OCR. Verify that a ZIP is actually saved. Open its manifest and confirm originals are present. Keep this backup safe.
2. Use a separate disposable browser profile at the same origin to restore into an empty library. Compare image originals, tags, notes, OCR text, and timestamps, then reload and search for an OCR-only term. Do not clear your working library for testing.
3. Import the same archive again using Merge. All existing IDs should be skipped. Edit an item first and confirm the merge leaves the edit intact. Compare preview and final conflict lists.
4. While an editor contains an unsaved draft, export and merge a backup with new IDs. Confirm the draft remains untouched and restored items become searchable. Save the draft normally afterward.
5. Open two tabs. Leave a validated restore preview in one; starting a restore in the other must report that the library is busy without deleting staging. Close the first tab, then retry in the second; abandoned staging should be cleaned safely.
6. Close/reload a tab during validation. Reopen and verify that no partially restored items appear. Repeat during final commit with disposable data: the result must be all accepted items or none, never orphan metadata/images.
7. Try a truncated ZIP, unsupported archive version, altered image bytes, and an unrelated ZIP. Each must fail before changing live data. Test a quota failure in a disposable profile if feasible; compare the library before and after.
8. With an image processing, export; delete that disposable image and restore the backup. Confirm old OCR work does not overwrite the restored job. Completed OCR should remain completed after restore/reload.
9. Try Save File export and (where unavailable) the download fallback. Cancel the picker; simulate a failed file write if feasible. Neither should claim a successful saved backup.
10. In production preview with DevTools Network open, export and restore after disconnecting external internet access. Only existing local app/OCR assets may load; no external requests should occur. Keep the local server reachable.
11. Exercise a representative large library below the documented limits, checking progress, responsiveness, disk space, and the ability to cancel at the preview. Validation/commit cannot be canceled midway through the panel; closing the tab interrupts work with the recovery guarantees above.

Automated Phase 3 tests use real ZIP bytes and fake-indexeddb for round trips, exact image bytes/MIME, migration, conflicts, malformed/unsupported archives, CRC/SHA failures, quota/rollback, staging ownership, interrupted OCR tokens, local-only ZIP operations, UI outcomes and editor-draft preservation. Real browser file-picker, multi-process storage durability, disk usage, and memory limits remain manual checks.
A production-build smoke test in an isolated Chrome profile verified a synthetic note/image ZIP export, empty-library restore, repeat-merge skips, renewed OCR job IDs, completed OCR preservation, reload persistence, OCR-text search, and zero external runtime requests. It exercised the download fallback; the native Save File picker and larger libraries still need the checks above.
