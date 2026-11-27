/* Cloudflare Pages Function: GET /api/feed?url=...
   RSS 代理。只允许白名单域名，避免被当成任意代理。 */
const ALLOW = [
  "feeds.bbci.co.uk", "www.bbc.co.uk", "www.theguardian.com", "feeds.a.dj.com",
  "rss.nytimes.com", "feeds.npr.org", "www.theverge.com", "feeds.arstechnica.com",
  "hnrss.org", "www.economist.com", "feeds.feedburner.com", "www.aljazeera.com",
  "feeds.reuters.com", "www.technologyreview.com", "www.ft.com", "rss.cnn.com",
  "www.lemonde.fr", "www.spiegel.de", "www.lefigaro.fr", "elpais.com", "www.repubblica.it",
  "www.asahi.com", "www.yahoo.co.jp", "rss.hankyung.com", "www.dw.com", "rss.dw.com"
];

export async function onRequestGet(context){
  const { request } = context;
  const u = new URL(request.url);
  const target = u.searchParams.get("url") || "";
  if(!/^https?:\/\//i.test(target)){
    return json({ ok:false, message:"url 不合法" }, 400);
  }
  let host = "";
  try{ host = new URL(target).hostname; }catch(e){
    return json({ ok:false, message:"url 解析失败" }, 400);
  }
  if(!ALLOW.some(h => host === h || host.endsWith("." + h))){
    return json({ ok:false, message:"这个源不在白名单里" });
  }
  try{
    const r = await fetch(target, {
      headers: {
        "User-Agent": "LIZZREAD/2.1 (+https://github.com/hcc9886/LIZZREAD)",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"
      }
    });
    if(!r.ok) return json({ ok:false, message:"源返回 " + r.status });
    let xml = await r.text();
    if(xml.length > 3e6) xml = xml.slice(0, 3e6);
    return json({ ok:true, xml });
  }catch(e){
    return json({ ok:false, message:"抓取失败" });
  }
}

export async function onRequestOptions(){
  return new Response(null, { status: 204, headers: cors() });
}

function cors(){
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS"
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
