import Dexie, { type Table } from "dexie";
import type { LibraryItem, ImageRecord } from "./types";
export class LibraryDB extends Dexie {
  items!: Table<LibraryItem, string>;
  images!: Table<ImageRecord, string>;
  constructor(name = "foundit-library") {
    super(name);
    this.version(1).stores({
      items: "id, type, updatedAt, *tags",
      images: "id",
    });
  }
}
export const db = new LibraryDB();
