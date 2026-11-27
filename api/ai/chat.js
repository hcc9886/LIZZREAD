/* Vercel Serverless Function: POST /api/ai/chat
   Key 只从服务端环境变量读取，前端拿不到。 */
module.exports = async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if(req.method === 'OPTIONS'){ res.status(204).end(); return; }
  if(req.method !== 'POST'){ res.status(405).json({ ok:false, message:'只支持 POST' }); return; }

  const key = process.env.ZHIPU_API_KEY || '';
  if(!key){ res.status(200).json({ ok:false, configured:false, message:'服务端未配置 ZHIPU_API_KEY' }); return; }

  const j = req.body || {};
  const messages = Array.isArray(j.messages) ? j.messages.slice(-12) : [];
  if(!messages.length){ res.status(200).json({ ok:false, configured:true, message:'messages 为空' }); return; }

  try{
    const r = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: j.model || 'glm-4-flash',
        messages,
        temperature: typeof j.temperature === 'number' ? j.temperature : 0.7,
        max_tokens: Math.min(Number(j.max_tokens) || 800, 2000)
      })
    });
    const t = await r.text();
    let out = null; try{ out = JSON.parse(t); }catch(e){}
    if(!r.ok){
      res.status(200).json({ ok:false, configured:true, message:(out && out.error && out.error.message) || ('HTTP ' + r.status) });
      return;
    }
    const text = out && out.choices && out.choices[0] && out.choices[0].message ? out.choices[0].message.content : '';
    res.status(200).json({ ok:true, configured:true, text, usage:(out && out.usage) || null });
  }catch(e){
    res.status(200).json({ ok:false, configured:true, message: e.message || String(e) });
  }
};
