import { itemTypes, type ItemInput } from "./types";
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];
export function validateImage(blob: Blob) {
  if (!IMAGE_TYPES.includes(blob.type))
    throw new Error("Choose a PNG, JPEG, WebP, or GIF image.");
  if (!blob.size || blob.size > MAX_IMAGE_BYTES)
    throw new Error("Images must be nonempty and no larger than 10 MiB.");
}
export function normalizeInput(input: ItemInput): ItemInput {
  if (!itemTypes.includes(input.type))
    throw new Error("Choose a supported item type.");
  const title = input.title.trim();
  if (!title || title.length > 200)
    throw new Error("Enter a title of 1–200 characters.");
  if (input.textContent.length > 100000)
    throw new Error("Text must be at most 100,000 characters.");
  const tags = [
    ...new Set(input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean)),
  ];
  if (tags.length > 20 || tags.some((t) => t.length > 40))
    throw new Error("Use up to 20 tags, each at most 40 characters.");
  let url = "";
  if (input.type === "link") {
    try {
      const parsed = new URL(input.url.trim());
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password
      )
        throw new Error();
      url = parsed.href;
    } catch {
      throw new Error(
        "Enter a valid HTTP or HTTPS URL without embedded credentials.",
      );
    }
  }
  if (["text", "note"].includes(input.type) && !input.textContent.trim())
    throw new Error("Enter some text before saving.");
  return { ...input, title, tags, url };
}
