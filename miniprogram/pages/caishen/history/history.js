/**
 * 财神变身模式历史记录页
 * Requirements: 4.6
 * 
 * 功能：
 * - 显示视频历史记录列表
 * - 点击查看视频详情
 * - 删除历史记录
 */

const { getHistory, deleteHistory, clearHistory } = require('../../../utils/storage');
const { cloudRequest } = require('../../../utils/cloudbase-request');
const { initNavigation } = require('../../../utils/navigation-helper');
const { getAssetUrl } = require('../../../utils/oss-assets');

Page({
  data: {
    isElderMode: false,
    statusBarHeight: 0,
    navBarHeight: 44,
    menuRight: 0,
    records: [],
    loading: true,
    error: null,
    isDeleting: false,
    commonBgUrl: getAssetUrl('bg/caishen-result-bg.jpg')
  },

  onLoad() {
    const app = getApp();
    
    initNavigation(this);
    
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
    
    this.fetchHistory();
  },

  onShow() {
    const app = getApp();
    this.setData({
      isElderMode: app.globalData.isElderMode
    });
    
    this.fetchHistory();
  },

  onPullDownRefresh() {
    this.fetchHistory().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  async fetchHistory() {
    this.setData({ loading: true, error: null });
    
    try {
      const localRecords = getHistory('caishen');
      console.log('[CaishenHistory] 本地记录:', localRecords.length);
      
      const app = getApp();
      const userId = await app.getUserId(false);
      
      if (userId) {
        try {
          const result = await cloudRequest({
            path: `/api/caishen/history?userId=${userId}&limit=20`,
            method: 'GET',
            showError: false
          });
          
          if (result.success && result.data && result.data.length > 0) {
            const serverRecords = result.data.map(r => ({
              id: r.id,
              videoUrl: r.generated_image_urls && r.generated_image_urls[0] || '',
              originalImage: r.original_image_urls && r.original_image_urls[0] || '',
              createdAt: r.created_at,
              status: r.status,
              mode: 'caishen',
              isServerRecord: true
            }));
            
            const allRecords = [...serverRecords];
            localRecords.forEach(local => {
              if (!allRecords.find(r => r.id === local.id)) {
                allRecords.push({ ...local, isServerRecord: false });
              }
            });
            
            allRecords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            this.setData({
              records: allRecords,
              loading: false
            });
            return;
          }
        } catch (err) {
          console.log('[CaishenHistory] 服务器获取失败，使用本地数据:', err);
        }
      }
      
      this.setData({
        records: localRecords.map(r => ({ ...r, isServerRecord: false })),
        loading: false
      });
      
    } catch (err) {
      console.error('[CaishenHistory] 获取历史记录失败:', err);
      this.setData({
        error: '加载历史记录失败',
        loading: false
      });
    }
  },

  handleRecordClick(e) {
    const { record } = e.currentTarget.dataset;
    
    if (!record || !record.videoUrl) {
      wx.showToast({
        title: '该记录暂无可查看的视频',
        icon: 'none'
      });
      return;
    }
    
    wx.navigateTo({
      url: `/pages/caishen/result/result?videoUrl=${encodeURIComponent(record.videoUrl)}`
    });
  },

  handleDelete(e) {
    const { id } = e.currentTarget.dataset;
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条记录吗？',
      confirmColor: '#D4302B',
      success: (res) => {
        if (res.confirm) {
          this.doDelete(id);
        }
      }
    });
  },

  async doDelete(id) {
    if (this.data.isDeleting) return;
    
    this.setData({ isDeleting: true });
    
    const record = this.data.records.find(r => r.id === id);
    const app = getApp();
    const userId = await app.getUserId(false);
    
    try {
      if (record && record.isServerRecord && userId) {
        try {
          const result = await cloudRequest({
            path: `/api/history/${id}?userId=${userId}`,
            method: 'DELETE',
            showError: false
          });
          
          if (result.success) {
            console.log('[CaishenHistory] 服务端删除成功:', id);
          }
        } catch (err) {
          console.warn('[CaishenHistory] 服务端删除请求失败:', err);
        }
      }
      
      deleteHistory(id);
      
      const records = this.data.records.filter(r => r.id !== id);
      this.setData({ records, isDeleting: false });
      
      wx.showToast({
        title: '删除成功',
        icon: 'success'
      });
    } catch (err) {
      console.error('[CaishenHistory] 删除失败:', err);
      this.setData({ isDeleting: false });
      wx.showToast({
        title: '删除失败',
        icon: 'none'
      });
    }
  },

  goCreate() {
    wx.navigateTo({
      url: '/pages/caishen/upload/upload'
    });
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({
          url: '/pages/caishen/launch/launch'
        });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '财神变身 - 我的生成记录',
      path: '/pages/caishen/launch/launch',
      imageUrl: '/assets/images/share-caishen.png'
    };
  }
});
