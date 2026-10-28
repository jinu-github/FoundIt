// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Dexie from "dexie";
import {
  BlobReader,
  BlobWriter,
  ZipReader,
  ZipWriter,
  type FileEntry,
} from "@zip.js/zip.js";
import { LibraryDB } from "./db";
import { saveItem, deleteItem } from "./items";
import { claimOcr, finishOcr } from "./ocr-store";
import { exportBackup, openRestore, type RestoreSession } from "./backup";
import { checksum, type Manifest } from "./backup-format";
import { LibrarySearch } from "./search";
let source: LibraryDB;
let target: LibraryDB;
const sessions: RestoreSession[] = [];
const held = new Set<string>();
const locks = {
  request: async (
    name: string,
    _options: unknown,
    callback: (lock: unknown) => Promise<void>,
  ) => {
    if (held.has(name)) return callback(null);
    held.add(name);
    try {
      await callback({ name });
    } finally {
      held.delete(name);
    }
  },
} as unknown as LockManager;
const options = { useWebWorkers: false, useCompressionStream: false, level: 0 };
beforeEach(() => {
  source = new LibraryDB(`source-${crypto.randomUUID()}`);
  target = new LibraryDB(`target-${crypto.randomUUID()}`);
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const session of sessions.splice(0)) await session.close();
  await source.delete();
  await target.delete();
});
const note = (db = source, title = "A note") =>
  saveItem(
    {
      type: "note",
      title,
      textContent: "amethyst journal",
      tags: ["travel"],
      url: "",
    },
    undefined,
    undefined,
    db,
  );
const image = (db = source) =>
  saveItem(
    {
      type: "image",
      title: "Original image",
      textContent: "Image notes",
      tags: ["photos"],
      url: "",
    },
    new Blob([new Uint8Array([137, 80, 78, 71, 0, 255, 16])], {
      type: "image/png",
    }),
    undefined,
    db,
  );
