import { liveQuery } from "dexie";
import type { LibraryDB } from "./db";
import type { OcrEngine } from "./ocr-engine";
import { claimOcr, finishOcr, recoverOcr } from "./ocr-store";
export const OCR_TIMEOUT_MS = 120000;
export class OcrQueue {
  private engine?: OcrEngine;
  private stopped = false;
  private running = false;
  private requested = false;
  private subscription?: { unsubscribe(): void };
  private interrupt?: () => void;
  constructor(
    private database: LibraryDB,
    private factory: () => OcrEngine,
    private onError: (message: string) => void,
    private timeout = OCR_TIMEOUT_MS,
  ) {}
  async start() {
    await recoverOcr(this.database);
    if (this.stopped) return;
    this.subscription = liveQuery(() =>
      this.database.items.where("ocr.status").equals("pending").count(),
    ).subscribe({
      next: () => {
        void this.drain();
      },
      error: () =>
        this.onError("OCR queue cannot read local storage. Reload to retry."),
    });
    await this.drain();
  }
  private async drain() {
    this.requested = true;
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      while (!this.stopped && this.requested) {
        this.requested = false;
        let job;
        while (!this.stopped && (job = await claimOcr(this.database))) {
          if (this.stopped) break;
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            if (!job.blob) throw new Error("Image missing");
            this.engine ??= this.factory();
            const timed = new Promise<never>((_, reject) => {
              this.interrupt = () => reject(new Error("Interrupted"));
              timer = setTimeout(
                () => reject(new Error("Timeout")),
                this.timeout,
              );
            });
            const text = await Promise.race([
              this.engine.recognize(job.blob),
              timed,
            ]);
            if (!this.stopped)
              await finishOcr(job.id, job.jobId, { text }, this.database);
          } catch {
            await this.engine?.terminate();
            this.engine = undefined;
            if (!this.stopped)
              await finishOcr(
                job.id,
                job.jobId,
                {
                  error:
                    "Text extraction failed. The image may be unreadable, too large to decode, or processing timed out. Check local OCR assets and retry.",
                },
                this.database,
              );
          } finally {
            clearTimeout(timer);
            this.interrupt = undefined;
          }
        }
      }
    } catch {
      if (!this.stopped)
        this.onError(
          "OCR could not save its state. Reload after checking available browser storage.",
        );
    } finally {
      this.running = false;
    }
  }
  async stop() {
    this.stopped = true;
    this.subscription?.unsubscribe();
    this.interrupt?.();
    await this.engine?.terminate();
  }
}
