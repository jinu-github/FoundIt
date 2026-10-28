// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryDB } from "./db";
import { deleteItem, listItems, saveItem } from "./items";
import type { ItemInput, ItemType } from "./types";
let database: LibraryDB;
const input = (type: ItemType): ItemInput => ({
  type,
  title: "A useful find",
  tags: [" Work ", "work", "Ideas"],
  textContent: "Some useful content",
  url: type === "link" ? "https://example.com" : "",
});
beforeEach(() => {
  database = new LibraryDB(`test-${crypto.randomUUID()}`);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await database.delete();
});
describe("library operations", () => {
  it.each(["image", "link", "text", "note"] as const)(
    "creates and persists a %s after reopening storage",
    async (type) => {
      const image =
        type === "image"
          ? new Blob(["image bytes"], { type: "image/png" })
          : undefined;
      const item = await saveItem(input(type), image, undefined, database);
      database.close();
      await database.open();
      expect(database.verno).toBe(3);
      expect(await listItems(database)).toEqual([item]);
      expect(item.tags).toEqual(["work", "ideas"]);
      expect(item.id).toBeTruthy();
      if (image) {
        const stored = await database.images.get(item.id);
        expect(stored?.blob.size).toBe(image.size);
        expect(stored?.blob.type).toBe(image.type);
        expect(item).not.toHaveProperty("blob");
      }
    },
  );
  it("edits metadata, preserves ID/creation time and retains a single image blob", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const item = await saveItem(
      input("image"),
      new Blob(["abc"], { type: "image/png" }),
      undefined,
      database,
    );
    vi.mocked(Date.now).mockReturnValue(2000);
    const updated = await saveItem(
      {
        ...input("image"),
        title: "Changed",
        tags: ["new"],
        textContent: "Updated notes",
      },
      undefined,
      item.id,
      database,
    );
    expect(updated).toMatchObject({
      id: item.id,
      createdAt: 1000,
      updatedAt: 2000,
      title: "Changed",
      tags: ["new"],
      textContent: "Updated notes",
    });
    expect(await database.images.count()).toBe(1);
  });
  it("deletes metadata and image together", async () => {
    const item = await saveItem(
      input("image"),
      new Blob(["abc"], { type: "image/png" }),
      undefined,
      database,
    );
    await deleteItem(item.id, database);
    expect(await database.items.count()).toBe(0);
    expect(await database.images.count()).toBe(0);
  });
  it("rolls back metadata if the image write fails", async () => {
    database.images.hook("creating", () => {
      throw new Error("Simulated image write failure");
    });
    await expect(
      saveItem(
        input("image"),
        new Blob(["abc"], { type: "image/png" }),
        undefined,
        database,
      ),
    ).rejects.toThrow("Simulated");
    expect(await database.items.count()).toBe(0);
    expect(await database.images.count()).toBe(0);
  });
  it("rolls back metadata deletion if image deletion fails", async () => {
    const item = await saveItem(
      input("image"),
      new Blob(["abc"], { type: "image/png" }),
      undefined,
      database,
    );
    database.images.hook("deleting", () => {
      throw new Error("Simulated delete failure");
    });
    await expect(deleteItem(item.id, database)).rejects.toThrow("Simulated");
    expect(await database.items.get(item.id)).toEqual(item);
    expect(await database.images.count()).toBe(1);
  });
  it("rejects missing image files and stale edits without changing data", async () => {
    await expect(
      saveItem(input("image"), undefined, undefined, database),
    ).rejects.toThrow("Choose an image");
    await expect(
      saveItem(input("note"), undefined, "missing", database),
    ).rejects.toThrow("no longer exists");
    expect(await database.items.count()).toBe(0);
  });
  it("prevents type changes that could orphan images", async () => {
    const item = await saveItem(
      input("image"),
      new Blob(["abc"], { type: "image/png" }),
      undefined,
      database,
    );
    await expect(
      saveItem(input("note"), undefined, item.id, database),
    ).rejects.toThrow("cannot change type");
    expect((await database.items.get(item.id))?.type).toBe("image");
    expect(await database.images.count()).toBe(1);
  });
});
