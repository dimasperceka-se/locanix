import http from "node:http";

// Expose only the webhook route through the development tunnel.
const upstream = process.env.WEBHOOK_UPSTREAM || "http://127.0.0.1:3001";
http.createServer((req, res) => {
  if (req.url !== "/api/paypal/webhook" || !["GET", "POST"].includes(req.method)) {
    res.writeHead(404).end();
    return;
  }
  const target = http.request(new URL(req.url, upstream), {
    method: req.method, headers: { ...req.headers, host: new URL(upstream).host },
  }, (response) => {
    res.writeHead(response.statusCode, response.headers);
    response.pipe(res);
  });
  target.setTimeout(30000, () => target.destroy());
  target.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(target);
}).listen(3002, "127.0.0.1", () => console.log("Webhook proxy listening on 127.0.0.1:3002"));
