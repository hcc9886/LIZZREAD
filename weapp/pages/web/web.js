const app = getApp();

Page({
  data: {
    url: '',
    lang: 'en',
    loaded: false,
    failed: false
  },

  onLoad(options){
    options = options || {};
    // 支持从小程序码 / 分享卡片带语言参数进来
    const lang = options.lang || wx.getStorageSync('lz_lang') || 'en';
    this.setData({ lang });
    this._opts = options;
    this.buildUrl(lang, options);
  },

  // 拼接网址：?lang=xx&wx=1&from=miniprogram
  buildUrl(lang, options){
    const base = (app.globalData.SITE || '').replace(/\/+$/, '');
    const qs = ['lang=' + encodeURIComponent(lang), 'wx=1', 'from=miniprogram'];
    if(options && options.book) qs.push('book=' + encodeURIComponent(options.book));
    const url = base + '/index.html?' + qs.join('&');
    this.setData({ url });
    console.log('[LIZZREAD] web-view:', url);
  },

  // web-view 加载成功
  onWebViewLoad(){
    this.setData({ loaded: true, failed: false });
  },

  // 接收网页通过 wx.miniProgram.postMessage 发来的消息
  onMessage(e){
    const msgs = (e.detail && e.detail.data) || [];
    console.log('[LIZZREAD] 网页消息:', msgs);
    const last = msgs[msgs.length - 1];
    if(last && last.type === 'lang'){
      wx.setStorageSync('lz_lang', last.value);
      this.setData({ lang: last.value });
    }
  },

  onError(e){
    console.error('[LIZZREAD] web-view 加载失败:', e);
    this.setData({ failed: true });
    wx.showModal({
      title: '加载失败',
      content: '网页加载失败，请检查网络后重试。',
      confirmText: '重试',
      success: (r) => { if(r.confirm) this.buildUrl(this.data.lang, this._opts); }
    });
  },

  // 分享给好友
  onShareAppMessage(){
    return {
      title: 'LIZZREAD · 16 门语言经典阅读器',
      path: '/pages/web/web?lang=' + this.data.lang,
      imageUrl: (app.globalData.SITE || '') + '/icon-512.png'
    };
  },

  // 分享到朋友圈
  onShareTimeline(){
    return {
      title: 'LIZZREAD · 点词即查释义的外语阅读器',
      query: 'lang=' + this.data.lang
    };
  }
});
