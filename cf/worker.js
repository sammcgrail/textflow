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
    // nginx: try_files $uri $uri/ /index.html
    return finish(await env.ASSETS.fetch(new Request(new URL("/", url), req)), { "Cache-Control": "no-cache" });
  },
};
