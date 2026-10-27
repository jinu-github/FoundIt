import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { listItems } from "../lib/items";
import type { LibraryItem } from "../lib/types";
export function useLibrary() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const subscription = liveQuery(() => listItems()).subscribe({
      next: (items) => {
        setItems(items);
        setLoading(false);
        setError("");
      },
      error: () => {
        setError(
          "Unable to read local storage. Check browser storage permissions and retry.",
        );
        setLoading(false);
      },
    });
    return () => subscription.unsubscribe();
  }, [generation]);
  return {
    items,
    loading,
    error,
    reload: () => {
      setLoading(true);
      setError("");
      setGeneration((n) => n + 1);
    },
  };
}
