let source = null;
let refreshTimer = null;
let fallbackTimer = null;
let pendingWhileHidden = false;
let latestChange = null;

function dispatchChange(detail) {
  window.dispatchEvent(new CustomEvent("app:data-changed", { detail }));
}

function scheduleRefresh(detail) {
  latestChange = detail;
  if (document.visibilityState === "hidden") {
    pendingWhileHidden = true;
    return;
  }

  clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    dispatchChange(latestChange || { scope: "system", source: "realtime" });
    latestChange = null;
  }, 280);
}

function stopFallback() {
  if (!fallbackTimer) return;
  window.clearInterval(fallbackTimer);
  fallbackTimer = null;
}

function startFallback() {
  if (fallbackTimer) return;
  fallbackTimer = window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    scheduleRefresh({ scope: "system", source: "fallback", at: new Date().toISOString() });
  }, 15_000);
}

export function startRealtimeSync() {
  if (source || typeof window.EventSource !== "function") {
    if (!source) startFallback();
    return;
  }

  source = new window.EventSource("/api/events");

  source.addEventListener("open", () => {
    document.documentElement.dataset.realtime = "connected";
    stopFallback();
  });

  source.addEventListener("ready", () => {
    document.documentElement.dataset.realtime = "connected";
    stopFallback();
  });

  source.addEventListener("change", (event) => {
    let detail = { scope: "system", source: "realtime" };
    try {
      detail = { ...detail, ...JSON.parse(event.data || "{}") };
    } catch {
      // Se o evento vier sem JSON valido, a atualizacao global ainda acontece.
    }
    scheduleRefresh(detail);
  });

  source.onerror = () => {
    document.documentElement.dataset.realtime = "reconnecting";
    startFallback();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !pendingWhileHidden) return;
    pendingWhileHidden = false;
    scheduleRefresh(latestChange || { scope: "system", source: "visibility" });
  });

  window.addEventListener("beforeunload", () => {
    stopFallback();
    source?.close();
    source = null;
  }, { once: true });
}
