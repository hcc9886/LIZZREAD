/* Cloudflare Worker（Static Assets 模式）入口
   作用：/api/* 走后端代理，其余请求交给静态资源。
   对应 wrangler.jsonc 里的 assets.directory = ./dist-pages */
export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url);

    /* ---- 语音识别（视频没字幕时自动生成）：Cloudflare Workers AI Whisper ---- */
    if(url.pathname === "/api/asr"){
      if(request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
      if(request.method !== "POST") return json({ ok: false, message: "只支持 POST" }, 405);
      if(!env.AI) return json({ ok: false, configured: false, message: "Worker 没有绑定 AI" });
      let body = {};
      try{ body = await request.json(); }catch(e){ body = {}; }
      const audioB64 = String(body.audio || "");
      if(!audioB64) return json({ ok: false, message: "缺少 audio（base64）" });
      const lang = String(body.language || "en").slice(0, 5);
      try{
        /* Whisper 优先接受 base64 字符串；如果失败再退回 int 数组 */
        let out = null, lastErr = null;
        try{
          out = await env.AI.run("@cf/openai/whisper", { audio: audioB64, language: lang, task: "transcribe" });
        }catch(e1){ lastErr = e1; }
        if(!out || !out.text){
          try{
            const bin = Uint8Array.from(atob(audioB64), c => c.charCodeAt(0));
            out = await env.AI.run("@cf/openai/whisper", { audio: Array.from(bin), language: lang, task: "transcribe" });
          }catch(e2){ lastErr = e2; }
        }
        if(!out) throw lastErr || new Error("识别失败");
        return json({ ok: true, configured: true,
          text: (out && out.text) || "",
          segments: (out && out.segments) || null,
          word_count: (out && out.word_count) || null });
      }catch(e){
        return json({ ok: false, configured: true, message: e.message || String(e) });
      }
    }

    /* ---- 视觉识别（漫画/图片里的字）：用 GLM-4V，手写体也能认 ---- */
    if(url.pathname === "/api/vision"){
      if(request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
      if(request.method !== "POST") return json({ ok: false, message: "只支持 POST" }, 405);
      const hdr = request.headers.get("x-user-key") || "";
      const key = (env.ZHIPU_API_KEY || hdr || "").trim();
      if(!key) return json({ ok: false, configured: false, message: "服务端未配置 ZHIPU_API_KEY" });
      let body = {};
      try{ body = await request.json(); }catch(e){ body = {}; }
      const img = String(body.image || "");
      if(!img.startsWith("data:image/")) return json({ ok: false, message: "image 需要是 data:image/... 格式" });
      const target = String(body.target || "中文").slice(0, 20);
      try{
        const r = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
          method: "POST",
          headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: body.model || "glm-4v-flash",
            messages: [{
              role: "user",
              content: [
                { type: "image_url", image_url: { url: img } },
                { type: "text", text:
                  "这是一张漫画/图片的局部截图。请只做两件事，严格按下面格式输出，不要多余的话：\n" +
                  "原文：<把图里的文字原样转写出来；如果没有任何文字就写 无>\n" +
                  "译文：<把上面的原文翻译成" + target + "；如果是 无 就写 无>" }
              ]
            }],
            temperature: 0.1,
            max_tokens: 500
          })
        });
        const t = await r.text();
        let out = null; try{ out = JSON.parse(t); }catch(e){}
        if(!r.ok) return json({ ok: false, configured: true, message: (out && out.error && out.error.message) || ("HTTP " + r.status) });
        const text = out && out.choices && out.choices[0] && out.choices[0].message ? out.choices[0].message.content : "";
        const mo = text.match(/原文[：:]\s*([\s\S]*?)(?:\n\s*译文|$)/);
        const mt = text.match(/译文[：:]\s*([\s\S]*)$/);
        return json({ ok: true, configured: true,
          text: text,
          orig: mo ? mo[1].trim() : "",
          trans: mt ? mt[1].trim() : "" });
      }catch(e){
        return json({ ok: false, configured: true, message: e.message || String(e) });
      }
    }

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
