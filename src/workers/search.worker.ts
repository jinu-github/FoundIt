import { LibrarySearch, type SearchQuery } from "../lib/search";
import type { LibraryItem } from "../lib/types";
const index = new LibrarySearch();
self.onmessage = (
  event: MessageEvent<{
    version: number;
    query: SearchQuery;
    items?: LibraryItem[];
  }>,
) => {
  const { version, items, query } = event.data;
  try {
    if (items) index.sync(items);
    self.postMessage({ version, hits: index.search(query) });
  } catch {
    self.postMessage({
      version,
      error: "Local search failed. Reload to rebuild the index.",
    });
  }
};
