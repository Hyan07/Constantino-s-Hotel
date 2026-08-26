const clients = new Set();
const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
let eventSequence = 0;

function resourceScope(originalUrl = "") {
  const pathname = String(originalUrl).split("?")[0].replace(/^\/api\/?/, "");
  return pathname.split("/").filter(Boolean)[0] || "system";
}

function eventMessage(event, payload, id = null) {
  return `${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function removeClient(client) {
  if (!clients.has(client)) return;
  clients.delete(client);
  globalThis.clearInterval(client.heartbeat);
}

export function realtimeEvents(req, res) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const client = {
    res,
    heartbeat: null,
  };

  clients.add(client);
  res.write("retry: 3000\n\n");
  res.write(eventMessage("ready", { connected: true, at: new Date().toISOString() }));

  client.heartbeat = globalThis.setInterval(() => {
    if (res.destroyed || res.writableEnded) {
      removeClient(client);
      return;
    }
    res.write(`: keep-alive ${Date.now()}\n\n`);
  }, 25_000);
  client.heartbeat.unref?.();

  const cleanup = () => removeClient(client);
  req.on("close", cleanup);
  res.on("close", cleanup);
  res.on("error", cleanup);
}

export function publishChange({ method, originalUrl, requestId } = {}) {
  if (!clients.size) return;

  const id = ++eventSequence;
  const payload = {
    id,
    scope: resourceScope(originalUrl),
    method: String(method || "UPDATE").toUpperCase(),
    at: new Date().toISOString(),
    requestId: requestId || null,
  };
  const message = eventMessage("change", payload, id);

  for (const client of [...clients]) {
    const { res } = client;
    if (res.destroyed || res.writableEnded) {
      removeClient(client);
      continue;
    }
    try {
      res.write(message);
    } catch {
      removeClient(client);
    }
  }
}

export function publishSuccessfulMutation(req, res, next) {
  const method = String(req.method || "").toUpperCase();
  if (!mutationMethods.has(method)) return next();

  res.once("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    publishChange({
      method,
      originalUrl: req.originalUrl,
      requestId: req.requestId,
    });
  });

  return next();
}
