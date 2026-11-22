/* LIZZREAD Service Worker v8 — 离线缓存
   - 基础壳：index / manifest / icon / 拼装模块 / 导入器 / 书库目录 / 句子清单 → 安装预缓存
   - 句子包 sentences/bookXXXX.json → cache-first（首次练习后离线可用；index.json 不预缓存）
   - 全文 books/pg*.txt → cache-first（打开哪本缓存哪本；超 150MB 淘汰）
   - 字体/词典 → cache-first，首次出现时缓存
   - 外部翻译/词典 API → 不缓存（译文由 IndexedDB 持久化，离线读本地译文）
*/
const CACHE = "lizzread_v20";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./data/catalog.js",
  "./data/lang-manifest.js",
  "./data/books-en.js",
  "./data/lang-zh.js",
  "./data/i18n.js",
  "./shared/assembly-core.js?v=13",
  "./shared/importers.js?v=13",
  "./reader/assembly-panel.js?v=13",
  "./vendor/jszip.min.js",
  "./sentences/books.json?v=2",
];
const MAX_CACHE_BYTES = 150 * 1024 * 1024;

async function getCacheSize(cache){
  let total = 0;
  const reqs = await cache.keys();
  for(const r of reqs){
    const res = await cache.match(r);
    if(res && res.headers){
      const cl = res.headers.get("content-length");
      if(cl) total += Number(cl);
      else total += 12288;
    }
  }
  return total;
}
async function gcCache(cache){
  const size = await getCacheSize(cache);
  if(size < MAX_CACHE_BYTES * 0.9) return;
  const reqs = await cache.keys();
  /* 只淘汰全文/句子包，保留基础壳 */
  const victims = reqs.filter(r => /\/books\/pg|\/sentences\/book/.test(r.url));
  const half = Math.floor(victims.length / 2);
  for(let i=0;i<half;i++) await cache.delete(victims[i]);
}

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(()=>{})));
});

self.addEventListener("activate", e => {
  self.clients.claim();
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))
  )));
});

self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if(u.origin !== self.location.origin || e.request.method !== "GET") return;

  const put = (req, res) => {
    if(!res || res.status !== 200) return;
    const cp = res.clone();
    caches.open(CACHE).then(c => { c.put(req, cp); gcCache(c); }).catch(()=>{});
  };

  /* 页面：network-first，离线回退缓存 */
  if(u.pathname === "/" || u.pathname.endsWith("index.html")){
    e.respondWith(
      fetch(e.request).then(res => { put(e.request, res.clone()); return res; })
        .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  /* 句子包 / 全文 / 词典 / 书库目录 / 导入器 / 拼装模块 → cache-first */
  if(/\/sentences\/|\/books\/|\/data\/|\/shared\/|\/reader\/|\/vendor\/|dict\.js/.test(u.pathname)){
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(res => { put(e.request, res.clone()); return res; }))
    );
    return;
  }

  /* 其它同源静态：cache-first */
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => { put(e.request, res.clone()); return res; }))
  );
});
