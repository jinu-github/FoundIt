export const itemTypes = ["image", "link", "text", "note"] as const;
export type ItemType = (typeof itemTypes)[number];
export interface LibraryItem {
  id: string;
  type: ItemType;
  title: string;
  tags: string[];
  textContent: string;
  url: string;
  createdAt: number;
  updatedAt: number;
  ocr?: OcrData;
}
export interface OcrData {
  status: "pending" | "processing" | "completed" | "failed";
  text: string;
  language: "eng";
  jobId: string;
  completedAt?: number;
  error?: string;
}
export const pendingOcr = (): OcrData => ({
  status: "pending",
  text: "",
  language: "eng",
  jobId: crypto.randomUUID(),
});
export interface ItemInput {
  type: ItemType;
  title: string;
  tags: string[];
  textContent: string;
  url: string;
}
export interface ImageRecord {
  id: string;
  blob: Blob;
}
export const symbols = { image: "▧", link: "↗", text: "≡", note: "✎" };
