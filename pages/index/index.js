import config from '../../utils/config';
import { ensureLogin } from '../../utils/auth';
import { createParse, getBenefit, grantAdReward } from '../../utils/api';
import { getClipboardData, copyToClipboard } from '../../utils/clipboard';
import { extractUrl, truncateString } from '../../utils/util';
import { downloadCoverToPhotosAlbum, downloadVideoToPhotosAlbum } from '../../utils/file';
import { showToast, showConfirmModal } from '../../utils/ui';

Page({
  data: {
    inputValue: '',
    showVideo: false,
    showArticle: false,
    showCoverButton: false,
    showImageList: false,
    showAudio: false,
    showLivePhotos: false,
    showSaveCoverButton: false,
    showSaveVideoButton: false,
    showSaveImagesButton: false,
    savingVideo: false,
    downloadProgress: 0,
    isButtonDisabled: false,
    isLoading: false,
    showWhiteBackground: false,
    response: {
      video_url: '',
      title: '',
      cover_url: '',
      video_id: '',
      image_list: [],
      live_photo_list: [],
      live_photos: [],
      audio_url: '',
      author: null
    },
    mediaCount: 0,
    mediaTypeLabel: '',
    audioPlaying: false,
    audioLoading: false,
    audioReady: false,
    isClearMode: false,
    totalCount: 0, // 累计解析数据
    statusBarHeight: 0,
    navBarHeight: 0,
    hasRetried: false, // 标记当前展示的视频是否已尝试重试
    benefit: {
      used_count: 0,
      limit: 3,
      remaining: 3,
      ad_unlocked: false
    },
    benefitLoading: true,
    adLoading: false,
  },

  onLoad: async function () {
    this.setNavSize();
    this.initRewardedVideoAd();
    await this.initializeAccount();
  },

  // 计算导航栏高度
  setNavSize: function () {
    const windowInfo = wx.getWindowInfo();
    const deviceInfo = wx.getDeviceInfo();
    const statusHeight = windowInfo.statusBarHeight;
    const isiOS = deviceInfo.system.indexOf('iOS') > -1;
    const navHeight = isiOS ? 44 : 48; // iOS 导航栏高度 44，Android 48

    this.setData({
      statusBarHeight: statusHeight,
      navBarHeight: navHeight
    });
  },

  onShow: function () {
    const app = getApp();
    if (app.globalData.selectedParseRecord) {
      this.displayParseData(app.globalData.selectedParseRecord);
      app.globalData.selectedParseRecord = null;
    }
    if (app.globalData.promptRewardAd) {
      app.globalData.promptRewardAd = false;
      setTimeout(() => this.promptWatchAd(), 300);
    }
    this.refreshBenefit();
  },

  onHide: function () {
  },

  onUnload: function () {
    this.stopAudio();
    if (this.rewardedVideoAd) {
      this.rewardedVideoAd.offClose(this.onRewardedAdClose);
      this.rewardedVideoAd.offError(this.onRewardedAdError);
    }
  },

  async initializeAccount() {
    try {
      await ensureLogin();
      await this.refreshBenefit();
    } catch (error) {
      console.error('登录初始化失败:', error);
      showToast(error.message || '登录失败，请稍后重试', 'none', 2500);
    }
  },

  async refreshBenefit() {
    try {
      const response = await getBenefit();
      this.setData({
        benefit: response.data,
        benefitLoading: false
      });
    } catch (error) {
      if (error.code !== 40101) console.error('获取权益失败:', error);
      this.setData({ benefitLoading: false });
    }
  },

  onInput: function (e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  doPaste: async function () {
    try {
      const data = await getClipboardData();
      this.setData({
        inputValue: data,
        isClearMode: true
      });
      showToast('已粘贴', 'success', 1500);
    } catch (error) {
      showToast('剪贴板无内容', 'none', 1500);
    }
  },

  async onSubmit() {
    if (this.data.isButtonDisabled) return;
    this.stopAudio();
    this.setData({
      showVideo: false,
      showArticle: false,
      showCoverButton: false,
      showImageList: false,
      showAudio: false,
      showLivePhotos: false,
      showSaveCoverButton: false,
      showSaveVideoButton: false,
      showSaveImagesButton: false,
      savingVideo: false,
      downloadProgress: 0,
      isButtonDisabled: true,
      isLoading: true,
      showWhiteBackground: false,
      hasRetried: false, // 每次新解析都重置重试状态
      response: {
        video_url: '',
        title: '',
        cover_url: '',
        video_id: '',
        image_list: [],
        live_photo_list: [],
        live_photos: [],
        audio_url: '',
        author: null
      },
      mediaCount: 0,
      mediaTypeLabel: '',
      audioPlaying: false,
      audioLoading: false,
      audioReady: false
    });
    const { inputValue } = this.data;
    if (inputValue === '') {
      showToast('请输入或者粘贴分享链接', 'none', 2000);
      this.setData({
        isButtonDisabled: false,
        isLoading: false
      });
      return;
    }
    const url = extractUrl(inputValue);
    if (!url) {
      showToast('提取链接失败', 'none', 2000);
      this.setData({
        isButtonDisabled: false,
        isLoading: false
      });
      return;
    }
    try {
      await ensureLogin();
      const response = await createParse(url);
      this.displayParseData(response.data);
      await this.refreshBenefit();
    } catch (error) {
      console.error('请求失败:', error);
      if (error.code === 42901) {
        this.pendingParseUrl = url;
        this.promptWatchAd();
      } else {
        showToast(error.message || '解析失败，请稍后再试', 'none', 2500);
      }
    } finally {
      setTimeout(() => {
        this.setData({
          isButtonDisabled: false,
          isLoading: false
        });
      }, 1000);
    }
  },

  normalizeParseData(data = {}, platform = '') {
    const livePhotos = Array.isArray(data.live_photo)
      ? data.live_photo.filter(item => item && (item.image || item.video))
      : [];
    const livePhotoList = livePhotos.map(item => item.image).filter(Boolean);
    const sourceImages = Array.isArray(data.images) ? data.images.filter(Boolean) : [];
    const imageList = [...new Set(sourceImages.length ? sourceImages : livePhotoList)];
    const music = data.music || {};
    const author = data.author || {};
    const extra = data.extra || {};
    const videoBackup = Array.isArray(data.video_backup) ? data.video_backup : [];
    const backupVideo = videoBackup.find(item => item && item.url);

    return {
      ...data,
      image_list: imageList,
      live_photo_list: livePhotoList,
      live_photos: livePhotos,
      cover_url: data.cover || data.cover_url || imageList[0] || '',
      video_url: data.video_url || data.url || (backupVideo && backupVideo.url) || '',
      video_id: extra.aweme_id ? String(extra.aweme_id) : '',
      audio_url: music.url || '',
      audio_title: music.title || '',
      title: data.title || '',
      desc: data.desc || '',
      platform: platform || '',
      author: {
        ...author,
        nickname: author.name || author.nickname || ''
      }
    };
  },

  getMediaCount(data) {
    if (data.live_photos.length) return data.live_photos.length;
    if (data.video_url) return 1;
    if (data.image_list.length) return data.image_list.length;
    return data.cover_url ? 1 : 0;
  },

  getMediaTypeLabel(data) {
    if (data.live_photos.length) return `实况素材（${data.live_photos.length}组）`;
    if (data.video_url) return '视频素材';
    if (data.image_list.length) return `图集素材（${data.image_list.length}张）`;
    return '封面素材';
  },

  initRewardedVideoAd() {
    if (!config.rewardedVideoAdUnitId || !wx.createRewardedVideoAd) return;

    this.rewardedVideoAd = wx.createRewardedVideoAd({
      adUnitId: config.rewardedVideoAdUnitId
    });
    this.onRewardedAdClose = this.handleRewardedAdClose.bind(this);
    this.onRewardedAdError = this.handleRewardedAdError.bind(this);
    this.rewardedVideoAd.onClose(this.onRewardedAdClose);
    this.rewardedVideoAd.onError(this.onRewardedAdError);
  },

  promptWatchAd() {
    wx.showModal({
      title: '今日免费次数已用完',
      content: '每天可免费解析 3 次。完整观看一次激励视频，即可解锁今日更多解析次数。',
      confirmText: '观看广告',
      cancelText: '暂不观看',
      success: (res) => {
        if (res.confirm) this.showRewardedVideoAd();
      }
    });
  },

  async showRewardedVideoAd() {
    if (!config.rewardedVideoAdUnitId) {
      if (config.mockRewardedVideoAd) {
        await this.grantRewardAfterAd(true);
      } else {
        showToast('请先在配置文件中填写激励视频广告位 ID', 'none', 3000);
      }
      return;
    }

    this.setData({ adLoading: true });
    try {
      await this.rewardedVideoAd.show();
    } catch (error) {
      try {
        await this.rewardedVideoAd.load();
        await this.rewardedVideoAd.show();
      } catch (loadError) {
        this.setData({ adLoading: false });
        showToast('广告加载失败，请稍后重试', 'none', 2500);
      }
    }
  },

  async handleRewardedAdClose(res) {
    this.setData({ adLoading: false });
    if (!res || !res.isEnded) {
      showToast('需完整观看广告才能获得解析次数', 'none', 2500);
      return;
    }

    await this.grantRewardAfterAd(false);
  },

  async grantRewardAfterAd(isMock = false) {
    this.setData({ adLoading: true });
    try {
      const response = await grantAdReward(isMock ? 'mock_rewarded_video_ad' : null);
      this.setData({
        benefit: response.data,
        adLoading: false
      });
      showToast(isMock ? '模拟广告完成，今日额度已解锁' : '今日解析额度已解锁', 'success', 2000);
      if (this.pendingParseUrl) {
        const url = this.pendingParseUrl;
        this.pendingParseUrl = '';
        this.setData({ inputValue: url });
        await this.onSubmit();
      }
    } catch (error) {
      this.setData({ adLoading: false });
      showToast(error.message || '广告奖励发放失败', 'none', 2500);
    }
  },

  handleRewardedAdError(error) {
    console.error('激励广告错误:', error);
    this.setData({ adLoading: false });
    showToast('广告暂时不可用，请稍后重试', 'none', 2500);
  },

  viewCoverImage() {
    const { cover_url } = this.data.response;
    wx.previewImage({
      urls: [cover_url],
      current: cover_url
    });
  },

  previewImageList(e) {
    const current = e.currentTarget.dataset.url;
    const urls = this.data.response.image_list.length
      ? this.data.response.image_list
      : [this.data.response.cover_url].filter(Boolean);

    if (!urls.length) return;
    wx.previewImage({
      urls,
      current: current || urls[0]
    });
  },

  previewLivePhotos(e) {
    const current = e.currentTarget.dataset.url;
    const urls = this.data.response.live_photo_list;

    if (!urls.length) return;
    wx.previewImage({
      urls,
      current: current || urls[0]
    });
  },

  clearInput() {
    this.setData({
      inputValue: '',
      isClearMode: false
    });
  },

  async downloadVideo() {
    const { video_url } = this.data.response;
    try {
      const message = await downloadVideoToPhotosAlbum(video_url);
      showToast(message, 'success');
    } catch (error) {
      copyToClipboard(video_url);
      showToast('下载失败: 视频地址已复制，您可以尝试手动下载', 'none');
    }
  },

  async downloadLiveVideos() {
    const videos = this.data.response.live_photos.map(item => item.video).filter(Boolean);
    if (!videos.length) {
      showToast('暂无实况视频可保存', 'none');
      return;
    }

    try {
      for (let i = 0; i < videos.length; i += 1) {
        await downloadVideoToPhotosAlbum(videos[i]);
      }
      showToast('实况视频保存成功', 'success');
    } catch (error) {
      copyToClipboard(videos.join('\n'), { title: '保存失败，实况视频链接已复制', icon: 'none' });
    }
  },

  displayParseData(source = {}) {
    const data = source.result_data || source;
    if (!data || (!data.video_url && !data.url && !data.title && !data.cover && !data.cover_url && !(data.images || []).length && !(data.live_photo || []).length)) {
      showToast(source.error_message || '无法获取到该素材信息，请稍后再试', 'none', 2000);
      return;
    }

    const normalizedData = this.normalizeParseData(data, source.platform || data.platform);
    this.setData({
      response: normalizedData,
      showVideo: !!normalizedData.video_url,
      showArticle: !!normalizedData.title,
      showCoverButton: !!normalizedData.cover_url,
      showImageList: normalizedData.image_list.length > 0,
      showAudio: !!normalizedData.audio_url,
      showLivePhotos: normalizedData.live_photo_list.length > 0,
      showSaveVideoButton: !!normalizedData.video_url,
      showSaveCoverButton: !!normalizedData.cover_url,
      showSaveImagesButton: normalizedData.image_list.length > 0,
      mediaCount: this.getMediaCount(normalizedData),
      mediaTypeLabel: this.getMediaTypeLabel(normalizedData),
      showWhiteBackground: true
    });
  },

  async downloadCover() {
    try {
      const { cover_url } = this.data.response;
      downloadCoverToPhotosAlbum(cover_url, true, (error) => {
        if (error) {
          copyToClipboard(cover_url, { title: '下载失败: 封面地址已复制，您可以尝试手动下载', icon: 'none' });
        }
      });
    } catch (error) {
      showToast('出错，请重试', 'none', 2000);
    }
  },

  async downloadImageList() {
    const { image_list } = this.data.response;
    if (!image_list || !image_list.length) {
      showToast('暂无图集可保存', 'none');
      return;
    }

    wx.showLoading({
      title: '保存图集中...',
      mask: true
    });

    try {
      for (let i = 0; i < image_list.length; i += 1) {
        await this.saveImageToAlbum(image_list[i]);
      }
      wx.hideLoading();
      showToast('图集保存成功', 'success');
    } catch (error) {
      wx.hideLoading();
      copyToClipboard(image_list.join('\n'), { title: '保存失败，图集链接已复制', icon: 'none' });
    }
  },

  saveImageToAlbum(url) {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url,
        success: (res) => {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: resolve,
            fail: reject
          });
        },
        fail: reject
      });
    });
  },

  toggleAudio() {
    const { audio_url } = this.data.response;
    if (!audio_url) return;

    this.ensureAudioManager();

    if (this.data.audioPlaying) {
      this.audioManager.pause();
      return;
    }

    const { title, cover_url, author } = this.data.response;
    this.setData({ audioLoading: true });

    this.audioManager.title = this.data.response.audio_title || title || '原声音乐';
    this.audioManager.singer = author && author.nickname ? author.nickname : '未知作者';
    this.audioManager.coverImgUrl = cover_url || '';

    if (this.audioManager.src !== audio_url) {
      this.audioManager.src = audio_url;
    } else {
      this.audioManager.play();
    }
  },

  ensureAudioManager() {
    if (this.audioManager) return;

    wx.setInnerAudioOption({
      obeyMuteSwitch: false,
      mixWithOther: true
    });

    this.audioManager = wx.getBackgroundAudioManager();

    this.audioManager.onCanplay(() => {
      this.setData({ audioLoading: false });
    });

    this.audioManager.onPlay(() => {
      this.setData({
        audioPlaying: true,
        audioLoading: false,
        audioReady: true
      });
    });

    this.audioManager.onPause(() => {
      this.setData({
        audioPlaying: false,
        audioLoading: false
      });
    });

    this.audioManager.onStop(() => {
      this.setData({
        audioPlaying: false,
        audioLoading: false
      });
    });

    this.audioManager.onEnded(() => {
      this.setData({
        audioPlaying: false,
        audioLoading: false
      });
    });

    this.audioManager.onError((error) => {
      console.error('Audio play error:', error);
      this.setData({
        audioPlaying: false,
        audioLoading: false,
        audioReady: false
      });
      copyToClipboard(this.data.response.audio_url, { title: `音乐播放失败(${error.errCode || '未知'})，链接已复制`, icon: 'none' });
    });
  },

  stopAudio() {
    if (!this.audioManager) return;
    this.audioManager.stop();
    this.setData({
      audioPlaying: false,
      audioLoading: false
    });
  },

  copyAllInfo() {
    const { title, cover_url, video_url, audio_url, image_list, live_photos } = this.data.response;
    const liveVideos = live_photos.map(item => item.video).filter(Boolean);
    let content = `标题：${title || '无'}\n`;
    content += `封面：${cover_url || '无'}\n`;
    content += `视频：${video_url || '无'}\n`;
    content += `音乐：${audio_url || '无'}\n`;
    content += `图集：${image_list && image_list.length ? image_list.join('\n') : '无'}\n`;
    content += `实况视频：${liveVideos.length ? liveVideos.join('\n') : '无'}`;
    copyToClipboard(content, { title: '全部信息已复制' });
  },

  copyTitle() {
    const { title } = this.data.response;
    let content = `${title || '无'}`;
    copyToClipboard(content, { title: '标题已复制' });
  },

  copyCoverUrl() {
    const { cover_url } = this.data.response;
    let content = `${cover_url || '无'}`;
    copyToClipboard(content, { title: '封面链接已复制' });
  },

  copyVideoUrl() {
    const { video_url } = this.data.response;
    let content = `${video_url || '无'}`;
    copyToClipboard(content, { title: '视频链接已复制' });
  },

  copyImageList() {
    const { image_list } = this.data.response;
    const content = image_list && image_list.length ? image_list.join('\n') : '无';
    copyToClipboard(content, { title: '图集链接已复制' });
  },

  showDisclaimer() {
    showConfirmModal("灵创去水印说明", "灵创去水印作为中立的技术服务提供者，旨在协助用户个人学习与素材赏析。我们郑重提醒用户，务必合法使用，任何因滥用而导致的侵权行为，责任将由用户自行承担。本程序不存储任何数字影像，资料版权归原平台及作者所有。灵创去水印致力于与用户携手，共同维护一个健康、积极的网络环境。此声明适用于本服务的所有功能。", (res) => { }, { showCancel: false, confirmText: "确定" });
  },

  onShareAppMessage: function () {
    const { video_url, cover_url, title, video_id, heat } = this.data.response;
    if (video_url) {
      return {
        title: truncateString(title, 35) || '这个视频太赞了，快来看看！',
        path: `/pages/videoPlayer/videoPlayer?url=${encodeURIComponent(video_url)}&` +
          `cover=${encodeURIComponent(cover_url)}&` +
          `title=${encodeURIComponent(truncateString(title, 80, ''))}&` +
          `videoid=${encodeURIComponent(video_id)}&` +
          `heat=${encodeURIComponent(heat || 0)}&` +
          `fromShare=true`,
        imageUrl: cover_url,
        success: (res) => {
        },
        fail: (err) => {
          console.error('分享失败', err);
        }
      };
    } else {
      return {
        title: '灵创去水印，轻松保存喜欢的图片和视频',
        path: '/pages/index/index',
        success: (res) => {
        },
        fail: (err) => {
          console.error('右上角分享失败', err);
        }
      };
    }
  },

  onShareTimeline: function () {
    const { video_url, cover_url, title, video_id, heat } = this.data.response;
    if (video_url) {
      return {
        title: '分享一个我一直在用的灵创去水印',
        query: `/pages/videoPlayer/videoPlayer?url=${encodeURIComponent(video_url)}&` +
          `cover=${encodeURIComponent(cover_url)}&` +
          `title=${encodeURIComponent(truncateString(title, 80, ''))}&` +
          `videoid=${encodeURIComponent(video_id)}&` +
          `heat=${encodeURIComponent(heat || 0)}&` +
          `fromShare=true`,
        imageUrl: cover_url,
        success: (res) => {
        },
        fail: function (err) {
          console.error('分享失败', err);
        }
      };
    } else {
      return {
        title: '分享一个我一直在用的灵创去水印',
        query: '/pages/index/index',
        success: (res) => {
        },
        fail: function (err) {
          console.error('分享失败', err);
        }
      };
    }
  },

  navigateToQuestions: function () {
    wx.navigateTo({
      url: '/pages/questions/questions'
    });
  },

  navigateToHistory() {
    wx.navigateTo({ url: '/pages/history/history' });
  },

  onVideoError: function (e) {
    console.error('Index video error:', e.detail);

    // 如果没有重试过，且当前有视频地址，则尝试自动重试一次
    if (!this.data.hasRetried && this.data.response.video_url) {
      console.log('首页视频加载失败，正在尝试自动重试...');

      const { response } = this.data;
      const originalUrl = response.video_url;
      const retryUrl = originalUrl.includes('?')
        ? `${originalUrl}&retry=${Date.now()}`
        : `${originalUrl}?retry=${Date.now()}`;

      this.setData({
        hasRetried: true,
        'response.video_url': retryUrl
      });
    } else {
      // 依然失败则给用户提示
      wx.showToast({
        title: '视频加载不稳定，建议尝试手动保存',
        icon: 'none',
        duration: 2500
      });
    }
  },

});
