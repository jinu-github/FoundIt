import { useState } from "react";
import type { LibraryItem } from "../lib/types";
import ImagePreview from "./ImagePreview";
export default function ItemDetails({
  item,
  busy,
  onEdit,
  onDelete,
  onClose,
  onRetryOcr,
}: {
  item: LibraryItem;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  onRetryOcr: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <section aria-label="Item details">
      <div className="panel-heading">
        <span className="eyebrow">{item.type}</span>
        <button className="quiet" disabled={busy} onClick={onClose}>
          Close
        </button>
      </div>
      <h2 className="detail-title">{item.title}</h2>
      {item.type === "image" && (
        <div className="image-preview">
          <ImagePreview id={item.id} title={item.title} />
        </div>
      )}
      {item.url && (
        <a
          className="external-link"
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open link ↗<span>{item.url}</span>
        </a>
      )}
      {item.textContent && <p className="saved-text">{item.textContent}</p>}
      {item.ocr && (
        <section className="ocr-panel" aria-label="Image text">
          <h3>
            Extracted text{" "}
            <span className={`ocr-badge ${item.ocr.status}`}>
              {item.ocr.status}
            </span>
          </h3>
          {item.ocr.status === "pending" && (
            <p role="status">Waiting for local text extraction…</p>
          )}
          {item.ocr.status === "processing" && (
            <p role="status">
              Processing on this device. You can keep using your library.
            </p>
          )}
          {item.ocr.status === "completed" && (
            <>
              <p className="saved-text">
                {item.ocr.text || "No text detected."}
              </p>
              <small>
                English OCR can make mistakes. Add notes or tags to keep this
                image findable.
              </small>
            </>
          )}
          {item.ocr.status === "failed" && (
            <>
              <p>{item.ocr.error}</p>
              <button disabled={busy} onClick={onRetryOcr}>
                Retry OCR
              </button>
            </>
          )}
        </section>
      )}
      <div className="tags">
        {item.tags.map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </div>
      <dl>
        <dt>Created</dt>
        <dd>{new Date(item.createdAt).toLocaleString()}</dd>
        <dt>Updated</dt>
        <dd>{new Date(item.updatedAt).toLocaleString()}</dd>
      </dl>
      <div className="actions">
        <button className="primary" disabled={busy} onClick={onEdit}>
          Edit item
        </button>
        <button
          className="danger"
          disabled={busy}
          onClick={() => setConfirm(true)}
        >
          Delete
        </button>
      </div>
      {confirm && (
        <div className="delete-confirm" role="alert">
          <p>
            Permanently delete this item
            {item.type === "image" ? " and its image" : ""}?
          </p>
          <button className="danger" disabled={busy} onClick={onDelete}>
            {busy ? "Deleting…" : "Delete permanently"}
          </button>
          <button
            className="quiet"
            disabled={busy}
            onClick={() => setConfirm(false)}
          >
            Keep item
          </button>
        </div>
      )}
    </section>
  );
}