async function session(db = target) {
  const s = await openRestore(db, locks);
  sessions.push(s);
  return s;
}
async function archive() {
  return (await exportBackup(source))!;
}
async function files(blob: Blob) {
  const reader = new ZipReader(new BlobReader(blob), options);
  const map = new Map<string, Blob>();
  for (const e of await reader.getEntries())
    map.set(
      e.filename,
      await (e as FileEntry).getData(new BlobWriter(), options),
    );
  await reader.close();
  return map;
}
async function zip(map: Map<string, Blob>) {
  const writer = new ZipWriter(new BlobWriter(), options);
  for (const [name, blob] of map) await writer.add(name, new BlobReader(blob));
  return writer.close();
}
async function mutate(
  change: (map: Map<string, Blob>, manifest: Manifest) => void | Promise<void>,
) {
  const map = await files(await archive());
  const manifest = JSON.parse(
    await map.get("manifest.json")!.text(),
  ) as Manifest;
  await change(map, manifest);
  map.set("manifest.json", new Blob([JSON.stringify(manifest)]));
  return zip(map);
}
it("round trips all item types, original image bytes, saved fields and timestamps across reopen", async () => {
  const img = await image();
  const job = (await claimOcr(source))!;
  await finishOcr(img.id, job.jobId, { text: "quartz lighthouse" }, source);
  await note();
  await saveItem(
    {
      type: "link",
      title: "Docs",
      textContent: "Useful",
      tags: [],
      url: "https://example.com/",
    },
    undefined,
    undefined,
    source,
  );
  await saveItem(
    {
      type: "text",
      title: "Excerpt",
      textContent: "Copied text",
      tags: [],
      url: "",
    },
    undefined,
    undefined,
    source,
  );
  const original = await source.items.toArray();
  const s = await session();
  expect(await s.validate(await archive())).toMatchObject({
    total: 4,
    added: 4,
    skipped: [],
  });
  expect(await target.items.count()).toBe(0);
  await s.commit("empty");
  target.close();
  await target.open();
  const restored = await target.items.toArray();
  for (const old of original) {
    const current = restored.find((i) => i.id === old.id)!;
    expect({ ...current, ocr: undefined }).toEqual({ ...old, ocr: undefined });
    if (old.ocr) {
      expect(current.ocr).toEqual({ ...old.ocr, jobId: expect.any(String) });
      expect(current.ocr!.jobId).not.toBe(old.ocr.jobId);
    }
  }
  expect(await (await target.images.get(img.id))!.blob.arrayBuffer()).toEqual(
    await (await source.images.get(img.id))!.blob.arrayBuffer(),
  );
  expect((await target.images.get(img.id))!.blob.type).toBe("image/png");
  const index = new LibrarySearch();
  index.sync(restored);
  expect(
    index.search({ text: "lighthouse", type: "all", tag: "" }),
  ).toHaveLength(1);
});
it("streams an export to a writable file sink without a download Blob", async () => {
  await image();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let closed = false;
  const output = new WritableStream<Uint8Array>({
    write(c) {
      chunks.push(new Uint8Array(c));
    },
    close() {
      closed = true;
    },
  });
  expect(await exportBackup(source, output)).toBeUndefined();
  expect(closed).toBe(true);
  const s = await session();
  await s.validate(new Blob(chunks));
  await s.commit("empty");
  expect(await target.images.count()).toBe(1);
});
it("merges without overwriting and repeated imports skip existing IDs", async () => {
  const first = await note();
  const backup = await archive();
  const s = await session();
  await s.validate(backup);
  await s.commit("merge");
  await target.items.update(first.id, { title: "Keep my newer title" });
  expect(await s.validate(backup)).toEqual({
    total: 1,
    added: 0,
    skipped: [first.id],
  });
  expect(await s.commit("merge")).toEqual({
    total: 1,
    added: 0,
    skipped: [first.id],
  });
  expect((await target.items.get(first.id))!.title).toBe("Keep my newer title");
});
it("rechecks conflicts and empty mode inside the final transaction", async () => {
  const first = await note();
  const s = await session();
  await s.validate(await archive());
  await target.items.add({ ...first, title: "Another tab" });
  await expect(s.commit("empty")).rejects.toThrow("no longer empty");
  expect(await s.commit("merge")).toMatchObject({
    added: 0,
    skipped: [first.id],
  });
});
it("keeps different IDs with identical content as separate items", async () => {
  await note();
  await note(target);
  const s = await session();
  await s.validate(await archive());
  await s.commit("merge");
  expect(await target.items.count()).toBe(2);
});
it("preserves failed OCR and renews processing jobs, rejecting old completions even after delete and restore", async () => {
  const img = await image();
  const old = (await claimOcr(source))!;
  const failed = await image();
  await source.items.update(failed.id, {
    ocr: { ...failed.ocr!, status: "failed", error: "Safe failure" },
  });
  const backup = await archive();
  await deleteItem(img.id, source);
  await deleteItem(failed.id, source);
  const s = await session(source);
  await s.validate(backup);
  await s.commit("empty");
  expect((await source.items.get(failed.id))!.ocr).toMatchObject({
    status: "failed",
    error: "Safe failure",
  });
  expect((await source.items.get(img.id))!.ocr!.status).toBe("pending");
  const fresh = (await claimOcr(source))!;
  expect(fresh.jobId).not.toBe(old.jobId);
  await finishOcr(img.id, old.jobId, { text: "stale" }, source);
  expect((await source.items.get(img.id))!.ocr!.text).toBe("");
});
it.each([
  "not-zip",
  "truncated",
  "version",
  "checksum",
  "missing-image",
  "unsafe-path",
  "unexpected-file",
  "bad-json",
  "duplicate-id",
  "unsafe-url",
  "image-mime",
  "size",
  "unreferenced-image",
])("rejects %s archives before changing live data", async (kind) => {
  await image();
  const existing = await note(target);
  let bad: Blob;
  if (kind === "not-zip") bad = new Blob(["not a zip"]);
  else if (kind === "truncated") bad = (await archive()).slice(0, 60);
  else
    bad = await mutate(async (map, m) => {
      const imageFile = m.files.find((f) => f.path.startsWith("images/"))!;
      if (kind === "version")
        (m as unknown as { version: number }).version = 99;
      if (kind === "checksum") imageFile.sha256 = "0".repeat(64);
      if (kind === "missing-image") map.delete(imageFile.path);
      if (kind === "unsafe-path") map.set("../private.txt", new Blob(["bad"]));
      if (kind === "unexpected-file") map.set("extra.txt", new Blob(["bad"]));
      if (kind === "image-mime") imageFile.mime = "image/jpeg";
      if (kind === "size") imageFile.size = 11 * 1024 * 1024;
      if (
        [
          "bad-json",
          "duplicate-id",
          "unsafe-url",
          "unreferenced-image",
        ].includes(kind)
      ) {
        const items = JSON.parse(await map.get("items.json")!.text());
        if (kind === "duplicate-id") items.push(items[0]);
        if (kind === "unsafe-url") {
          items[0].type = "link";
          items[0].url = "javascript:alert(1)";
          delete items[0].ocr;
        }
        if (kind === "unreferenced-image") {
          items[0].type = "note";
          delete items[0].ocr;
        }
        const blob = new Blob([
          kind === "bad-json" ? "{oops" : JSON.stringify(items),
        ]);
        map.set("items.json", blob);
        Object.assign(
          m.files.find((f) => f.path === "items.json")!,
          { size: blob.size, sha256: await checksum(blob) },
        );
        m.itemCount = items.length;
      }
    });
  const s = await session();
  await expect(s.validate(bad)).rejects.toThrow();
  await expect(s.commit("merge")).rejects.toThrow("Validate");
  expect(await target.items.toArray()).toEqual([existing]);
  expect(await target.images.count()).toBe(0);
  expect(await target.restoreItems.count()).toBe(0);
});
it("rolls back all live writes when an image write hits quota after earlier inserts", async () => {
  await note();
  await image();
  const existing = await note(target);
  const s = await session();
  await s.validate(await archive());
  const fail = () => {
    throw new DOMException("Simulated full disk", "QuotaExceededError");
  };
  target.images.hook("creating", fail);
  await expect(s.commit("merge")).rejects.toThrow("Simulated full disk");
  expect(await target.items.toArray()).toEqual([existing]);
  expect(await target.images.count()).toBe(0);
  expect(await target.restoreItems.count()).toBe(2);
  target.images.hook("creating").unsubscribe(fail);
  expect((await s.commit("merge")).added).toBe(2);
});
it("staging quota errors leave existing data unchanged and cannot commit", async () => {
  await image();
  const existing = await note(target);
  const s = await session();
  const fail = () => {
    throw new DOMException("Staging full", "QuotaExceededError");
  };
  target.restoreItems.hook("creating", fail);
  await expect(s.validate(await archive())).rejects.toThrow("Staging full");
  await expect(s.commit("merge")).rejects.toThrow("Validate");
  expect(await target.items.toArray()).toEqual([existing]);
  target.restoreItems.hook("creating").unsubscribe(fail);
});
it("does not let another tab open or clean an active restore, and cleans abandoned staging only under the lock", async () => {
  await note();
  const s = await session();
  await s.validate(await archive());
  const otherTab = new LibraryDB(target.name);
  await expect(openRestore(otherTab, locks)).rejects.toThrow("Another tab");
  expect(await target.restoreItems.count()).toBe(1);
  await s.close();
  await target.restoreItems.add({
    id: "abandoned",
    item: (await source.items.toArray())[0],
  });
  await session();
  expect(await target.restoreItems.count()).toBe(0);
  otherTab.close();
});
it("cancellation discards staging without changing the live library", async () => {
  await image();
  const s = await session();
  await s.validate(await archive());
  await s.close();
  expect(await target.restoreItems.count()).toBe(0);
  expect(await target.items.count()).toBe(0);
  await expect(s.commit("merge")).rejects.toThrow("closed");
});
it("upgrades a v2 database without altering saved records or original blobs", async () => {
  const legacy = new Dexie(target.name);
  legacy
    .version(2)
    .stores({ items: "id, type, updatedAt, *tags, ocr.status", images: "id" });
  const img = await image();
  const blob = (await source.images.get(img.id))!.blob;
  await legacy.table("items").add(img);
  await legacy.table("images").add({ id: img.id, blob });
  legacy.close();
  await target.open();
  expect(target.verno).toBe(3);
  expect(await target.items.get(img.id)).toEqual(img);
  expect(await (await target.images.get(img.id))!.blob.arrayBuffer()).toEqual(
    await blob.arrayBuffer(),
  );
  expect(await target.restoreItems.count()).toBe(0);
});
it("exports no snapshot if original image records are inconsistent", async () => {
  const img = await image();
  await source.images.delete(img.id);
  await expect(archive()).rejects.toThrow("inconsistent");
});
it("does not request any runtime network resources for export or restore", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Network forbidden"));
  await image();
  const s = await session();
  await s.validate(await archive());
  await s.commit("merge");
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects duplicate ZIP paths even when the central directory is readable", async () => {
  await note();
  const map = await files(await archive());
  map.set("xxxxx.json", new Blob(["[]"]));
  const bytes = new Uint8Array(await (await zip(map)).arrayBuffer());
  const needle = new TextEncoder().encode("xxxxx.json");
  const replacement = new TextEncoder().encode("items.json");
  for (let i = 0; i <= bytes.length - needle.length; i++)
    if (needle.every((b, j) => bytes[i + j] === b)) bytes.set(replacement, i);
  const s = await session();
  await expect(s.validate(new Blob([bytes]))).rejects.toThrow(
    "Duplicate ZIP path",
  );
  expect(await target.items.count()).toBe(0);
});
it("rejects damaged stored bytes using ZIP integrity checks", async () => {
  await image();
  const bytes = new Uint8Array(await (await archive()).arrayBuffer());
  const index = bytes.findIndex(
    (b, i) => b === 137 && bytes[i + 1] === 80 && bytes[i + 2] === 78,
  );
  expect(index).toBeGreaterThan(0);
  bytes[index] = 138;
  const s = await session();
  await expect(s.validate(new Blob([bytes]))).rejects.toThrow();
  expect(await target.items.count()).toBe(0);
  expect(await target.restoreItems.count()).toBe(0);
});
it("refuses unsupported compressed archives", async () => {
  const writer = new ZipWriter(new BlobWriter(), {
    ...options,
    level: 6,
    useCompressionStream: true,
  });
  await writer.add(
    "manifest.json",
    new BlobReader(new Blob(["compressed manifest"])),
  );
  const s = await session();
  await expect(s.validate(await writer.close())).rejects.toThrow(
    "uncompressed",
  );
});
it("aborts streamed output on storage write errors rather than reporting success", async () => {
  await note();
  const output = new WritableStream<Uint8Array>({
    write() {
      throw new DOMException("Disk full", "QuotaExceededError");
    },
  });
  await expect(exportBackup(source, output)).rejects.toThrow("Disk full");
  expect(await source.items.count()).toBe(1);
});
it("rejects files beyond the archive size limit before reading bytes", async () => {
  const oversized = new Blob(["x"]);
  Object.defineProperty(oversized, "size", { value: 513 * 1024 * 1024 });
  const s = await session();
  await expect(s.validate(oversized)).rejects.toThrow("512 MiB");
});

