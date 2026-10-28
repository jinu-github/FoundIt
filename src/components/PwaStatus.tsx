import { useEffect, useRef, useState } from "react";
import { observePwa, type PwaState } from "../lib/pwa";

export default function PwaStatus() {
  const [state, setState] = useState<PwaState>({
    offline: "preparing",
    updateReady: false,
  });
  const monitor = useRef<ReturnType<typeof observePwa> | undefined>(undefined);
  useEffect(() => {
    if (
      !import.meta.env.PROD ||
      !("serviceWorker" in navigator) ||
      !("caches" in window)
    )
      return;
    const observer = observePwa(
      navigator.serviceWorker,
      caches,
      location.origin,
      __PWA_BUILD_ID__,
      setState,
    );
    monitor.current = observer;
    const check = () => {
      void observer.check();
    };
    window.addEventListener("focus", check);
    return () => {
      observer.dispose();
      window.removeEventListener("focus", check);
    };
  }, []);
  if (!import.meta.env.PROD) return null;
  const supported = "serviceWorker" in navigator && "caches" in window;
  return (
    <aside aria-label="Offline availability" className="pwa-status">
      <span role="status">
        {!supported
          ? "Offline mode is unavailable in this browser."
          : {
              preparing:
                "Preparing offline files… Keep the local server running.",
              ready: "Offline files verified. Keep exporting library backups.",
              reopen:
                "Offline files prepared. Save your work, then reopen FoundIt to verify offline readiness.",
              failed:
                "Offline preparation could not be verified. Keep the local server running and check again. Storage may be full or files unavailable.",
            }[state.offline]}
      </span>
      {supported && (
        <button
          type="button"
          onClick={() => {
            void monitor.current?.retry();
          }}
        >
          Check offline files
        </button>
      )}
      {state.preparationFailed && (
        <p role="status">
          Could not prepare or check an update. A failed update does not replace
          the current version. Start the local server, check available storage,
          and try again.
        </p>
      )}
      {state.updateReady && (
        <p role="status">
          Update ready. Save edits and finish backup/restore, then close every
          FoundIt tab and window and reopen. Nothing will reload automatically.
        </p>
      )}
    </aside>
  );
}
