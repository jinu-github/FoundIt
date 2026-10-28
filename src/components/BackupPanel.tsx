import { useEffect, useRef, useState } from "react";
import { db } from "../lib/db";
import type {
  RestoreMode,
  RestorePreview,
  RestoreSession,
} from "../lib/backup";
type SaveWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable(): Promise<FileSystemWritableFileStream> }>;
};
export default function BackupPanel() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<RestorePreview>();
  const [result, setResult] = useState<RestorePreview>();
  const [mode, setMode] = useState<RestoreMode>("merge");
  const session = useRef<RestoreSession | undefined>(undefined);
  const task = useRef<Promise<void> | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void (task.current ?? Promise.resolve())
        .finally(() => session.current?.close())
        .catch(() => {});
    };
  }, []);
  function run(action: () => Promise<void>) {
    if (task.current) return;
    setBusy(true);
    setError("");
    setResult(undefined);
    task.current = action()
      .catch((e) => {
        if (mounted.current) {
          setMessage("");
          const name = e && typeof e === "object" && "name" in e ? e.name : "";
          setError(
            name === "AbortError"
              ? "Operation canceled. No library items were changed."
              : name === "QuotaExceededError"
                ? "Not enough storage to complete this operation. No restore was applied; existing library items are unchanged."
                : e instanceof Error
                  ? e.message
                  : "Backup operation failed.",
          );
        }
      })
      .finally(() => {
        task.current = undefined;
        if (mounted.current) setBusy(false);
      });
  }
  async function closeSession() {
    const current = session.current;
    session.current = undefined;
    await current?.close();
  }
  function progress(message: string) {
    if (mounted.current) setMessage(message);
  }
  async function saveBackup() {
    let destination: FileSystemWritableFileStream | undefined;
    try {
      const picker = (window as SaveWindow).showSaveFilePicker;
      if (picker) {
        const handle = await picker.call(window, {
          suggestedName: `foundit-${new Date().toISOString().slice(0, 10)}.zip`,
          types: [
            {
              description: "FoundIt backup",
              accept: { "application/zip": [".zip"] },
            },
          ],
        });
        destination = await handle.createWritable();
      }
      const { exportBackup } = await import("../lib/backup");
      const blob = await exportBackup(db, destination, progress);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `foundit-${new Date().toISOString().slice(0, 10)}.zip`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        progress(
          "Backup download requested. Check that the ZIP is saved before relying on it.",
        );
      } else progress("Backup file saved. Store it securely.");
    } catch (e) {
      await destination?.abort().catch(() => {});
      throw e;
    }
  }
  async function validate(file: File) {
    await closeSession();
    setPreview(undefined);
    const { openRestore } = await import("../lib/backup");
    session.current = await openRestore(db);
    try {
      const checked = await session.current.validate(file, progress);
      if (mounted.current) {
        setPreview(checked);
        setMessage(
          "Archive fully validated. Review the restore options below.",
        );
      }
    } catch (e) {
      await closeSession();
      throw e;
    }
  }
  async function restore() {
    const restored = await session.current!.commit(mode);
    setPreview(undefined);
    setResult(restored);
    progress("Restore committed. Existing IDs were kept unchanged.");
    try {
      await closeSession();
    } catch {
      setError(
        "Restore committed successfully, but temporary staging cleanup failed. It will be retried when the next restore session opens.",
      );
    }
  }
  const summary = result ?? preview;
  return (
    <details className="backup-panel">
      <summary>Backup and restore</summary>
      <p>
        Backups are <strong>unencrypted</strong> and contain your private notes,
        links, OCR text, and original images. Store them securely. Everything is
        processed locally.
      </p>
      <p className="backup-limits">
        Saved data only; unsaved edits are not included. Up to 5,000 items, 16
        MiB of metadata and 512 MiB per ZIP (128 MiB for download fallback).
        Images retain the 10 MiB limit. Restore needs temporary browser storage.
      </p>
      <div className="backup-actions">
        <button disabled={busy || !!preview} onClick={() => run(saveBackup)}>
          Export backup
        </button>
        <label>
          Choose backup to validate
          <input
            type="file"
            accept=".zip,application/zip"
            disabled={busy || !!preview}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) run(() => validate(file));
            }}
          />
        </label>
      </div>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {summary && (
        <div>
          <p>
            {summary.total} archived items. {summary.added}{" "}
            {result ? "added" : "new IDs"}. {summary.skipped.length} existing
            IDs {result ? "skipped" : "will be skipped in Merge"}.
          </p>
          {summary.skipped.length > 0 && (
            <details>
              <summary>
                Conflicting IDs — existing items are kept; backup versions are
                not restored
              </summary>
              <ul className="backup-conflicts">
                {summary.skipped.map((id) => (
                  <li key={id}>{id}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {preview && (
        <div className="backup-actions">
          <label>
            Restore mode
            <select
              value={mode}
              disabled={busy}
              onChange={(e) => setMode(e.target.value as RestoreMode)}
            >
              <option value="merge">
                Merge — add new IDs, skip existing IDs
              </option>
              <option value="empty">
                Restore into empty library — never clear existing data
              </option>
            </select>
          </label>
          <p>
            Conflicts and empty-library status are checked again when
            committing. Another tab may change the final counts. Different IDs
            remain separate items.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => run(restore)}
          >
            Restore validated backup
          </button>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await closeSession();
                setPreview(undefined);
                setMessage("Restore canceled. No library items were changed.");
              })
            }
          >
            Cancel restore
          </button>
        </div>
      )}
    </details>
  );
}
