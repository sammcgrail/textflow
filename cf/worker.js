// sebland-textflow: runs ONLY for requests that match no static asset and are not
// navigations (fetch/img/script misses). Everything else is served
// straight from the asset layer. Reproduces the nginx.conf rules a static host cannot:
//  - try_files $uri =404 on content paths (a missing file must 404, not answer the HTML shell)
const STRICT = new RegExp("^(/textflow)?/assets/", "");
const EMPTY200 = null;
const QD = false;
// cache rules from cf/_headers, re-applied to responses this script builds
const CACHE = [["^/assets/", "public, max-age=31536000, immutable"], ["^/static/", "public, max-age=31536000, immutable"], ["^/textflow/assets/", "public, max-age=31536000, immutable"], ["^/textflow/static/", "public, max-age=31536000, immutable"]].map(([re, v]) => [new RegExp(re), v]);
const cacheFor = (p) => (CACHE.find(([re]) => re.test(p)) || [])[1];
const SEC = {"X-Content-Type-Options": "nosniff", "X-Frame-Options": "SAMEORIGIN", "Referrer-Policy": "strict-origin-when-cross-origin", "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload", "X-Served-By": "cf-worker"};

function finish(res, extra = {}) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries({ ...SEC, ...extra })) r.headers.set(k, v);
  return r;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    // Workers static assets ignore Range (always 200, no Accept-Ranges); iMessage/Discord video
    // previews need 206. Serve /static/videos/* with byte-range support (files are a few MB).
    if ((req.method === "GET" || req.method === "HEAD") && /^(\/textflow)?\/static\/videos\/[^/]+\.(mp4|webm|mov)$/.test(url.pathname)) {
      const a = await env.ASSETS.fetch(new Request(url, { method: "GET" }));
      const ct = a.headers.get("content-type") || "";
      if (a.status !== 200 || !ct.startsWith("video/")) return finish(new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } }));
      const buf = await a.arrayBuffer();
      const size = buf.byteLength;
      const h = { "Content-Type": ct, "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=31536000, immutable" };
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
      if (m && (m[1] || m[2])) {
        let start, end;
        if (m[1] === "") { start = Math.max(0, size - Number(m[2])); end = size - 1; }
        else { start = Number(m[1]); end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1); }
        if (start >= size || start > end) return finish(new Response(null, { status: 416, headers: { ...h, "Content-Range": `bytes */${size}` } }));
        return finish(new Response(req.method === "HEAD" ? null : buf.slice(start, end + 1), { status: 206, headers: { ...h, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } }));
      }
      return finish(new Response(req.method === "HEAD" ? null : buf, { status: 200, headers: { ...h, "Content-Length": String(size) } }));
    }
    // images next to the videos (poster jpg, share gif): run_worker_first would otherwise
    // fall through to the SPA shell below, so hand them straight to the asset layer
    if ((req.method === "GET" || req.method === "HEAD") && /^(\/textflow)?\/static\/videos\/[^/]+\.(gif|jpg|jpeg|png|webp)$/.test(url.pathname)) {
      const a = await env.ASSETS.fetch(req);
      if (a.status !== 200 || !(a.headers.get("content-type") || "").startsWith("image/")) return finish(new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } }));
      return finish(a, { "Cache-Control": "public, max-age=31536000, immutable" });
    }
    if (QD && url.pathname === "/") {
      const d = url.searchParams.get("d");
      if (d && /^[A-Za-z0-9_-]+$/.test(d)) {
        const r = await env.ASSETS.fetch(new Request(new URL(`/d/${d}/`, url), req));
        if (r.status === 200) return finish(r, { "Cache-Control": "no-cache" });
      }
      return finish(await env.ASSETS.fetch(req), { "Cache-Control": "no-cache" });
    }
    if (QD && STRICT && STRICT.test(url.pathname)) {
      // run_worker_first path: the asset may exist; only a miss (the SPA shell) becomes a 404
      const r = await env.ASSETS.fetch(req);
      const ct = r.headers.get("content-type") || "";
      if (!(r.status === 200 && ct.startsWith("text/html") && !/\.html?$/.test(url.pathname))) {
        const cc = cacheFor(url.pathname);
        return finish(r, cc && r.status === 200 ? { "Cache-Control": cc } : {});
      }
      return finish(new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } }));
    }
    if (EMPTY200 && EMPTY200.test(url.pathname))
      return finish(new Response("", { status: 200, headers: { "Content-Type": "application/octet-stream" } }), { "Cache-Control": "no-store" });
    if (STRICT && STRICT.test(url.pathname))
      return finish(new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } }));
    // icon probes under a mode path (/<mode>/favicon.ico, /<mode>/apple-touch-icon.png) get the
    // root icon, never the HTML shell (an HTML favicon keeps iOS Safari's progress bar spinning)
    const icon = url.pathname.match(/\/(favicon\.(?:ico|png)|apple-touch-icon(?:-precomposed)?\.png)$/);
    if (icon) {
      const r = await env.ASSETS.fetch(new Request(new URL("/" + icon[1], url), req));
      if (r.status === 200 && (r.headers.get("content-type") || "").startsWith("image/"))
        return finish(r, { "Cache-Control": "public, max-age=86400" });
    }
    // nginx: try_files $uri $uri/ /index.html
    return finish(await env.ASSETS.fetch(new Request(new URL("/", url), req)), { "Cache-Control": "no-cache" });
  },
};
