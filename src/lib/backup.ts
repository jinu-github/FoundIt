import {
  BlobReader,
  BlobWriter,
  ZipReader,
  ZipWriter,
  type FileEntry,
} from "@zip.js/zip.js";
import type { LibraryDB } from "./db";
import {
  check,
  checksum,
  imagePath,
  LIMITS,
  parseItems,
  parseManifest,
  parseJson,
  type Manifest,
} from "./backup-format";
import type { LibraryItem } from "./types";
import { validateImage } from "./validation";
type Progress = (message: string) => void;
const zipOptions = { useWebWorkers: false, useCompressionStream: false };
const lockName = (db: LibraryDB) => `foundit-restore:${db.name}`;
export async function exportBackup(
  db: LibraryDB,
  destination?: WritableStream<Uint8Array>,
  progress: Progress = () => {},
) {
  progress("Reading a consistent snapshot of saved items…");
  const snapshot = await db.transaction("r", db.items, db.images, async () => ({
    items: await db.items.toArray(),
    images: await db.images.toArray(),
  }));
  const items = parseItems(snapshot.items);
  const images = new Map(snapshot.images.map((i) => [i.id, i.blob]));
  check(
    images.size === items.filter((i) => i.type === "image").length,
    "Library image records are inconsistent; export stopped.",
  );
  const metadata = new Blob([JSON.stringify(items)], {
    type: "application/json",
  });
  check(
    metadata.size <= LIMITS.metadata,
    "Metadata exceeds the 16 MiB backup limit.",
  );
  const size =
    metadata.size + snapshot.images.reduce((n, i) => n + i.blob.size, 0);
  // Reserve room for the manifest and ZIP headers before starting a download.
  check(
    size + LIMITS.manifest + 1024 * 1024 <=
      (destination ? LIMITS.archive : LIMITS.download),
    destination
      ? "Backup exceeds the 512 MiB export limit."
      : "Download exceeds 128 MiB. Use a browser with Save File support for exports up to 512 MiB.",
  );
  const manifest: Manifest = {
    format: "foundit",
    version: 1,
    createdAt: Date.now(),
    itemCount: items.length,
    files: [],
  };
  const writer = new ZipWriter(
    destination ?? new BlobWriter("application/zip"),
    { ...zipOptions, level: 0, zip64: false },
  );
  async function add(path: string, blob: Blob) {
    manifest.files.push({
      path,
      size: blob.size,
      mime: blob.type,
      sha256: await checksum(blob),
    });
    await writer.add(path, new BlobReader(blob));
  }
  await add("items.json", metadata);
  let done = 0;
  for (const item of items) {
    if (item.type !== "image") continue;
    const blob = images.get(item.id);
    check(blob, "An original image is missing; export stopped.");
    validateImage(blob);
    progress(`Exporting image ${++done} of ${images.size}…`);
    await add(imagePath(item, blob.type), blob);
  }
  parseManifest(manifest);
  await writer.add(
    "manifest.json",
    new BlobReader(new Blob([JSON.stringify(manifest)])),
  );
  const result = await writer.close();
  return result instanceof Blob ? result : undefined;
}
async function clearStaging(db: LibraryDB) {
  await db.transaction("rw", db.restoreItems, db.restoreSessions, async () => {
    await db.restoreItems.clear();
    await db.restoreSessions.clear();
  });
}
export interface RestorePreview {
  total: number;
  added: number;
  skipped: string[];
}
export type RestoreMode = "empty" | "merge";
export interface RestoreSession {
  validate(file: Blob, progress?: Progress): Promise<RestorePreview>;
  commit(mode: RestoreMode): Promise<RestorePreview>;
  close(): Promise<void>;
}
// The lock is held through validation, user preview, commit, and staging cleanup.
// No time-based lease or startup deletion can steal another tab's active data.
export function openRestore(
  db: LibraryDB,
  locks: LockManager = navigator.locks,
): Promise<RestoreSession> {
  check(locks, "Restore requires Web Locks support (current Edge or Chrome).");
  return new Promise((resolve, reject) => {
    void locks
      .request(lockName(db), { ifAvailable: true }, async (lock) => {
        check(
          lock,
          "Another tab is restoring this library. Finish or cancel there first.",
        );
        await clearStaging(db);
        let release!: () => void;
        const held = new Promise<void>((r) => {
          release = r;
        });
        let closed = false;
        let working = false;
        let ready = false;
        async function exclusive<T>(fn: () => Promise<T>) {
          check(!closed && !working, "Restore session is closed or busy.");
          working = true;
          try {
            return await fn();
          } finally {
            working = false;
          }
        }
        resolve({
          validate: (file, progress = () => {}) =>
            exclusive(async () => {
              ready = false;
              await clearStaging(db);
              try {
                await validateArchive(db, file, progress);
                ready = true;
                return await preview(db);
              } catch (e) {
                await clearStaging(db);
                throw e;
              }
            }),
          commit: (mode) =>
            exclusive(async () => {
              check(ready, "Validate a complete archive before restoring.");
              check(mode === "empty" || mode === "merge");
              const result = await db.transaction(
                "rw",
                db.items,
                db.images,
                db.restoreItems,
                db.restoreSessions,
                async () => {
                  const session = await db.restoreSessions.get("active");
                  check(
                    session?.validated,
                    "Restore validation is incomplete.",
                  );
                  if (mode === "empty")
                    check(
                      (await db.items.count()) === 0 &&
                        (await db.images.count()) === 0,
                      "The library is no longer empty. Choose Merge instead.",
                    );
                  const ids = await db.restoreItems
                    .toCollection()
                    .primaryKeys();
                  check(ids.length === session.count, "Staging is incomplete.");
                  const result: RestorePreview = {
                    total: ids.length,
                    added: 0,
                    skipped: [],
                  };
                  for (const id of ids) {
                    if (await db.items.get(id)) {
                      result.skipped.push(id);
                      continue;
                    }
                    check(
                      !(await db.images.get(id)),
                      "An orphan image conflicts with this restore.",
                    );
                    const staged = (await db.restoreItems.get(id))!;
                    const item: LibraryItem = { ...staged.item };
                    if (item.ocr)
                      item.ocr = {
                        ...item.ocr,
                        jobId: crypto.randomUUID(),
                        status:
                          item.ocr.status === "processing"
                            ? "pending"
                            : item.ocr.status,
                      };
                    await db.items.add(item);
                    if (item.type === "image") {
                      check(staged.blob, "Staged image is missing.");
                      await db.images.add({ id, blob: staged.blob });
                    }
                    result.added++;
                  }
                  await db.restoreItems.clear();
                  await db.restoreSessions.clear();
                  return result;
                },
              );
              ready = false;
              return result;
            }),
          close: async () => {
            if (closed) return;
            check(
              !working,
              "Wait for the restore operation to finish before closing.",
            );
            closed = true;
            try {
              await clearStaging(db);
            } finally {
              release();
            }
          },
        });
        await held;
      })
      .catch(reject);
  });
}
async function preview(db: LibraryDB): Promise<RestorePreview> {
  return db.transaction("r", db.items, db.restoreItems, async () => {
    const ids = await db.restoreItems.toCollection().primaryKeys();
    const existing = new Set(await db.items.toCollection().primaryKeys());
    const skipped = ids.filter((id) => existing.has(id));
    return { total: ids.length, added: ids.length - skipped.length, skipped };
  });
}
async function readEntry(entry: FileEntry, limit: number, mime: string) {
  check(
    entry.uncompressedSize <= limit && entry.compressedSize <= limit,
    "Archive entry exceeds its size limit.",
  );
  let size = 0;
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const stream = new WritableStream<Uint8Array>({
    write(chunk) {
      size += chunk.byteLength;
      check(size <= limit, "Expanded archive entry exceeds its size limit.");
      parts.push(new Uint8Array(chunk));
    },
  });
  await entry.getData(stream, { ...zipOptions, checkSignature: true });
  check(size === entry.uncompressedSize, "Archive size mismatch.");
  return new Blob(parts, { type: mime });
}
async function validateArchive(db: LibraryDB, file: Blob, progress: Progress) {
  check(
    file.size > 0 && file.size <= LIMITS.archive,
    "Choose a FoundIt ZIP backup no larger than 512 MiB.",
  );
  const reader = new ZipReader(new BlobReader(file), zipOptions);
  try {
    const entries = new Map<string, FileEntry>();
    for await (const entry of reader.getEntriesGenerator()) {
      check(entries.size < LIMITS.items + 2, "Too many ZIP entries.");
      check(
        !entry.directory && !entry.encrypted && entry.compressionMethod === 0,
        "Only unencrypted, uncompressed FoundIt ZIP entries are supported.",
      );
      check(!entries.has(entry.filename), "Duplicate ZIP path.");
      check(
        entry.filename === "manifest.json" ||
          entry.filename === "items.json" ||
          /^images\/[a-zA-Z0-9_-]+\.(png|jpg|webp|gif)$/.test(entry.filename),
        "Unsafe or unexpected ZIP path.",
      );
      entries.set(entry.filename, entry as FileEntry);
    }
    const manifestEntry = entries.get("manifest.json");
    check(manifestEntry, "Backup manifest is missing.");
    const manifest = parseManifest(
      parseJson(
        await (
          await readEntry(manifestEntry, LIMITS.manifest, "application/json")
        ).text(),
      ),
    );
    check(
      entries.size === manifest.files.length + 1,
      "ZIP entries do not match the manifest.",
    );
    for (const f of manifest.files)
      check(entries.has(f.path), "A manifest entry is missing.");
    async function checkedFile(path: string) {
      const f = manifest.files.find((f) => f.path === path);
      check(f, "Missing file in manifest.");
      const blob = await readEntry(entries.get(path)!, f.size, f.mime);
      check(
        blob.size === f.size && (await checksum(blob)) === f.sha256,
        "Backup checksum mismatch. No library items were changed.",
      );
      return blob;
    }
    const items = parseItems(
      parseJson(await (await checkedFile("items.json")).text()),
    );
    check(items.length === manifest.itemCount, "Item count mismatch.");
    const used = new Set(["items.json"]);
    let done = 0;
    for (const item of items) {
      progress(`Validating item ${++done} of ${items.length}…`);
      let blob: Blob | undefined;
      if (item.type === "image") {
        const candidates = manifest.files.filter((f) =>
          f.path.startsWith(`images/${item.id}.`),
        );
        check(candidates.length === 1, "Missing or duplicate image.");
        const f = candidates[0];
        check(
          imagePath(item, f.mime) === f.path,
          "Image extension and MIME type differ.",
        );
        blob = await checkedFile(f.path);
        validateImage(blob);
        used.add(f.path);
      }
      await db.restoreItems.add({
        id: item.id,
        item,
        ...(blob ? { blob } : {}),
      });
    }
    check(
      used.size === manifest.files.length,
      "Archive contains unreferenced files.",
    );
    await db.restoreSessions.add({
      id: "active",
      count: items.length,
      validated: true,
    });
  } finally {
    await reader.close();
  }
}
