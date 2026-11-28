/* Cloudflare Pages Functions：/api/vision
   漫画/图片里的文字识别 + 翻译，走智谱 GLM-4V（手写体也能认）。
   与 worker/index.js 里的 /api/vision 保持同一套行为。 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-key",
  "Content-Type": "application/json; charset=utf-8"
};
function json(obj, status = 200){ return new Response(JSON.stringify(obj), { status, headers: CORS }); }

export async function onRequestOptions(){ return new Response(null, { status: 204, headers: CORS }); }

export async function onRequestPost({ request, env }){
  const hdr = request.headers.get("x-user-key") || "";
  const auth = request.headers.get("authorization") || "";
  const userKey = (hdr || (/^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, "") : "")).trim();
  const key = (env.ZHIPU_API_KEY || userKey || "").trim();
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
    return json({ ok: true, configured: true, text, orig: mo ? mo[1].trim() : "", trans: mt ? mt[1].trim() : "" });
  }catch(e){
    return json({ ok: false, configured: true, message: e.message || String(e) });
  }
}
