/**
 * 小程序全局配置文件
 */
const config = {
  // 本地联调地址。发布前请替换为已配置微信合法域名的 HTTPS 地址。
  baseURL: 'https://parse.aiideas.top',

  // 微信流量主后台创建的激励视频广告位 ID。
  rewardedVideoAdUnitId: '',

  // 开发阶段 Mock：未配置广告位 ID 时，点击观看广告后直接发放奖励。
  // 接入真实广告后建议改为 false。
  mockRewardedVideoAd: true,
  
  // 请求超时时间（毫秒）
  timeout: 15000,
  
  // 最大重试次数
  maxRetries: 1
};

export default config;

