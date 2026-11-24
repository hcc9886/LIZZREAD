'use strict';
/**
 * LIZZREAD 支付模块（无第三方依赖）
 * 支持：支付宝手机/电脑网站支付、微信支付 Native(扫码)/H5(手机浏览器)
 * 未配置商户号时进入「演示模式」：下单返回 demo 链接，便于本地联调。
 *
 * 环境变量：
 *   ALIPAY_APP_ID / ALIPAY_PRIVATE_KEY / ALIPAY_PUBLIC_KEY
 *   WXPAY_MCHID / WXPAY_APPID / WXPAY_API_V3_KEY / WXPAY_SERIAL / WXPAY_PRIVATE_KEY
 *   PAY_BASE_URL   （站点对外地址，如 https://read.example.com）
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

/* ---------- 价格表（与前端一致） ---------- */
const PLANS = {
  lang:        { name: '单语言会员 · 月', fen: 2200,  days: 31,  scope: 'one' },
  all_month:   { name: '全语言 · 月',     fen: 4800,  days: 31,  scope: 'all' },
  all_quarter: { name: '全语言 · 季',     fen: 10800, days: 93,  scope: 'all' },
  all_year:    { name: '全语言 · 年',     fen: 32800, days: 366, scope: 'all' }
};

/* ---------- 订单存储 ---------- */
function readOrders(){
  try{ return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')) || {}; }catch(e){ return {}; }
}
function writeOrders(o){
  try{
    if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, {recursive:true});
    const tmp = ORDERS_FILE + '.part';
    fs.writeFileSync(tmp, JSON.stringify(o, null, 2));
    fs.renameSync(tmp, ORDERS_FILE);
  }catch(e){}
}
function newOrderId(){
  const d = new Date();
  const ymd = d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
  return 'LZ' + ymd + crypto.randomBytes(4).toString('hex').toUpperCase();
}
function createOrder({ plan, channel, lang, device }){
  const def = PLANS[plan];
  if(!def) throw new Error('未知套餐');
  const id = newOrderId();
  const order = {
    id, plan, channel, fen: def.fen, days: def.days, scope: def.scope,
    lang: def.scope === 'one' ? (lang || 'en') : '',
    device: String(device || '').slice(0, 64),
    status: 'pending', at: Date.now(), paidAt: 0, txn: ''
  };
  const all = readOrders();
  all[id] = order;
  writeOrders(all);
  return order;
}
function markPaid(id, txn){
  const all = readOrders();
  const o = all[id];
  if(!o) return null;
  if(o.status !== 'paid'){ o.status = 'paid'; o.paidAt = Date.now(); o.txn = String(txn || ''); writeOrders(all); }
  return o;
}
function getOrder(id){ return readOrders()[id] || null; }

/* ---------- 支付宝 ---------- */
function alipayConfigured(){
  return !!(process.env.ALIPAY_APP_ID && process.env.ALIPAY_PRIVATE_KEY && process.env.ALIPAY_PUBLIC_KEY);
}
function alipaySign(params, privateKey){
  const keys = Object.keys(params).filter(k => params[k] !== '' && params[k] != null).sort();
  const content = keys.map(k => `${k}=${params[k]}`).join('&');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(content, 'utf8');
  return signer.sign(privateKey, 'base64');
}
function alipayVerify(params, publicKey){
  const sign = params.sign;
  if(!sign) return false;
  const rest = Object.assign({}, params);
  delete rest.sign;
  delete rest.sign_type;
  const keys = Object.keys(rest).filter(k => rest[k] !== '' && rest[k] != null).sort();
  const content = keys.map(k => `${k}=${rest[k]}`).join('&');
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(content, 'utf8');
  try{ return verifier.verify(publicKey, sign, 'base64'); }catch(e){ return false; }
}
function alipayPagePay(order, baseUrl){
  const params = {
    app_id: process.env.ALIPAY_APP_ID,
    method: 'alipay.trade.wap.pay',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: new Date().toISOString().replace('T',' ').slice(0,19),
    version: '1.0',
    notify_url: baseUrl + '/api/pay/notify/alipay',
    return_url: baseUrl + '/index.html?paid=' + order.id,
    biz_content: JSON.stringify({
      out_trade_no: order.id,
      total_amount: (order.fen / 100).toFixed(2),
      subject: 'LIZZREAD ' + PLANS[order.plan].name,
      product_code: 'QUICK_WAP_WAY'
    })
  };
  params.sign = alipaySign(params, process.env.ALIPAY_PRIVATE_KEY);
  const qs = Object.keys(params).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
  return 'https://openapi.alipay.com/gateway.do?' + qs;
}

/* ---------- 微信支付 ---------- */
function wxpayConfigured(){
  return !!(process.env.WXPAY_MCHID && process.env.WXPAY_API_V3_KEY && process.env.WXPAY_SERIAL && process.env.WXPAY_PRIVATE_KEY);
}
function wxpaySign(method, urlPath, body){
  const mchid = process.env.WXPAY_MCHID;
  const ts = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');
  const msg = `${method}\n${urlPath}\n${ts}\n${nonce}\n${body}\n`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(msg, 'utf8');
  const sign = signer.sign(process.env.WXPAY_PRIVATE_KEY, 'base64');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",timestamp="${ts}",serial_no="${process.env.WXPAY_SERIAL}",signature="${sign}"`;
}
function wxpayDecrypt(resource){
  const key = Buffer.from(process.env.WXPAY_API_V3_KEY, 'utf8');
  const data = Buffer.from(resource.ciphertext, 'base64');
  const authTag = data.slice(data.length - 16);
  const enc = data.slice(0, data.length - 16);
  const nonce = Buffer.from(resource.nonce, 'utf8');
  const associated = Buffer.from(resource.associated_data || '', 'utf8');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(authTag);
  if(associated.length) decipher.setAAD(associated);
  return JSON.parse(Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8'));
}
async function wxpayCreateNative(order, baseUrl){
  const body = JSON.stringify({
    appid: process.env.WXPAY_APPID,
    mchid: process.env.WXPAY_MCHID,
    description: 'LIZZREAD ' + PLANS[order.plan].name,
    out_trade_no: order.id,
    notify_url: baseUrl + '/api/pay/notify/wechat',
    amount: { total: order.fen, currency: 'CNY' }
  });
  const urlPath = '/v3/pay/transactions/native';
  const auth = wxpaySign('POST', urlPath, body);
  const r = await fetch('https://api.mch.weixin.qq.com' + urlPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': auth, 'User-Agent': 'LIZZREAD/2.0' },
    body
  });
  const j = await r.json();
  if(!r.ok) throw new Error('微信下单失败：' + (j.message || r.status));
  return j.code_url;
}

module.exports = {
  PLANS, createOrder, getOrder, markPaid,
  alipayConfigured, alipayVerify, alipayPagePay,
  wxpayConfigured, wxpayCreateNative, wxpayDecrypt
};
