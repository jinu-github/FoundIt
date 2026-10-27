import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createWorker } from "tesseract.js";
import { createOcrEngine, OCR_ASSET_PATHS } from "./ocr-engine";
vi.mock("tesseract.js", () => ({
  createWorker: vi.fn(),
  OEM: { LSTM_ONLY: 1 },
}));
const close = vi.fn();
const recognize = vi.fn(async () => ({ data: { text: "  Local text  " } }));
const terminate = vi.fn(async () => {});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 1000, height: 500, close })),
  );
  vi.mocked(createWorker).mockResolvedValue({
    recognize,
    terminate,
  } as unknown as Awaited<ReturnType<typeof createWorker>>);
});
afterEach(() => vi.unstubAllGlobals());
it("uses only explicit local worker/core/language paths and reuses its worker", async () => {
  const engine = createOcrEngine();
  const blob = new Blob(["fixture"], { type: "image/png" });
  expect(await engine.recognize(blob)).toBe("Local text");
  await engine.recognize(blob);
  expect(createWorker).toHaveBeenCalledTimes(1);
  expect(createWorker).toHaveBeenCalledWith(
    "eng",
    1,
    expect.objectContaining({
      ...OCR_ASSET_PATHS,
      workerBlobURL: false,
      cacheMethod: "none",
    }),
  );
  for (const path of Object.values(OCR_ASSET_PATHS))
    expect(path).toMatch(/^\/ocr\//);
  expect(close).toHaveBeenCalledTimes(2);
  await engine.terminate();
  expect(terminate).toHaveBeenCalledTimes(1);
});
it("rejects excessive decoded dimensions without starting recognition", async () => {
  vi.mocked(createImageBitmap).mockResolvedValue({
    width: 10000,
    height: 5000,
    close,
  } as unknown as ImageBitmap);
  await expect(createOcrEngine().recognize(new Blob())).rejects.toThrow(
    "40-megapixel",
  );
  expect(createWorker).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalled();
});
it("propagates decode failure for the queue to persist as failed", async () => {
  vi.mocked(createImageBitmap).mockRejectedValue(new Error("Decode failed"));
  await expect(createOcrEngine().recognize(new Blob())).rejects.toThrow(
    "Decode failed",
  );
  expect(createWorker).not.toHaveBeenCalled();
});
it("disposes a worker that finishes initializing after interruption", async () => {
  let resolveWorker!: (
    worker: Awaited<ReturnType<typeof createWorker>>,
  ) => void;
  vi.mocked(createWorker).mockReturnValue(
    new Promise((resolve) => {
      resolveWorker = resolve;
    }),
  );
  const engine = createOcrEngine();
  const result = engine.recognize(new Blob());
  const rejected = expect(result).rejects.toThrow("stopped");
  await vi.waitFor(() => expect(createWorker).toHaveBeenCalled());
  await engine.terminate();
  resolveWorker({ recognize, terminate } as unknown as Awaited<
    ReturnType<typeof createWorker>
  >);
  await rejected;
  expect(terminate).toHaveBeenCalledTimes(1);
  expect(recognize).not.toHaveBeenCalled();
});
