import { useState } from "react";
import { itemTypes, type LibraryItem, type ItemInput } from "../lib/types";
import { IMAGE_TYPES, validateImage } from "../lib/validation";
export default function ItemForm({
  item,
  busy,
  onSave,
  onCancel,
}: {
  item?: LibraryItem;
  busy: boolean;
  onSave: (input: ItemInput, image?: Blob) => Promise<void>;
  onCancel: () => void;
}) {
  const [type, setType] = useState(item?.type ?? "image");
  const [title, setTitle] = useState(item?.title ?? "");
  const [tags, setTags] = useState(item?.tags.join(", ") ?? "");
  const [text, setText] = useState(item?.textContent ?? "");
  const [url, setUrl] = useState(item?.url ?? "");
  const [file, setFile] = useState<File>();
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          await onSave(
            { type, title, tags: tags.split(","), textContent: text, url },
            file,
          );
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : "Could not save. Please try again.",
          );
        }
      }}
    >
      <div className="panel-heading">
        <h2>{item ? "Edit item" : "Save something useful"}</h2>
        <button
          type="button"
          className="quiet"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
      <fieldset disabled={busy}>
        {!item && (
          <div className="type-picker" role="group" aria-label="Item type">
            {itemTypes.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => {
                  setType(t);
                  setFile(undefined);
                  setError("");
                }}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        {type === "image" && !item && (
          <label className="upload">
            Image file
            <input
              type="file"
              accept={IMAGE_TYPES.join(",")}
              onChange={(e) => {
                const selected = e.target.files?.[0];
                setFile(undefined);
                setError("");
                if (selected)
                  try {
                    validateImage(selected);
                    setFile(selected);
                    if (!title) setTitle(selected.name);
                  } catch (error) {
                    setError((error as Error).message);
                    e.target.value = "";
                  }
              }}
            />
            <span>PNG, JPEG, WebP or GIF · Maximum 10 MiB per image</span>
          </label>
        )}
        <label>
          Title
          <input
            autoFocus
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A name you’ll remember"
          />
        </label>
        {type === "link" && (
          <label>
            URL
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </label>
        )}
        <label>
          {type === "text"
            ? "Copied text"
            : type === "note"
              ? "Note"
              : "Notes (optional)"}
          <textarea
            rows={6}
            required={type === "text" || type === "note"}
            maxLength={100000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Keep the details that matter…"
          />
        </label>
        <label>
          Tags
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="design, inspiration, personal"
          />
          <span>Separate with commas. Up to 20 tags, 40 characters each.</span>
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" type="submit">
          {busy ? "Saving…" : item ? "Save changes" : "Save to library"}
        </button>
      </fieldset>
    </form>
  );
}