it.each([
  { label: "pending array", status: ["pending"] },
  { label: "processing array", status: ["processing"] },
  { label: "completed array", status: ["completed"] },
  { label: "failed array", status: ["failed"] },
  { label: "object", status: { value: "pending" } },
  { label: "number", status: 0 },
  { label: "null", status: null },
  { label: "boolean", status: true },
  { label: "missing", status: undefined },
  { label: "unsupported string", status: "queued" },
  { label: "empty string", status: "" },
  { label: "padded string", status: " pending " },
])(
  "rejects OCR status $label before restoring any records",
  async ({ status }) => {
    await image();
    await image(target);
    const beforeItems = await target.items.toArray();
    const beforeImages = await target.images.toArray();
    const bad = await mutate(async (map, manifest) => {
      const items = JSON.parse(await map.get("items.json")!.text());
      items[0].ocr.status = status;
      const metadata = new Blob([JSON.stringify(items)]);
      map.set("items.json", metadata);
      // Keep ZIP integrity and payload checksums valid to exercise status validation.
      Object.assign(
        manifest.files.find((f) => f.path === "items.json")!,
        {
          size: metadata.size,
          sha256: await checksum(metadata),
        },
      );
    });
    const s = await session();
    await s.validate(await archive());
    await expect(s.validate(bad)).rejects.toThrow("Invalid FoundIt archive");
    await expect(s.commit("merge")).rejects.toThrow("Validate");
    expect(await target.items.toArray()).toEqual(beforeItems);
    const afterImages = await target.images.toArray();
    expect(afterImages.map((i) => i.id)).toEqual(beforeImages.map((i) => i.id));
    for (let i = 0; i < beforeImages.length; i++) {
      expect(afterImages[i].blob.type).toBe(beforeImages[i].blob.type);
      expect(await afterImages[i].blob.arrayBuffer()).toEqual(
        await beforeImages[i].blob.arrayBuffer(),
      );
    }
    expect(await target.restoreItems.count()).toBe(0);
    expect(await target.restoreSessions.count()).toBe(0);
  },
);

