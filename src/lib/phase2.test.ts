// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Dexie from "dexie";
import { LibraryDB } from "./db";
import { saveItem, deleteItem, listItems } from "./items";
import { claimOcr, finishOcr, recoverOcr, retryOcr } from "./ocr-store";
import { OcrQueue } from "./ocr-queue";
import { LibrarySearch, snippetFor } from "./search";
import type { ItemInput, LibraryItem } from "./types";
let database: LibraryDB;
let queue: OcrQueue | undefined;
const input: ItemInput = {
  type: "image",
  title: "Snowy mountain",
  textContent: "Climbing journal",
  url: "",
  tags: ["travel"],
};
const image = () =>
  saveItem(
    input,
    new Blob(["fixture"], { type: "image/png" }),
    undefined,
    database,
  );
beforeEach(() => {
  database = new LibraryDB(`phase2-${crypto.randomUUID()}`);
});
afterEach(async () => {
  await queue?.stop();
  queue = undefined;
  await database.delete();
  vi.restoreAllMocks();
});
it("upgrades a real v1 database without changing existing metadata or blobs", async () => {
  const legacy = new Dexie(database.name);
  legacy.version(1).stores({ items: "id,type,updatedAt,*tags", images: "id" });
  const old: LibraryItem = {
    ...input,
    id: "original",
    createdAt: 12,
    updatedAt: 24,
  };
  await legacy.table("items").put(old);
  await legacy.table("items").put({ ...old, id: "note", type: "note" });
  await legacy
    .table("images")
    .put({ id: old.id, blob: new Blob(["original"], { type: "image/png" }) });
  legacy.close();
  await database.open();
  expect(await database.items.get(old.id)).toMatchObject({
    ...old,
    ocr: { status: "pending", text: "", language: "eng" },
  });
  expect((await database.items.get("note"))?.ocr).toBeUndefined();
  expect(await (await database.images.get(old.id))?.blob.text()).toBe(
    "original",
  );
});
it("persists completed OCR across reopen and metadata edits", async () => {
  const item = await image();
  const job = (await claimOcr(database))!;
  await finishOcr(
    item.id,
    job.jobId,
    { text: "Hidden silver compass" },
    database,
  );
  await saveItem({ ...input, title: "Edited" }, undefined, item.id, database);
  database.close();
  await database.open();
  expect((await database.items.get(item.id))?.ocr).toMatchObject({
    status: "completed",
    text: "Hidden silver compass",
  });
  expect(await claimOcr(database)).toBeUndefined();
});
it("recovers interrupted jobs with new tokens and ignores stale completion", async () => {
  const item = await image();
  const old = (await claimOcr(database))!;
  database.close();
  await database.open();
  await recoverOcr(database);
  const fresh = (await claimOcr(database))!;
  expect(fresh.jobId).not.toBe(old.jobId);
  await finishOcr(item.id, old.jobId, { text: "stale" }, database);
  expect((await database.items.get(item.id))?.ocr?.status).toBe("processing");
  await finishOcr(item.id, fresh.jobId, { text: "current" }, database);
  expect((await database.items.get(item.id))?.ocr?.text).toBe("current");
});
it("never recreates a deleted item from a late OCR result", async () => {
  const item = await image();
  const job = (await claimOcr(database))!;
  await deleteItem(item.id, database);
  await finishOcr(item.id, job.jobId, { text: "late" }, database);
  expect(await database.items.count()).toBe(0);
  expect(await database.images.count()).toBe(0);
});
it("preserves user edits made during recognition", async () => {
  const item = await image();
  const job = (await claimOcr(database))!;
  await saveItem(
    { ...input, title: "New title", textContent: "New notes", tags: ["fresh"] },
    undefined,
    item.id,
    database,
  );
  await finishOcr(item.id, job.jobId, { text: "recognized" }, database);
  expect(await database.items.get(item.id)).toMatchObject({
    title: "New title",
    textContent: "New notes",
    tags: ["fresh"],
    ocr: { text: "recognized" },
  });
});
it("processes mocked OCR sequentially and does not reprocess completed items", async () => {
  await image();
  await image();
  let concurrent = 0;
  let peak = 0;
  const recognize = vi.fn(async () => {
    peak = Math.max(peak, ++concurrent);
    await new Promise((resolve) => setTimeout(resolve, 5));
    concurrent--;
    return "Recognized";
  });
  queue = new OcrQueue(
    database,
    () => ({ recognize, terminate: vi.fn(async () => {}) }),
    () => {},
  );
  await queue.start();
  expect(recognize).toHaveBeenCalledTimes(2);
  expect(peak).toBe(1);
  await queue.stop();
  queue = new OcrQueue(
    database,
    () => ({ recognize, terminate: vi.fn(async () => {}) }),
    () => {},
  );
  await queue.start();
  expect(recognize).toHaveBeenCalledTimes(2);
});
it("persists failure, supports retry, and handles empty OCR as completed", async () => {
  const item = await image();
  const recognize = vi
    .fn()
    .mockRejectedValueOnce(new Error("private data must not leak"))
    .mockResolvedValue("");
  queue = new OcrQueue(
    database,
    () => ({ recognize, terminate: vi.fn(async () => {}) }),
    () => {},
  );
  await queue.start();
  expect((await database.items.get(item.id))?.ocr).toMatchObject({
    status: "failed",
  });
  expect((await database.items.get(item.id))?.ocr?.error).not.toContain(
    "private",
  );
  await retryOcr(item.id, database);
  await vi.waitFor(async () =>
    expect((await database.items.get(item.id))?.ocr).toMatchObject({
      status: "completed",
      text: "",
    }),
  );
});
it("times out stalled OCR without blocking later jobs", async () => {
  await image();
  await image();
  const recognize = vi
    .fn()
    .mockImplementationOnce(() => new Promise(() => {}))
    .mockResolvedValue("next");
  queue = new OcrQueue(
    database,
    () => ({ recognize, terminate: vi.fn(async () => {}) }),
    () => {},
    15,
  );
  await queue.start();
  expect((await listItems(database)).map(item=>item.ocr?.status).sort()).toEqual(['completed','failed']);
  expect(recognize).toHaveBeenCalledTimes(2);
});
it("searches each field and rebuilds from persisted OCR", async () => {
  const item = await image();
  const job = (await claimOcr(database))!;
  await finishOcr(item.id, job.jobId, { text: "Silver compass" }, database);
  await saveItem(
    {
      type: "link",
      title: "Website",
      url: "https://example.com/blueprint",
      textContent: "Documentation",
      tags: [],
    },
    undefined,
    undefined,
    database,
  );
  await saveItem(
    {
      type: "text",
      title: "Excerpt",
      url: "",
      textContent: "Copied amethyst",
      tags: [],
    },
    undefined,
    undefined,
    database,
  );
  await saveItem(
    {
      type: "note",
      title: "Thought",
      url: "",
      textContent: "Written emerald",
      tags: [],
    },
    undefined,
    undefined,
    database,
  );
  database.close();
  await database.open();
  const index = new LibrarySearch();
  index.sync(await listItems(database));
  for (const text of [
    "snowy",
    "journal",
    "travel",
    "compass",
    "blueprint",
    "amethyst",
    "emerald",
  ])
    expect(index.search({ text, type: "all", tag: "" })).toHaveLength(1);
  expect(
    index.search({ text: "SNOW", type: "image", tag: "travel" })[0].id,
  ).toBe(item.id);
  expect(index.search({ text: "compass", type: "note", tag: "" })).toEqual([]);
});
it("updates indexes after editing/deletion and safely returns snippets", async () => {
  const item = await image();
  const index = new LibrarySearch();
  index.sync(await listItems(database));
  await saveItem(
    { ...input, title: "Rainforest" },
    undefined,
    item.id,
    database,
  );
  index.sync(await listItems(database));
  expect(index.search({ text: "snowy", type: "all", tag: "" })).toEqual([]);
  expect(index.search({ text: "rain", type: "all", tag: "" })).toHaveLength(1);
  await deleteItem(item.id, database);
  index.sync(await listItems(database));
  expect(index.search({ text: "rain", type: "all", tag: "" })).toEqual([]);
  const snippet = snippetFor(
    {
      ...item,
      textContent:
        "x".repeat(200) + " <script>quartz</script> " + "z".repeat(200),
    },
    "quartz",
  );
  expect(snippet).toContain("quartz");
  expect(snippet.length).toBeLessThanOrEqual(182);
});
