import { useEffect, useRef, useState } from "react";
import type { LibraryItem } from "../lib/types";
import type { SearchHit, SearchQuery } from "../lib/search";
export function useSearch(items: LibraryItem[], query: SearchQuery) {
  const worker = useRef<Worker | null>(null);
  const version = useRef(0);
  const previous = useRef<LibraryItem[] | null>(null);
  const [response, setResponse] = useState<{
    items: LibraryItem[];
    key: string;
    hits: SearchHit[];
    error: string;
  }>();
  const key = JSON.stringify(query);
  useEffect(() => {
    const instance = new Worker(
      new URL("../workers/search.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = instance;
    return () => {
      instance.terminate();
      worker.current = null;
      previous.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = worker.current;
    if (!instance) return;
    const current = ++version.current;
    let active = true;
    instance.onmessage = (
      event: MessageEvent<{
        version: number;
        hits?: SearchHit[];
        error?: string;
      }>,
    ) => {
      if (active && event.data.version === current)
        setResponse({
          items,
          key,
          hits: event.data.hits ?? [],
          error: event.data.error ?? "",
        });
    };
    instance.onerror = () => {
      if (active)
        setResponse({
          items,
          key,
          hits: [],
          error: "Search worker could not start. Reload to retry.",
        });
    };
    const timer = setTimeout(() => {
      const changed = previous.current !== items;
      instance.postMessage({
        version: current,
        query: JSON.parse(key),
        ...(changed ? { items } : {}),
      });
      previous.current = items;
    }, 120);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [items, key]);
  const current = response?.items === items && response.key === key;
  return {
    hits: current ? response.hits : [],
    error: current ? response.error : "",
    searching: !current,
  };
}