it.each(["pending", "processing", "completed", "failed"] as const)(
  "exports and restores valid OCR status %s without losing saved OCR fields",
  async (status) => {
    const img = await image();
    const ocr = {
      ...img.ocr!,
      status,
      text: status === "completed" ? "Preserved OCR text" : "",
      ...(status === "completed" ? { completedAt: Date.now() } : {}),
      ...(status === "failed" ? { error: "Recognition failed" } : {}),
    };
    await source.items.update(img.id, { ocr });
    const backup = await archive();
    const exported = JSON.parse(
      await (await files(backup)).get("items.json")!.text(),
    );
    expect(exported[0].ocr).toEqual(ocr);
    const s = await session();
    await s.validate(backup);
    expect(await target.items.count()).toBe(0);
    await s.commit("empty");
    target.close();
    await target.open();
    const restored = (await target.items.get(img.id))!;
    expect(restored.ocr).toEqual({
      ...ocr,
      status: status === "processing" ? "pending" : status,
      jobId: expect.any(String),
    });
    expect(restored.ocr!.jobId).not.toBe(ocr.jobId);
    expect(await (await target.images.get(img.id))!.blob.arrayBuffer()).toEqual(
      await (await source.images.get(img.id))!.blob.arrayBuffer(),
    );
  },
);
