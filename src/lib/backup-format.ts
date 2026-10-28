import type { LibraryItem } from "./types";
import { normalizeInput, IMAGE_TYPES } from "./validation";
export const LIMITS = {
  items: 5000,
  archive: 512 * 1024 * 1024,
  download: 128 * 1024 * 1024,
  metadata: 16 * 1024 * 1024,
  manifest: 2 * 1024 * 1024,
};
export interface ArchiveFile {
  path: string;
  size: number;
  sha256: string;
  mime: string;
}
export interface Manifest {
  format: "foundit";
  version: 1;
  createdAt: number;
  itemCount: number;
  files: ArchiveFile[];
}
export function check(
  ok: unknown,
  message = "Invalid FoundIt archive.",
): asserts ok {
  if (!ok) throw new Error(message);
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const timestamp = (v: unknown) =>
  Number.isSafeInteger(v) &&
  (v as number) >= 0 &&
  (v as number) <= 8640000000000000;
const string = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max;
export function parseItems(value: unknown): LibraryItem[] {
  check(
    Array.isArray(value) && value.length <= LIMITS.items,
    "Invalid item list or too many items (maximum 5,000).",
  );
  const ids = new Set<string>();
  return value.map((v: unknown) => {
    check(object(v));
    check(
      string(v.id, 128) && /^[a-zA-Z0-9_-]+$/.test(v.id) && !ids.has(v.id),
      "Invalid or duplicate item ID.",
    );
    ids.add(v.id);
    check(
      string(v.title, 200) &&
        string(v.textContent, 100000) &&
        string(v.url, LIMITS.metadata),
    );
    check(
      Array.isArray(v.tags) &&
        v.tags.length <= 20 &&
        v.tags.every((t) => string(t, 40)),
    );
    check(
      timestamp(v.createdAt) &&
        timestamp(v.updatedAt) &&
        Number(v.updatedAt) >= Number(v.createdAt),
      "Invalid item timestamps.",
    );
    const item = v as unknown as LibraryItem;
    const normalized = normalizeInput(item);
    check(
      normalized.title === item.title &&
        normalized.url === item.url &&
        JSON.stringify(normalized.tags) === JSON.stringify(item.tags),
      "Item fields are not in the supported format.",
    );
    if (item.type === "image") {
      const o = v.ocr;
      check(
        object(o) &&
          typeof o.status === "string" &&
          ["pending", "processing", "completed", "failed"].includes(o.status) &&
          o.language === "eng",
      );
      check(
        string(o.text, LIMITS.metadata) && string(o.jobId, 128) && !!o.jobId,
      );
      check(o.completedAt === undefined || timestamp(o.completedAt));
      check(o.error === undefined || string(o.error, 100000));
    } else check(v.ocr === undefined, "Only images may have OCR data.");
    // Copy only supported fields; imported objects never become executable markup.
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      tags: [...item.tags],
      textContent: item.textContent,
      url: item.url,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      ...(item.ocr
        ? {
            ocr: {
              status: item.ocr.status,
              text: item.ocr.text,
              language: item.ocr.language,
              jobId: item.ocr.jobId,
              ...(item.ocr.completedAt !== undefined
                ? { completedAt: item.ocr.completedAt }
                : {}),
              ...(item.ocr.error !== undefined
                ? { error: item.ocr.error }
                : {}),
            },
          }
        : {}),
    };
  });
}
export function imagePath(item: LibraryItem, mime: string) {
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  check(IMAGE_TYPES.includes(mime), "Unsupported image MIME type.");
  return `images/${item.id}.${extensions[mime]}`;
}
export function parseManifest(v: unknown): Manifest {
  check(object(v) && v.format === "foundit", "Not a FoundIt backup.");
  check(v.version === 1, "Unsupported backup version.");
  check(
    timestamp(v.createdAt) &&
      Number.isSafeInteger(v.itemCount) &&
      Number(v.itemCount) >= 0 &&
      Number(v.itemCount) <= LIMITS.items,
  );
  check(Array.isArray(v.files) && v.files.length <= LIMITS.items + 1);
  const paths = new Set<string>();
  let total = 0;
  for (const f of v.files) {
    check(object(f) && string(f.path, 160) && !paths.has(f.path));
    check(
      f.path === "items.json" ||
        /^images\/[a-zA-Z0-9_-]+\.(png|jpg|webp|gif)$/.test(f.path),
      "Unsafe or unsupported archive path.",
    );
    paths.add(f.path);
    check(Number.isSafeInteger(f.size) && Number(f.size) > 0);
    check(string(f.sha256, 64) && /^[a-f0-9]{64}$/.test(f.sha256));
    check(
      f.path === "items.json"
        ? f.mime === "application/json" && Number(f.size) <= LIMITS.metadata
        : IMAGE_TYPES.includes(String(f.mime)) &&
            Number(f.size) <= 10 * 1024 * 1024,
    );
    total += Number(f.size);
  }
  check(
    paths.has("items.json") && total <= LIMITS.archive,
    "Archive content exceeds supported limits.",
  );
  return v as unknown as Manifest;
}
export async function checksum(blob: Blob) {
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON in backup metadata.");
  }
}
