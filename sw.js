/* LIZZREAD Service Worker — 离线缓存
   策略：
   - index.html / dict.js / manifest.json / icon.svg → 安装时预缓存（基础壳）
   - books/pg*.txt → 首次访问时 cache-first（离线必读）
   - 远程 PG 正文 → 已存在 IndexedDB（不走 SW，主逻辑在 idbPut/idbGet）
   - 其它外部请求（词典 API、MyMemory）→ 网络优先
*/
const CACHE = "lizzread_v3";
const PRECACHE = [
  "./",
  "./index.html",
  "./dict.js?v=4",
  "./manifest.json",
  "./icon.svg",
];

self.addEventListener("install", e=>{
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c=> c.addAll(PRECACHE).catch(()=>{}))
  );
});

self.addEventListener("activate", e=>{
  self.clients.claim();
  e.waitUntil(
    caches.keys().then(keys=>
      Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", e=>{
  const u = new URL(e.request.url);
  /* 只拦截同源 GET */
  if(u.origin !== self.location.origin || e.request.method !== "GET") return;

  /* dict.js?v=4 — 版本化，cache-first */
  if(u.pathname.endsWith("dict.js")){
    e.respondWith(
      caches.match(e.request).then(r=> r || fetch(e.request).then(res=>{
        const cp = res.clone();
        caches.open(CACHE).then(c=> c.put(e.request, cp));
        return res;
      }).catch(()=> caches.match("./dict.js?v=4")))
    );
    return;
  }

  /* books/pg*.txt — cache-first + 缓存失败降级 */
  if(u.pathname.includes("/books/pg")){
    e.respondWith(
      caches.match(e.request).then(r=> r || fetch(e.request).then(res=>{
        const cp = res.clone();
        caches.open(CACHE).then(c=> c.put(e.request, cp));
        return res;
      }).catch(()=> caches.match("./index.html")))
    );
    return;
  }

  /* index.html 等基础壳 — network-first（每次打开拿最新） */
  if(u.pathname.endsWith("index.html") || u.pathname === "./" || u.pathname === "/"){
    e.respondWith(
      fetch(e.request).then(res=>{
        const cp = res.clone();
        caches.open(CACHE).then(c=> c.put(e.request, cp));
        return res;
      }).catch(()=> caches.match(e.request).then(r=> r || caches.match("./index.html")))
    );
    return;
  }

  /* 其它同源静态资源 — cache-first */
  e.respondWith(
    caches.match(e.request).then(r=> r || fetch(e.request).then(res=>{
      if(res && res.status === 200){
        const cp = res.clone();
        caches.open(CACHE).then(c=> c.put(e.request, cp));
      }
      return res;
    }))
  );
});
