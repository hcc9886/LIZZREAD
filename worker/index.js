/* Cloudflare Worker（Static Assets 模式）入口
   作用：/api/* 走后端代理，其余请求交给静态资源。
   对应 wrangler.jsonc 里的 assets.directory = ./dist-pages */
export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url);

    /* ---- AI 代理 ---- */
    if(url.pathname === "/api/ai/chat"){
      if(request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
      if(request.method !== "POST") return json({ ok: false, message: "只支持 POST" }, 405);
      /* Key 来源（按优先级）：
         ① 服务端环境变量 ZHIPU_API_KEY（推荐，用户无感）
         ② 请求头 x-user-key / Authorization —— 用户在站内自己填的 Key
         这样即使没配环境变量，用户也能在「设置 → AI 能力」里填自己的 Key 直接用 */
      const hdr = request.headers.get("x-user-key") || "";
      const auth = request.headers.get("authorization") || "";
      const userKey = (hdr || (/^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, "") : "")).trim();
      const key = (env.ZHIPU_API_KEY || userKey || "").trim();
      if(!key) return json({ ok: false, configured: false, message: "服务端未配置 ZHIPU_API_KEY，也没有用户 Key" });
      let body = {};
      try{ body = await request.json(); }catch(e){ body = {}; }
      const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
      if(!messages.length) return json({ ok: false, configured: true, message: "messages 为空" });
      try{
        const r = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
          method: "POST",
          headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: body.model || "glm-4-flash",
            messages,
            temperature: typeof body.temperature === "number" ? body.temperature : 0.7,
            max_tokens: Math.min(Number(body.max_tokens) || 800, 2000)
          })
        });
        const t = await r.text();
        let out = null; try{ out = JSON.parse(t); }catch(e){}
        if(!r.ok) return json({ ok: false, configured: true, message: (out && out.error && out.error.message) || ("HTTP " + r.status) });
        const text = out && out.choices && out.choices[0] && out.choices[0].message ? out.choices[0].message.content : "";
        return json({ ok: true, configured: true, text, usage: (out && out.usage) || null });
      }catch(e){
        return json({ ok: false, configured: true, message: e.message || String(e) });
      }
    }

    /* ---- RSS 代理（域名白名单） ---- */
    if(url.pathname === "/api/feed"){
      const ALLOW = ["feeds.bbci.co.uk", "www.bbc.co.uk", "www.theguardian.com", "feeds.a.dj.com",
        "rss.nytimes.com", "feeds.npr.org", "www.theverge.com", "feeds.arstechnica.com", "hnrss.org",
        "www.economist.com", "feeds.feedburner.com", "www.aljazeera.com", "feeds.reuters.com",
        "www.technologyreview.com", "www.ft.com", "rss.cnn.com", "www.lemonde.fr", "www.spiegel.de",
        "www.lefigaro.fr", "elpais.com", "www.repubblica.it", "www.asahi.com", "www.yahoo.co.jp",
        "rss.hankyung.com", "www.dw.com", "rss.dw.com"];
      const target = url.searchParams.get("url") || "";
      if(!/^https?:\/\//i.test(target)) return json({ ok: false, message: "url 不合法" }, 400);
      let host = "";
      try{ host = new URL(target).hostname; }catch(e){ return json({ ok: false, message: "url 解析失败" }, 400); }
      if(!ALLOW.some(h => host === h || host.endsWith("." + h))) return json({ ok: false, message: "这个源不在白名单里" });
      try{
        const r = await fetch(target, { headers: {
          "User-Agent": "LIZZREAD/2.1 (+https://github.com/hcc9886/LIZZREAD)",
          "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" } });
        if(!r.ok) return json({ ok: false, message: "源返回 " + r.status });
        let xml = await r.text();
        if(xml.length > 3e6) xml = xml.slice(0, 3e6);
        return json({ ok: true, xml });
      }catch(e){ return json({ ok: false, message: "抓取失败" }); }
    }

    /* ---- 其余：静态资源 ---- */
    const res = await env.ASSETS.fetch(request);
    /* SPA 兜底：找不到的路径回 index.html */
    if(res.status === 404 && !url.pathname.startsWith("/api/")){
      return env.ASSETS.fetch(new Request(new URL("/index.html", url).toString(), request));
    }
    return res;
  }
};

function cors(){
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-key",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
  };
}

function json(obj, status = 200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign(
      { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      cors()
    )
  });
}
