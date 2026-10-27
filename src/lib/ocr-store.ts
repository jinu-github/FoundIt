import type { LibraryDB } from "./db";
import { pendingOcr, type OcrData } from "./types";
// Call recovery only while holding the cross-tab OCR lock.
export async function recoverOcr(database: LibraryDB) {
  await database.items
    .where("ocr.status")
    .equals("processing")
    .modify((item) => {
      item.ocr = pendingOcr();
    });
}
export async function retryOcr(id: string, database: LibraryDB) {
  await database.transaction("rw", database.items, async () => {
    const item = await database.items.get(id);
    if (item?.type === "image" && item.ocr?.status === "failed")
      await database.items.update(id, { ocr: pendingOcr() });
  });
}
export async function claimOcr(database: LibraryDB) {
  return database.transaction(
    "rw",
    database.items,
    database.images,
    async () => {
      const item = await database.items
        .where("ocr.status")
        .equals("pending")
        .first();
      if (!item?.ocr) return;
      const ocr: OcrData = { ...item.ocr, status: "processing" };
      await database.items.update(item.id, { ocr });
      const image = await database.images.get(item.id);
      return { id: item.id, jobId: ocr.jobId, blob: image?.blob };
    },
  );
}
export async function finishOcr(
  id: string,
  jobId: string,
  result: { text: string } | { error: string },
  database: LibraryDB,
) {
  await database.transaction(
    "rw",
    database.items,
    database.images,
    async () => {
      const item = await database.items.get(id);
      if (
        !item ||
        item.type !== "image" ||
        item.ocr?.jobId !== jobId ||
        item.ocr.status !== "processing"
      )
        return;
      const ocr: OcrData =
        "text" in result
          ? {
              ...item.ocr,
              status: "completed",
              text: result.text,
              completedAt: Date.now(),
              error: undefined,
            }
          : { ...item.ocr, status: "failed", error: result.error };
      // Partial update preserves user edits; never put() a stale whole record.
      await database.items.update(id, { ocr });
    },
  );
}
