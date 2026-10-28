# FoundIt backup format v1

A backup is an unencrypted ZIP with STORE (method 0, no compression) entries. FoundIt deliberately avoids recompressing images, decompression bombs, external codec assets, and passwords in this first version. Do not repackage the ZIP with compression. A checksum detects damage; it does not authenticate the archive or encrypt its contents.

## Entries

- `manifest.json`: UTF-8 JSON object with `format: "foundit"`, integer `version: 1`, Unix-millisecond `createdAt`, `itemCount`, and `files` array.
- `items.json`: UTF-8 JSON array of saved items. Each has `id`, `type`, `title`, `tags`, `textContent`, `url`, `createdAt`, `updatedAt`. Images also have `ocr`: `status`, `text`, `language: "eng"`, `jobId`, and optional `completedAt` and `error`.
- `images/<id>.<extension>`: exact original image bytes. PNG uses `.png`, JPEG `.jpg`, WebP `.webp`, GIF `.gif`.

Every payload file (items.json and images) has a manifest entry `{ path, size, sha256, mime }`. `size` is the uncompressed byte count; `sha256` is a lowercase, 64-character SHA-256 hex digest. `mime` is `application/json` for items and the original supported image MIME type. The manifest does not list itself. Manifest structure, ZIP integrity, and every payload checksum are validated. The archive version is independent of the IndexedDB schema version.

IDs are nonempty ASCII letters, digits, underscores or hyphens, up to 128 characters. Exported app IDs are UUIDs. Dates are nonnegative integer Unix milliseconds within JavaScript Date range, with updatedAt no earlier than createdAt. Metadata must satisfy current item validation without normalization or silent truncation. Titles/tags/URLs must already be in their supported canonical form. Non-image items cannot contain OCR fields. Unknown item fields are not imported.

## Bounds and validation

- Up to 5,000 items and 5,002 entries (including manifest and metadata).
- Input ZIP: at most 512 MiB. Export reserves up to 3 MiB for manifest and ZIP overhead; the payload budget is correspondingly smaller.
- Metadata: at most 16 MiB UTF-8, manifest at most 2 MiB.
- Every image: nonempty, at most 10 MiB, with PNG/JPEG/WebP/GIF MIME and matching extension.
- Total declared payload: at most 512 MiB; actual entry sizes are checked while streaming and must match the manifest. Image decode/recognition limits remain those of Phase 2. Restore preserves original bytes, including an image the existing preview cannot decode; it does not claim to repair or certify images.
- Duplicate ZIP paths or item IDs, traversal paths, directory entries, encrypted/compressed entries, missing/unreferenced images, extra entries, malformed JSON, bad sizes/checksums, unsafe URLs, and unsupported versions are rejected.

No image is converted to base64. Digests and validation use one bounded entry buffer at a time. No compression worker, WASM codec, URL fetch, or CDN is needed for STORE entries.

## Restore protocol and concurrency

Schema v3 adds `restoreItems` (key `id`, fields `item` and optional `blob`) and `restoreSessions` (key `id`, count, validated flag). The existing `items` and `images` schemas and data are retained. Close old-version tabs if they block the upgrade.

A restore acquires the exclusive Web Lock `foundit-restore:<database-name>` using `ifAvailable`. It holds this lock during validation, preview, final transaction, and cleanup. A second tab fails visibly instead of deleting active staging. Only the lock holder clears staging. If a tab is closed/crashes, the browser releases its lock; the next restore session clears abandoned staging. There is no timer-based eviction. Web Locks is required for restore.

Validation writes only staging records, sequentially, and marks the session validated only after all files pass. Cancel/failure removes staging. If cleanup fails, the next lock holder retries; the live library is still separate. Staging consumes temporary browser disk space and may hit quota.

The final transaction covers live metadata, live images, staging items, and the session marker. It reads staging one item at a time, checks current IDs, inserts new metadata and corresponding images with `add`, and removes staging. It does no ZIP reads, hashing, or other external async work. Any write or cleanup failure aborts this whole transaction, leaving the previous live library intact. A failed commit may be retried or canceled.

Modes:

- **Empty**: both live stores must be empty at commit; otherwise fail. Never automatically deletes current data.
- **Merge**: existing item IDs are skipped. Their metadata and images are never overwritten, regardless of timestamps or content differences. Preview and completion list skipped IDs. Different IDs stay separate, even with identical contents. Counts are recalculated at commit because other tabs may have changed data. An orphan image conflicting with a new ID aborts restore rather than overwriting it.

Imported IDs and saved timestamps are preserved. All imported OCR job IDs are renewed; `processing` becomes `pending`. Completed text and failed status/error are retained; pending jobs can resume after commit. Stale workers cannot apply results to fresh tokens. Existing items skipped during merge keep their current OCR jobs. Search is rebuilt/updated from committed IndexedDB items; no search index is archived. Unsaved editor drafts remain in their current component.

## Export protocol

One read transaction captures saved metadata and image Blob references consistently. Hashing and ZIP writing occur afterward so OCR/edit/delete operations cannot create a mixed snapshot. Blob references are retained without expanding all images into byte arrays. The snapshot may contain `processing` OCR; its result may finish after the snapshot and will not retroactively change the backup.

Where available, the Save File picker streams the ZIP to a local file. Errors abort the destination; only a completed close is reported as saved. Otherwise, a Blob download is offered with a 128 MiB cap (including the overhead reserve), and users must confirm the download actually saved. Browser Blob storage and memory behavior vary. This version does not promise unlimited library size. Exceeding limits fails without silently exporting a subset.
