/* Cloudflare Pages Function: POST /api/ai/chat
   路径由文件位置决定：functions/api/ai/chat.js → /api/ai/chat
   Key 只从环境变量 ZHIPU_API_KEY 读取（Pages 后台配置），前端拿不到。 */
export async function onRequestPost(context){
  const { request, env } = context;
  const hdr = request.headers.get("x-user-key") || "";
  const auth = request.headers.get("authorization") || "";
  const userKey = (hdr || (/^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, "") : "")).trim();
  const key = (env.ZHIPU_API_KEY || userKey || "").trim();
  if(!key){
    return json({ ok:false, configured:false, message:"服务端未配置 ZHIPU_API_KEY，也没有用户 Key" });
  }
  let body = {};
  try{ body = await request.json(); }catch(e){ body = {}; }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  if(!messages.length){
    return json({ ok:false, configured:true, message:"messages 为空" });
  }
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
    let out = null;
    try{ out = JSON.parse(t); }catch(e){ out = null; }
    if(!r.ok){
      return json({ ok:false, configured:true, message:(out && out.error && out.error.message) || ("HTTP " + r.status) });
    }
    const text = out && out.choices && out.choices[0] && out.choices[0].message ? out.choices[0].message.content : "";
    return json({ ok:true, configured:true, text, usage:(out && out.usage) || null });
  }catch(e){
    return json({ ok:false, configured:true, message: e.message || String(e) });
  }
}

export async function onRequestOptions(){
  return new Response(null, { status: 204, headers: cors() });
}

function cors(){
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

function json(obj){
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: Object.assign(
      { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      cors()
    )
  });
}
