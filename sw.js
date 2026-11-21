/* LIZZREAD Service Worker — 离线缓存
   策略：
   - index.html / dict.js / manifest.json / icon.svg → 安装时预缓存（基础壳）
   - books/pg*.txt → cache-first（用户打开哪本就永久缓存，超 100MB 自动淘汰最久没读的）
   - 远程 PG 正文 → 走 IndexedDB（idbPut/idbGet）
   - 外部 API（词典、MyMemory）→ 网络优先
*/
const CACHE = "lizzread_v5";
const PRECACHE = [
  "./",
  "./index.html",
  "./dict.js?v=5",
  "./manifest.json",
  "./icon.svg",
];
const MAX_CACHE_BYTES = 100 * 1024 * 1024;  // 100MB 上限

async function getCacheSize(cache){
  let total = 0;
  const reqs = await cache.keys();
  for(const r of reqs){
    const res = await cache.match(r);
    if(res && res.headers){
      const cl = res.headers.get("content-length");
      if(cl) total += Number(cl);
      else { /* 估算 */ total += (res.clone().body ? 10240 : 0); }
    }
  }
  return total;
}
async function gcCache(cache){
  let size = await getCacheSize(cache);
  if(size < MAX_CACHE_BYTES * 0.9) return;
  /* 按 URL 里的页码排序（pg 小的先删） */
  const reqs = await cache.keys();
  /* 简单粗暴：删前一半 */
  const half = Math.floor(reqs.length / 2);
  for(let i=0;i<half;i++){
    await cache.delete(reqs[i]);
  }
}

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
  if(u.origin !== self.location.origin || e.request.method !== "GET") return;

  /* dict.js — cache-first（版本化，v5+） */
  if(u.pathname.endsWith("dict.js")){
    e.respondWith(
      caches.match(e.request).then(r=> r || fetch(e.request).then(res=>{
        const cp = res.clone(); caches.open(CACHE).then(c=> c.put(e.request, cp));
        return res;
      }).catch(()=> caches.match("./dict.js?v=5")))
    ); return;
  }

  /* books/pg*.txt — cache-first + 自动 GC */
  if(u.pathname.includes("/books/pg")){
    e.respondWith(
      caches.match(e.request).then(r=> {
        if(r) return r;
        return fetch(e.request).then(res=>{
          const cp = res.clone();
          caches.open(CACHE).then(c=>{ c.put(e.request, cp); gcCache(c); });
          return res;
        });
      })
    ); return;
  }

  /* index.html — network-first */
  if(u.pathname.endsWith("index.html") || u.pathname === "./" || u.pathname === "/"){
    e.respondWith(
      fetch(e.request).then(res=>{
        const cp = res.clone(); caches.open(CACHE).then(c=> c.put(e.request, cp));
        return res;
      }).catch(()=> caches.match(e.request).then(r=> r || caches.match("./index.html")))
    ); return;
  }

  /* 其它同源静态 — cache-first */
  e.respondWith(
    caches.match(e.request).then(r=> r || fetch(e.request).then(res=>{
      if(res && res.status === 200){
        const cp = res.clone(); caches.open(CACHE).then(c=> c.put(e.request, cp));
      }
      return res;
    }))
  );
});
