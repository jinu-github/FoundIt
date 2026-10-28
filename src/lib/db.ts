import Dexie, { type Table } from "dexie";
import type { LibraryItem, ImageRecord } from "./types";
import { pendingOcr } from "./types";
export class LibraryDB extends Dexie {
  items!: Table<LibraryItem, string>;
  images!: Table<ImageRecord, string>;
  restoreItems!: Table<{ id: string; item: LibraryItem; blob?: Blob }, string>;
  restoreSessions!: Table<
    { id: string; count: number; validated: boolean },
    string
  >;
  constructor(name = "foundit-library") {
    super(name);
    this.version(1).stores({
      items: "id, type, updatedAt, *tags",
      images: "id",
    });
    this.version(2)
      .stores({ items: "id, type, updatedAt, *tags, ocr.status", images: "id" })
      .upgrade((tx) =>
        tx
          .table<LibraryItem>("items")
          .toCollection()
          .modify((item) => {
            if (item.type === "image") item.ocr = pendingOcr();
          }),
      );
    this.version(3).stores({
      items: "id, type, updatedAt, *tags, ocr.status",
      images: "id",
      restoreItems: "id",
      restoreSessions: "id",
    });
  }
}
export const db = new LibraryDB();
