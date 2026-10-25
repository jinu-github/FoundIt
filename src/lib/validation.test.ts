import { expect, it } from "vitest";
import { MAX_IMAGE_BYTES, normalizeInput, validateImage } from "./validation";
import type { ItemInput } from "./types";
const input: ItemInput = {
  type: "note",
  title: "Note",
  tags: [],
  textContent: "Body",
  url: "",
};
it.each([
  "javascript:alert(1)",
  "data:text/html,hello",
  "file:///C:/test",
  "ftp://example.com",
  "https://name:password@example.com",
  "bad",
])("rejects unsafe or invalid URL %s", (url) => {
  expect(() => normalizeInput({ ...input, type: "link", url })).toThrow(
    "HTTP or HTTPS",
  );
});
it("normalizes metadata and accepts a safe link", () => {
  expect(
    normalizeInput({
      ...input,
      type: "link",
      title: " Link ",
      tags: [" A ", "a", ""],
      url: "https://example.com",
    }),
  ).toMatchObject({ title: "Link", tags: ["a"], url: "https://example.com/" });
});
it("enforces title, body, and tag limits", () => {
  expect(() => normalizeInput({ ...input, title: " " })).toThrow();
  expect(() => normalizeInput({ ...input, title: "x".repeat(201) })).toThrow();
  expect(() => normalizeInput({ ...input, textContent: " " })).toThrow();
  expect(() =>
    normalizeInput({ ...input, textContent: "x".repeat(100001) }),
  ).toThrow();
  expect(() => normalizeInput({ ...input, tags: ["x".repeat(41)] })).toThrow();
  expect(() =>
    normalizeInput({
      ...input,
      tags: Array.from({ length: 21 }, (_, i) => String(i)),
    }),
  ).toThrow();
});
it("enforces image format and exact size boundary", () => {
  expect(() =>
    validateImage(new Blob(["abc"], { type: "image/svg+xml" })),
  ).toThrow("PNG");
  expect(() => validateImage(new Blob([], { type: "image/png" }))).toThrow(
    "nonempty",
  );
  expect(() =>
    validateImage(
      new Blob([new Uint8Array(MAX_IMAGE_BYTES)], { type: "image/png" }),
    ),
  ).not.toThrow();
  expect(() =>
    validateImage(
      new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)], { type: "image/png" }),
    ),
  ).toThrow("10 MiB");
});
