import { useEffect, useState } from "react";
import { db } from "../lib/db";
import { createOcrEngine } from "../lib/ocr-engine";
import { OcrQueue } from "../lib/ocr-queue";
export function useOcr() {
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let release: (() => void) | undefined;
    let queue: OcrQueue | undefined;
    // An exclusive browser lock prevents another tab recovering live work.
    if (!navigator.locks) {
      queueMicrotask(() => {
        if (active)
          setError(
            "Automatic OCR requires a browser with Web Locks support, such as current Edge or Chrome. Your saved items remain available.",
          );
      });
      return;
    }
    void navigator.locks
      .request("foundit-ocr-v2", { signal: controller.signal }, async () => {
        if (!active) return;
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        queue = new OcrQueue(db, createOcrEngine, (message) => {
          if (active) setError(message);
        });
        try {
          await queue.start();
          await held;
        } finally {
          await queue.stop();
        }
      })
      .catch(() => {
        if (active)
          setError(
            "OCR could not start. Reload to retry; your images remain saved.",
          );
      });
    return () => {
      active = false;
      controller.abort();
      release?.();
      void queue?.stop();
    };
  }, []);
  return error;
}
