import { ensureLogin } from './utils/auth';

App({
  async onLaunch() {
    try {
      await ensureLogin();
    } catch (error) {
      console.error('初始化登录失败:', error);
    }
  },
  globalData: {
    userInfo: null,
    selectedParseRecord: null,
    promptRewardAd: false
  }
});
