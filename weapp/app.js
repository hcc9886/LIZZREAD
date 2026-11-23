// LIZZREAD 小程序入口
// 说明：本项目采用 web-view 套壳，核心逻辑全部在已备案域名的网页版里。
// 你只需要把 SITE 改成你自己的已备案域名即可。
App({
  globalData: {
    // ↓↓↓ 改这里：必须是已在小程序后台配置过「业务域名」的 HTTPS 域名
    SITE: 'https://hcc9886.github.io/LIZZREAD',
    version: '2.0.0'
  },
  onLaunch(options){
    // 记录来源渠道，便于后续统计
    this.globalData.launchScene = options && options.scene;
  }
});
