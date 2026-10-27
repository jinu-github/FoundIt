import { db, type LibraryDB } from "./db";
import type { ItemInput, LibraryItem } from "./types";
import { pendingOcr } from "./types";
import { normalizeInput, validateImage } from "./validation";
export async function saveItem(
  input: ItemInput,
  image?: Blob,
  id?: string,
  database: LibraryDB = db,
) {
  const clean = normalizeInput(input);
  if (image) validateImage(image);
  return database.transaction(
    "rw",
    database.items,
    database.images,
    async () => {
      const previous = id ? await database.items.get(id) : undefined;
      if (id && !previous)
        throw new Error("This item no longer exists. Reload the library.");
      if (previous && previous.type !== clean.type)
        throw new Error("An existing item cannot change type.");
      const key = id ?? crypto.randomUUID();
      if (clean.type === "image" && !image && !(await database.images.get(key)))
        throw new Error("Choose an image to import.");
      if (clean.type !== "image" && image)
        throw new Error("Only image items can contain an image file.");
      const now = Date.now();
      const item: LibraryItem = {
        ...clean,
        id: key,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        ...(clean.type === "image"
          ? { ocr: image ? pendingOcr() : (previous?.ocr ?? pendingOcr()) }
          : {}),
      };
      await database.items.put(item);
      if (image) await database.images.put({ id: key, blob: image });
      return item;
    },
  );
}
export async function deleteItem(id: string, database: LibraryDB = db) {
  await database.transaction(
    "rw",
    database.items,
    database.images,
    async () => {
      await database.items.delete(id);
      await database.images.delete(id);
    },
  );
}
export async function listItems(database: LibraryDB = db) {
  return database.items.orderBy("updatedAt").reverse().toArray();
}
