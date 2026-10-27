import MiniSearch from "minisearch";
import type { LibraryItem, ItemType } from "./types";
export interface SearchQuery {
  text: string;
  type: ItemType | "all";
  tag: string;
}
export interface SearchHit {
  id: string;
  snippet: string;
}
const documentFor = (item: LibraryItem) => ({
  id: item.id,
  title: item.title,
  textContent: item.textContent,
  url: item.url,
  tags: item.tags.join(" "),
  ocrText: item.ocr?.text ?? "",
});
export function snippetFor(item: LibraryItem, query: string) {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const fields = [
    item.textContent,
    item.ocr?.text ?? "",
    item.url,
    item.tags.join(", "),
    item.title,
  ];
  for (const field of fields) {
    const lower = field.toLocaleLowerCase();
    const positions = terms.map((t) => lower.indexOf(t)).filter((n) => n >= 0);
    if (positions.length) {
      const start = Math.max(0, Math.min(...positions) - 45);
      const end = Math.min(field.length, start + 180);
      return `${start ? "…" : ""}${field.slice(start, end)}${end < field.length ? "…" : ""}`;
    }
  }
  return (item.textContent || item.ocr?.text || item.url || item.title).slice(
    0,
    180,
  );
}
export class LibrarySearch {
  private index = new MiniSearch({
    fields: ["title", "textContent", "url", "tags", "ocrText"],
    searchOptions: {
      boost: { title: 3, tags: 2 },
      prefix: true,
      combineWith: "AND",
    },
  });
  private items = new Map<string, LibraryItem>();
  sync(items: LibraryItem[]) {
    const ids = new Set(items.map((i) => i.id));
    for (const id of this.items.keys())
      if (!ids.has(id)) {
        this.index.discard(id);
        this.items.delete(id);
      }
    for (const item of items) {
      const previous = this.items.get(item.id);
      if (!previous) this.index.add(documentFor(item));
      else if (
        JSON.stringify(documentFor(previous)) !==
        JSON.stringify(documentFor(item))
      )
        this.index.replace(documentFor(item));
      this.items.set(item.id, item);
    }
  }
  search(query: SearchQuery): SearchHit[] {
    const matching = (item: LibraryItem) =>
      (query.type === "all" || item.type === query.type) &&
      (!query.tag || item.tags.includes(query.tag));
    const items = query.text.trim()
      ? this.index
          .search(query.text.trim())
          .map((hit) => this.items.get(String(hit.id))!)
          .filter(Boolean)
      : [...this.items.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    return items
      .filter(matching)
      .map((item) => ({
        id: item.id,
        snippet: query.text.trim() ? snippetFor(item, query.text.trim()) : "",
      }));
  }
}
