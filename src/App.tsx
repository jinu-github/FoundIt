import { useEffect, useRef, useState } from "react";
import {
  itemTypes,
  type ItemInput,
  type ItemType,
  type LibraryItem,
} from "./lib/types";
import { deleteItem, saveItem } from "./lib/items";
import { db } from "./lib/db";
import { retryOcr } from "./lib/ocr-store";
import { useLibrary } from "./hooks/use-library";
import { useOcr } from "./hooks/use-ocr";
import { useSearch } from "./hooks/use-search";
import ItemForm from "./components/ItemForm";
import ItemList from "./components/ItemList";
import { symbols } from "./lib/types";
import ItemDetails from "./components/ItemDetails";
export default function App() {
  const { items, loading, error: storageError, reload } = useLibrary();
  const ocrError = useOcr();
  const [filter, setFilter] = useState<ItemType | "all">("all");
  const [selected, setSelected] = useState<LibraryItem>();
  const [mode, setMode] = useState<"view" | "add" | "edit">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [storage, setStorage] = useState("");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const search = useSearch(items, { text: query, type: filter, tag });
  const lock = useRef(false);
  const panel = useRef<HTMLElement>(null);
  // Keep the editor's selected snapshot stable. Live updates only replace the view,
  // never the ItemForm key or its local draft state.
  const viewedItem = selected
    ? items.find((item) => item.id === selected.id)
    : undefined;
  useEffect(() => {
    if (mode !== "view" || selected) panel.current?.focus();
  }, [mode, selected]);
  async function save(input: ItemInput, image?: Blob) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await saveItem(
        input,
        image,
        mode === "edit" ? selected?.id : undefined,
      );
      setSelected(result);
      setMode("view");
      setStatus("Saved to your local library.");
    } catch (error) {
      throw new Error(
        error instanceof Error && error.name === "QuotaExceededError"
          ? "Storage is full. Free browser storage space and try again."
          : error instanceof Error
            ? error.message
            : "Could not save this item.",
        { cause: error },
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function remove() {
    if (!selected || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await deleteItem(selected.id);
      setSelected(undefined);
      setStatus("Item deleted.");
    } catch {
      setError("Could not delete this item. Please retry.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  const visible = search.hits
    .map((hit) => byId.get(hit.id))
    .filter((item): item is LibraryItem => !!item);
  const snippets = new Map(search.hits.map((hit) => [hit.id, hit.snippet]));
  const tags = [...new Set(items.flatMap((item) => item.tags))].sort();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#main">
          <span className="brand-mark">f.</span>FoundIt
          <span className="brand-dot">●</span>
        </a>
        <p className="sidebar-label">YOUR LIBRARY</p>
        <nav aria-label="Library categories">
          {(["all", ...itemTypes] as const).map((type) => (
            <button
              key={type}
              aria-current={filter === type ? "page" : undefined}
              onClick={() => setFilter(type)}
            >
              <span>{type === "all" ? "▦" : symbols[type]}</span>
              {type === "all"
                ? "All items"
                : type === "text"
                  ? "Copied text"
                  : `${type[0].toUpperCase()}${type.slice(1)}s`}
              <small>
                {type === "all"
                  ? items.length
                  : items.filter((i) => i.type === type).length}
              </small>
            </button>
          ))}
        </nav>
        <div className="local-note">
          <span className="local-badge">● LOCAL BY DESIGN</span>
          <p>Your collection stays in this browser on this device.</p>
          <small>
            Clearing site data may delete your library. There is no backup in
            this version.
          </small>
          <button
            className="storage-button"
            onClick={async () => {
              try {
                const granted = await navigator.storage?.persist?.();
                setStorage(
                  granted
                    ? "Persistent storage granted. Site data can still be cleared manually."
                    : "Persistent storage was not granted or is unavailable. Your library still uses local browser storage.",
                );
              } catch {
                setStorage(
                  "Unable to request persistent storage in this browser.",
                );
              }
            }}
          >
            Protect local storage
          </button>
          {storage && <small role="status">{storage}</small>}
        </div>
      </aside>
      <main id="main">
        <header>
          <div>
            <p className="eyebrow">A LITTLE LESS LOST. A LITTLE MORE FOUND.</p>
            <h1>
              {filter === "all"
                ? "Your collection"
                : filter === "text"
                  ? "Copied text"
                  : `${filter[0].toUpperCase()}${filter.slice(1)}s`}
            </h1>
            <p className="subtitle">
              Keep what matters. Pick up where you left off.
            </p>
          </div>
          <button
            className="primary add-button"
            disabled={busy}
            onClick={() => {
              setSelected(undefined);
              setMode("add");
              setStatus("");
            }}
          >
            ＋ Add item
          </button>
        </header>
        <div className="search-bar">
          <label>
            Search your library
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, text, tags, links, and image text…"
            />
          </label>
          <label>
            Tag
            <select value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">All tags</option>
              {tag && !tags.includes(tag) && <option value={tag}>{tag}</option>}
              {tags.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          {(query || tag) && (
            <button
              className="quiet"
              onClick={() => {
                setQuery("");
                setTag("");
              }}
            >
              Clear search
            </button>
          )}
        </div>
        <div className="collection-bar">
          <span>
            {visible.length} {visible.length === 1 ? "item" : "items"}
          </span>
          <span>
            {query.trim() ? "Best matches first" : "Recently updated first"}
          </span>
        </div>
        {status && (
          <p className="success" role="status">
            {status}
          </p>
        )}
        {(error || storageError || ocrError || search.error) && (
          <div className="error" role="alert">
            {error || storageError || ocrError || search.error}
            {storageError && (
              <button
                onClick={() => {
                  setError("");
                  reload();
                }}
              >
                Retry
              </button>
            )}
          </div>
        )}
        <div
          className={`workspace ${mode !== "view" || selected ? "with-panel" : ""}`}
        >
          <section aria-label="Saved items">
            {loading || search.searching ? (
              <p role="status">
                {loading ? "Loading your library…" : "Searching your library…"}
              </p>
            ) : visible.length ? (
              <ItemList
                items={visible}
                snippets={snippets}
                selected={selected?.id}
                onSelect={(item) => {
                  if (!busy) {
                    setSelected(item);
                    setMode("view");
                  }
                }}
              />
            ) : (
              <div className="empty">
                <div className="empty-icon">
                  ▧ <span>✎</span>
                </div>
                <h2>
                  {query || tag
                    ? "No matching items"
                    : items.length
                      ? "Nothing here yet"
                      : "A home for your good finds"}
                </h2>
                <p>
                  {query || tag
                    ? "Try different words or clear your filters."
                    : "Save a screenshot, a useful link, a piece of text,"}
                  <br />
                  {!query && !tag && "or a thought you want to keep."}
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    setSelected(undefined);
                    setMode("add");
                  }}
                >
                  Add your first {filter === "all" ? "item" : filter}
                </button>
                <small>Private by default. No account needed.</small>
              </div>
            )}
          </section>
          {(mode !== "view" || selected) && (
            <aside
              className="detail-panel"
              ref={panel}
              tabIndex={-1}
              aria-label={mode === "view" ? "Selected item" : "Item editor"}
            >
              {mode === "view" && selected ? (
                viewedItem ? (
                  <ItemDetails
                    key={selected.id}
                    item={viewedItem}
                    busy={busy}
                    onEdit={() => setMode("edit")}
                    onDelete={() => void remove()}
                    onClose={() => setSelected(undefined)}
                    onRetryOcr={() => {
                      void retryOcr(selected.id, db).catch(() =>
                        setError(
                          "Could not queue OCR. Check local storage and retry.",
                        ),
                      );
                    }}
                  />
                ) : (
                  <p>
                    This item was deleted.{" "}
                    <button onClick={() => setSelected(undefined)}>
                      Close
                    </button>
                  </p>
                )
              ) : (
                <ItemForm
                  key={mode + (selected?.id ?? "")}
                  item={mode === "edit" ? selected : undefined}
                  busy={busy}
                  onSave={save}
                  onCancel={() => setMode("view")}
                />
              )}
            </aside>
          )}
        </div>
        <footer>
          FoundIt <span>Made for the things worth keeping.</span>
        </footer>
      </main>
    </div>
  );
}
