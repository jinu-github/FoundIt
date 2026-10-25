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
}
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
