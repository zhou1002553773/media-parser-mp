import { ensureLogin } from '../../utils/auth';
import { listParses, getParse, retryParse, deleteParse } from '../../utils/api';
import { showToast } from '../../utils/ui';

Page({
  data: {
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    loading: false,
    hasMore: true
  },

  async onLoad() {
    await this.loadHistory(true);
  },

  async onPullDownRefresh() {
    await this.loadHistory(true);
    wx.stopPullDownRefresh();
  },

  async onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      await this.loadHistory(false);
    }
  },

  async loadHistory(reset = false) {
    if (this.data.loading) return;
    this.setData({ loading: true });

    try {
      await ensureLogin();
      const page = reset ? 1 : this.data.page;
      const response = await listParses(page, this.data.pageSize);
      const data = response.data;
      const items = data.items.map(item => ({
        ...item,
        display_time: this.formatTime(item.created_at),
        status_text: this.getStatusText(item.status)
      }));
      const merged = reset ? items : this.data.items.concat(items);

      this.setData({
        items: merged,
        page: page + 1,
        total: data.total,
        hasMore: merged.length < data.total
      });
    } catch (error) {
      showToast(error.message || '历史记录加载失败', 'none', 2500);
    } finally {
      this.setData({ loading: false });
    }
  },

  formatTime(value) {
    if (!value) return '';
    return value.replace('T', ' ').slice(0, 16);
  },

  getStatusText(status) {
    const map = {
      success: '解析成功',
      failed: '解析失败',
      pending: '等待解析',
      processing: '解析中'
    };
    return map[status] || status;
  },

  async viewRecord(e) {
    const id = e.currentTarget.dataset.id;
    wx.showLoading({ title: '加载中...' });
    try {
      const response = await getParse(id);
      if (!response.data.result_data) {
        showToast(response.data.error_message || '该记录暂无可展示结果', 'none');
        return;
      }
      getApp().globalData.selectedParseRecord = response.data;
      wx.navigateBack();
    } catch (error) {
      showToast(error.message || '记录加载失败', 'none');
    } finally {
      wx.hideLoading();
    }
  },

  retryRecord(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '重新解析',
      content: '重新解析会消耗今日解析次数，是否继续？',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '解析中...', mask: true });
        try {
          const response = await retryParse(id);
          getApp().globalData.selectedParseRecord = response.data;
          showToast('重新解析成功', 'success');
          setTimeout(() => wx.navigateBack(), 500);
        } catch (error) {
          if (error.code === 42901) {
            wx.showModal({
              title: '今日免费次数已用完',
              content: '返回首页观看激励视频，即可解锁今日更多解析次数。',
              confirmText: '去观看',
              success: (modalResult) => {
                if (modalResult.confirm) {
                  getApp().globalData.promptRewardAd = true;
                  wx.navigateBack();
                }
              }
            });
          } else {
            showToast(error.message || '重新解析失败', 'none', 2500);
          }
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  deleteRecord(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除记录',
      content: '删除后无法恢复，确定删除这条解析记录吗？',
      confirmColor: '#e5484d',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await deleteParse(id);
          this.setData({
            items: this.data.items.filter(item => item.id !== id),
            total: Math.max(0, this.data.total - 1)
          });
          showToast('已删除', 'success');
        } catch (error) {
          showToast(error.message || '删除失败', 'none');
        }
      }
    });
  }
});
