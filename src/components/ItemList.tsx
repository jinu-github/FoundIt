import type { LibraryItem } from "../lib/types";
import { symbols } from "../lib/types";
import ImagePreview from "./ImagePreview";
export default function ItemList({
  items,
  onSelect,
  selected,
  snippets,
}: {
  items: LibraryItem[];
  onSelect: (item: LibraryItem) => void;
  selected?: string;
  snippets?: Map<string, string>;
}) {
  return (
    <div className="item-grid">
      {items.map((item) => (
        <button
          className={`item-card ${selected === item.id ? "selected" : ""}`}
          key={item.id}
          onClick={() => onSelect(item)}
        >
          {item.type === "image" ? (
            <div className="thumbnail">
              <ImagePreview id={item.id} title={item.title} openable={false} />
            </div>
          ) : (
            <div className={`item-icon ${item.type}`}>{symbols[item.type]}</div>
          )}
          <span className="eyebrow">{item.type}</span>
          {item.ocr && (
            <span className={`ocr-badge ${item.ocr.status}`}>
              OCR: {item.ocr.status}
            </span>
          )}
          <h2>{item.title}</h2>
          <p className="snippet">
            {(
              snippets?.get(item.id) ||
              item.textContent ||
              item.ocr?.text ||
              item.url ||
              "Image saved locally. Open to view."
            ).slice(0, 182)}
          </p>
          <div className="tags">
            {item.tags.slice(0, 3).map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
            {item.tags.length > 3 && <span>+{item.tags.length - 3}</span>}
          </div>
          <small>
            {new Date(item.updatedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </small>
        </button>
      ))}
    </div>
  );
}
