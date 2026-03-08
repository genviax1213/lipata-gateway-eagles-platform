const CHUNK_RECOVERY_KEY = "lgec:chunk-recovery-attempted";

function isChunkLoadFailure(reason: unknown): boolean {
  if (reason instanceof Error) {
    const message = `${reason.name} ${reason.message}`.toLowerCase();
    return (
      message.includes("failed to fetch dynamically imported module") ||
      message.includes("importing a module script failed") ||
      message.includes("chunkloaderror") ||
      message.includes("loading chunk")
    );
  }

  if (typeof reason === "string") {
    const message = reason.toLowerCase();
    return (
      message.includes("failed to fetch dynamically imported module") ||
      message.includes("chunkloaderror") ||
      message.includes("loading chunk")
    );
  }

  return false;
}

function reloadOnce() {
  if (window.sessionStorage.getItem(CHUNK_RECOVERY_KEY) === "1") {
    return;
  }

  window.sessionStorage.setItem(CHUNK_RECOVERY_KEY, "1");
  window.location.reload();
}

export function installChunkRecovery() {
  window.addEventListener("error", (event) => {
    if (isChunkLoadFailure(event.error ?? event.message)) {
      reloadOnce();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadFailure(event.reason)) {
      reloadOnce();
    }
  });

  window.addEventListener("pageshow", () => {
    window.sessionStorage.removeItem(CHUNK_RECOVERY_KEY);
  });
}
