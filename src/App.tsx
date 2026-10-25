import { useCallback, useEffect, useRef, useState } from "react";
import {
  itemTypes,
  type ItemInput,
  type ItemType,
  type LibraryItem,
} from "./lib/types";
import { deleteItem, listItems, saveItem } from "./lib/items";
import ItemForm from "./components/ItemForm";
import ItemList from "./components/ItemList";
import { symbols } from "./lib/types";
import ItemDetails from "./components/ItemDetails";
export default function App() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [filter, setFilter] = useState<ItemType | "all">("all");
  const [selected, setSelected] = useState<LibraryItem>();
  const [mode, setMode] = useState<"view" | "add" | "edit">("view");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [storage, setStorage] = useState("");
  const lock = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await listItems());
    } catch {
      setError(
        "Unable to read local storage. Check browser storage permissions and retry.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    listItems()
      .then((items) => {
        if (active) setItems(items);
      })
      .catch(() => {
        if (active)
          setError(
            "Unable to read local storage. Check browser storage permissions and retry.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
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
      setItems((current) => [
        result,
        ...current.filter((item) => item.id !== result.id),
      ]);
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
      setItems((current) => current.filter((item) => item.id !== selected.id));
      setSelected(undefined);
      setStatus("Item deleted.");
    } catch {
      setError("Could not delete this item. Please retry.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const visible = items.filter((i) => filter === "all" || i.type === filter);
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
        <div className="collection-bar">
          <span>
            {visible.length} {visible.length === 1 ? "item" : "items"}
          </span>
          <span>Recently updated first</span>
        </div>
        {status && (
          <p className="success" role="status">
            {status}
          </p>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => void reload()}>Retry</button>
          </div>
        )}
        <div
          className={`workspace ${mode !== "view" || selected ? "with-panel" : ""}`}
        >
          <section aria-label="Saved items">
            {loading ? (
              <p role="status">Loading your library…</p>
            ) : visible.length ? (
              <ItemList
                items={visible}
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
                  {items.length
                    ? "Nothing here yet"
                    : "A home for your good finds"}
                </h2>
                <p>
                  Save a screenshot, a useful link, a piece of text,
                  <br />
                  or a thought you want to keep.
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
                <ItemDetails
                  key={selected.id}
                  item={selected}
                  busy={busy}
                  onEdit={() => setMode("edit")}
                  onDelete={() => void remove()}
                  onClose={() => setSelected(undefined)}
                />
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
