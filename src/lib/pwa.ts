export type OfflineState = "preparing" | "ready" | "reopen" | "failed";
export interface PwaState {
  offline: OfflineState;
  updateReady: boolean;
  preparationFailed?: boolean;
}

// Inspect only this build's Workbox precache. Never fetch or cache user content.
export async function verifyOfflineFiles(
  storage: CacheStorage,
  origin: string,
  buildId: string,
): Promise<boolean> {
  const inventoryKey = `${origin}/offline-assets.json?__WB_REVISION__=${buildId}`;
  for (const name of await storage.keys()) {
    if (!name.startsWith("foundit-pwa-precache-")) continue;
    const cache = await storage.open(name);
    const response = await cache.match(inventoryKey);
    if (!response?.ok) continue;
    const inventory = await response.json();
    if (
      inventory.buildId !== buildId ||
      !Array.isArray(inventory.entries) ||
      !inventory.entries.length
    )
      continue;
    for (const entry of inventory.entries) {
      if (
        typeof entry.url !== "string" ||
        !(entry.revision === null || typeof entry.revision === "string")
      )
        return false;
      const url = new URL(entry.url, `${origin}/`);
      if (
        url.origin !== origin ||
        !/^(\/index\.html|\/manifest\.webmanifest|\/assets\/[^?]+|\/icons\/[^?]+|\/ocr\/[^?]+)$/.test(
          url.pathname,
        ) ||
        url.search ||
        url.hash
      )
        return false;
      if (entry.revision !== null)
        url.searchParams.set("__WB_REVISION__", entry.revision);
      if (!(await cache.match(url.href))?.ok) return false;
    }
    return true;
  }
  return false;
}

export function observePwa(
  sw: ServiceWorkerContainer,
  storage: CacheStorage,
  origin: string,
  buildId: string,
  report: (state: PwaState) => void,
) {
  let disposed = false;
  let sequence = 0;
  let registration: ServiceWorkerRegistration | undefined;
  let preparationFailed = false;
  const cleanups: (() => void)[] = [];
  const listen = (target: EventTarget, event: string, action: () => void) => {
    target.addEventListener(event, action);
    cleanups.push(() => target.removeEventListener(event, action));
  };
  async function check() {
    const current = ++sequence;
    let offline: OfflineState = "failed";
    try {
      const cached = await verifyOfflineFiles(storage, origin, buildId);
      offline = cached
        ? sw.controller
          ? "ready"
          : "reopen"
        : registration?.installing
          ? "preparing"
          : "failed";
    } catch {
      /* Storage denial or eviction must not claim readiness. */
    }
    if (!disposed && current === sequence)
      report({
        offline,
        updateReady: !!registration?.waiting,
        ...(preparationFailed ? { preparationFailed: true } : {}),
      });
  }
  listen(sw, "controllerchange", () => {
    void check();
  });
  const register = () =>
    sw
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((result) => {
        if (disposed) return;
        registration = result;
        const watch = () => {
          const worker = result.installing;
          if (worker)
            listen(worker, "statechange", () => {
              preparationFailed = worker.state === "redundant";
              void check();
            });
          void check();
        };
        listen(result, "updatefound", watch);
        watch();
      })
      .catch(() => {
        if (!disposed) report({ offline: "failed", updateReady: false });
      });
  void register();
  return {
    check,
    async retry() {
      preparationFailed = false;
      // A failed first install can leave a detached registration: register anew.
      if (
        !registration ||
        (!registration.active &&
          !registration.installing &&
          !registration.waiting)
      ) {
        await register();
        return;
      }
      try {
        await registration.update();
      } catch {
        preparationFailed = true;
      }
      await check();
    },
    dispose() {
      disposed = true;
      sequence++;
      cleanups.forEach((cleanup) => cleanup());
    },
  };
}
