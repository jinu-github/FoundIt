import { describe, expect, it, vi } from "vitest";
import { observePwa, verifyOfflineFiles } from "./pwa";
const origin = "http://127.0.0.1:5173";
function fixture(entries = [{ url: "index.html", revision: "abc" }]) {
  const responses = new Map<string, unknown>([
    [
      `${origin}/offline-assets.json?__WB_REVISION__=build`,
      { ok: true, json: async () => ({ buildId: "build", entries }) },
    ],
    [`${origin}/index.html?__WB_REVISION__=abc`, { ok: true }],
  ]);
  const storage = {
    keys: async () => ["foundit-pwa-precache-v2-local"],
    open: async () => ({ match: async (key: string) => responses.get(key) }),
  } as unknown as CacheStorage;
  return { storage, responses };
}
describe("offline cache verification", () => {
  it("requires every exact revision of this build", async () => {
    const { storage, responses } = fixture();
    expect(await verifyOfflineFiles(storage, origin, "build")).toBe(true);
    expect(await verifyOfflineFiles(storage, origin, "old")).toBe(false);
    responses.delete(`${origin}/index.html?__WB_REVISION__=abc`);
    expect(await verifyOfflineFiles(storage, origin, "build")).toBe(false);
  });
  it.each([
    "https://external.test/file",
    "/saved-content",
    "assets/file.js?private=1",
  ])("rejects non-asset URL %s", async (url) => {
    expect(
      await verifyOfflineFiles(
        fixture([{ url, revision: "abc" }]).storage,
        origin,
        "build",
      ),
    ).toBe(false);
  });
  it("reports prepared without control, then ready; never activates waiting worker", async () => {
    const report = vi.fn();
    const sw = Object.assign(new EventTarget(), {
      controller: null as object | null,
      register: vi.fn(),
    });
    const waiting = { postMessage: vi.fn() };
    const registration = Object.assign(new EventTarget(), {
      waiting,
      installing: null,
      update: vi.fn(),
    });
    sw.register.mockResolvedValue(registration);
    const observer = observePwa(
      sw as unknown as ServiceWorkerContainer,
      fixture().storage,
      origin,
      "build",
      report,
    );
    await vi.waitFor(() =>
      expect(report).toHaveBeenLastCalledWith({
        offline: "reopen",
        updateReady: true,
      }),
    );
    sw.controller = {};
    sw.dispatchEvent(new Event("controllerchange"));
    await vi.waitFor(() =>
      expect(report).toHaveBeenLastCalledWith({
        offline: "ready",
        updateReady: true,
      }),
    );
    expect(waiting.postMessage).not.toHaveBeenCalled();
    observer.dispose();
    report.mockClear();
    await observer.check();
    expect(report).not.toHaveBeenCalled();
  });
  it("reports registration failure", async () => {
    const report = vi.fn();
    const sw = Object.assign(new EventTarget(), {
      register: vi.fn().mockRejectedValue(new Error("denied")),
    });
    const observer = observePwa(
      sw as unknown as ServiceWorkerContainer,
      fixture().storage,
      origin,
      "build",
      report,
    );
    await vi.waitFor(() =>
      expect(report).toHaveBeenCalledWith({
        offline: "failed",
        updateReady: false,
      }),
    );
    observer.dispose();
  });
  it("fails safely when Cache Storage is denied", async () => {
    const report = vi.fn();
    const registration = Object.assign(new EventTarget(), {
      active: {},
      waiting: null,
      installing: null,
    });
    const sw = Object.assign(new EventTarget(), {
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
    });
    const storage = {
      keys: vi.fn().mockRejectedValue(new Error("storage denied")),
    } as unknown as CacheStorage;
    const observer = observePwa(
      sw as unknown as ServiceWorkerContainer,
      storage,
      origin,
      "build",
      report,
    );
    await vi.waitFor(() =>
      expect(report).toHaveBeenCalledWith({
        offline: "failed",
        updateReady: false,
      }),
    );
    observer.dispose();
  });
});
