import { createWorker, OEM, type Worker } from "tesseract.js";
export interface OcrEngine {
  recognize(blob: Blob): Promise<string>;
  terminate(): Promise<void>;
}
export const OCR_ASSET_PATHS = {
  workerPath: "/ocr/worker.min.js",
  corePath: "/ocr/core",
  langPath: "/ocr/lang",
};
export function createOcrEngine(): OcrEngine {
  let worker: Worker | undefined;
  let stopped = false;
  return {
    async recognize(blob) {
      const bitmap = await createImageBitmap(blob);
      let image: Blob | HTMLCanvasElement = blob;
      try {
        if (bitmap.width * bitmap.height > 40000000)
          throw new Error(
            "Image dimensions exceed the 40-megapixel OCR limit.",
          );
        if (
          bitmap.width * bitmap.height > 6000000 ||
          Math.max(bitmap.width, bitmap.height) > 4000
        ) {
          const scale = Math.min(
            Math.sqrt(6000000 / (bitmap.width * bitmap.height)),
            4000 / Math.max(bitmap.width, bitmap.height),
          );
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Image preparation unavailable.");
          context.fillStyle = "white";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          image = canvas;
        }
      } finally {
        bitmap.close();
      }
      if (stopped) throw new Error("OCR stopped.");
      if (!worker) {
        const created = await createWorker("eng", OEM.LSTM_ONLY, {
          ...OCR_ASSET_PATHS,
          workerBlobURL: false,
          cacheMethod: "none",
          errorHandler: () => {},
        });
        if (stopped) {
          await created.terminate();
          throw new Error("OCR stopped.");
        }
        worker = created;
      }
      const result = await worker.recognize(image, {}, { text: true });
      return result.data.text.trim();
    },
    async terminate() {
      stopped = true;
      await worker?.terminate();
      worker = undefined;
    },
  };
}
