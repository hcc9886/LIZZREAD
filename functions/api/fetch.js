/* Cloudflare Pages Functions：/api/fetch 通用网页抓取代理
   外刊头条、RSS、整篇正文都走这里，避免依赖 r.jina.ai / allorigins（慢且常失败）。 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-key",
  "Content-Type": "application/json; charset=utf-8"
};
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

export async function onRequestOptions(){ return new Response(null, { status: 204, headers: CORS }); }

export async function onRequestGet({ request }){
  const target = new URL(request.url).searchParams.get("url") || "";
  if(!/^https?:\/\//i.test(target)){
    return new Response(JSON.stringify({ ok: false, message: "url 参数不对" }), { status: 400, headers: CORS });
  }
  try{
    const r = await fetch(target, {
      headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "en,zh;q=0.9" },
      redirect: "follow"
    });
    if(!r.ok){
      return new Response(JSON.stringify({ ok: false, status: r.status, message: "目标站返回 " + r.status }), { headers: CORS });
    }
    const ct = r.headers.get("content-type") || "";
    const body = await r.text();
    const isXml = /xml|rss|atom/i.test(ct) || /^\s*<\?xml|<rss|<feed/i.test(body);
    const out = isXml ? { ok: true, kind: "xml", text: body.slice(0, 800000) }
                      : { ok: true, kind: "html", html: body.slice(0, 1500000) };
    return new Response(JSON.stringify(out), { headers: CORS });
  }catch(e){
    return new Response(JSON.stringify({ ok: false, message: e.message || String(e) }), { headers: CORS });
  }
}
