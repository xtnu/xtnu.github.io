
window.Config = {
  // 页面标题（浏览器标签 & 顶部 Logo）
  SiteName: 'Xtn 站点监控',

  /* 分组配置
   * id  ：分组标识，用于 index.html#id 跳转；可中文/英文/数字，别带空格和 #
   * name：分组显示名称
   * 访问 index.html#API接口 或 index.html#api 都能跳到对应分组
   */
  Groups: [
    { id: 'api',  name: 'API 接口' },
    { id: 'site', name: '站点服务' },
  ],

  // 是否按分组展示；false = 所有监控平铺在一起
  GroupView: true,

  /* UptimeRobot 只读 API Key
   * 两种写法都支持：
   *   'm803...'                     → 未分组
   *   { key: 'm803...', group: 'api' } → 归入 id/name 为 api 的分组
   * Monitor-Specific key 只读，泄露也无法修改监控。
   */
  ApiKeys: [
    { key: 'm803590185-35e20ec965337c7e34cd28da', group: 'api' },  // api-fast.521567.xyz
    { key: 'm801495724-0c9d3fd39d00472d69d8c139', group: 'api' },  // api.521567.xyz
    { key: 'm804732280-3c2eae569ed60567a16cb9e9', group: 'site' }, // www.521567.xyz
  ],

  // 接口地址：每次请求都先走官方，任意异常（429/超时/无响应/返回错误）自动切到反代
  ApiBase: 'https://api.uptimerobot.com/v2/getMonitors',
  ApiFallback: 'https://status-api.521567.xyz/v2/getMonitors',

  // 请求超时（毫秒）
  Timeout: 12000,

  // 自动刷新间隔（秒），0 = 不自动刷新
  RefreshInterval: 300,

  // 默认时间范围（对应下面 Periods 的 value）
  DefaultPeriod: '24h',

  // 前端可切换的时间范围
  Periods: [
    { label: '24 小时', value: '24h' },
    { label: '7 天', value: '7d' },
    { label: '30 天', value: '30d' },
    { label: '90 天', value: '90d' },
  ],

  // 是否显示每个监控站点的外链
  ShowLink: true,

  // 顶部导航
  Navi: [
    { text: '首页', url: 'https://www.521567.xyz/' },
    { text: 'API', url: 'https://api.521567.xyz/' },
    { text: 'GitHub', url: 'https://github.com/xtnu/uptime-status' },
  ],

  // 功能开关（纯静态均可实现，按需关闭）
  Features: {
    banner: true,    // 全局状态横幅
    uptimeCard: true,// 汇总可用率卡
    timeline: true,  // 故障事件时间线
    badge: true,     // SVG 状态徽章
    json: true,      // 公开 JSON 状态入口
    theme: true,     // 深浅色切换
    group: true,     // 分组展示与折叠
    countdown: true, // 自动刷新倒计时
  },
};
