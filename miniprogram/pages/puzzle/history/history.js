/**
 * 时空拼图模式历史记录页
 * Requirements: 2.2, 11.1-11.4
 * 
 * 功能：
 * - 实现历史记录列表展示
 * - 实现点击查看详情
 * - 实现删除功能（服务端+本地）
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
    commonBgUrl: getAssetUrl('common-bg.jpg')
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
      const localRecords = getHistory('puzzle');
      console.log('[PuzzleHistory] 本地记录:', localRecords.length);
      
      const app = getApp();
      const userId = await app.getUserId(false); // 不强制登录，允许查看本地记录
      
      if (userId) {
        try {
          const result = await cloudRequest({
            path: `/api/history/user/${userId}?limit=20`,
            method: 'GET',
            showError: false
          });
          
          if (result.success && result.data && result.data.length > 0) {
            const serverRecords = result.data
              .filter(r => r.mode === 'puzzle' || !r.mode)
              .map(r => ({
                id: r.id,
                originalImages: r.original_image_urls || [],
                generatedImage: r.selected_image_url || (r.generated_image_urls && r.generated_image_urls[0]) || '',
                generatedImages: r.generated_image_urls || [],
                createdAt: r.created_at,
                status: r.status,
                mode: 'puzzle',
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
          console.log('[PuzzleHistory] 服务器获取失败，使用本地数据:', err);
        }
      }
      
      this.setData({
        records: localRecords.map(r => ({ ...r, isServerRecord: false })),
        loading: false
      });
      
    } catch (err) {
      console.error('[PuzzleHistory] 获取历史记录失败:', err);
      this.setData({
        error: '加载历史记录失败',
        loading: false
      });
    }
  },

  handleRecordClick(e) {
    const { record } = e.currentTarget.dataset;
    
    if (!record) return;
    
    if (record.generatedImages && record.generatedImages.length > 1) {
      const app = getApp();
      app.globalData.puzzleData = {
        generatedImages: record.generatedImages,
        uploadedImages: record.originalImages,
        taskId: record.taskId || record.id,
        recordId: record.recordId || record.id // 传递 recordId
      };
      
      wx.navigateTo({
        url: '/pages/puzzle/result-selector/result-selector'
      });
    } else if (record.generatedImage) {
      const generationId = record.recordId || record.id; // 优先使用 recordId
      wx.navigateTo({
        url: `/pages/puzzle/result/result?image=${encodeURIComponent(record.generatedImage)}&generationId=${generationId}`
      });
    } else {
      wx.showToast({
        title: '该记录暂无可查看的图片',
        icon: 'none'
      });
    }
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
    const userId = await app.getUserId(false); // 不强制登录
    
    try {
      if (record && record.isServerRecord && userId) {
        try {
          const result = await cloudRequest({
            path: `/api/history/${id}?userId=${userId}`,
            method: 'DELETE',
            showError: false
          });
          
          if (result.success) {
            console.log('[PuzzleHistory] 服务端删除成功:', id);
          }
        } catch (err) {
          console.warn('[PuzzleHistory] 服务端删除请求失败:', err);
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
      console.error('[PuzzleHistory] 删除失败:', err);
      this.setData({ isDeleting: false });
      wx.showToast({
        title: '删除失败',
        icon: 'none'
      });
    }
  },

  handleClearAll() {
    if (this.data.records.length === 0) {
      wx.showToast({
        title: '暂无记录',
        icon: 'none'
      });
      return;
    }
    
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有历史记录吗？此操作不可恢复。',
      confirmColor: '#D4302B',
      success: (res) => {
        if (res.confirm) {
          this.doClearAll();
        }
      }
    });
  },

  async doClearAll() {
    if (this.data.isDeleting) return;
    
    this.setData({ isDeleting: true });
    
    const app = getApp();
    const userId = await app.getUserId(false); // 不强制登录
    
    try {
      if (userId) {
        try {
          await cloudRequest({
            path: `/api/history/user/${userId}/all`,
            method: 'DELETE',
            showError: false
          });
          console.log('[PuzzleHistory] 服务端清空成功');
        } catch (err) {
          console.warn('[PuzzleHistory] 服务端清空失败:', err);
        }
      }
      
      clearHistory('puzzle');
      
      this.setData({ records: [], isDeleting: false });
      
      wx.showToast({
        title: '已清空',
        icon: 'success'
      });
    } catch (err) {
      console.error('[PuzzleHistory] 清空失败:', err);
      this.setData({ isDeleting: false });
      wx.showToast({
        title: '清空失败',
        icon: 'none'
      });
    }
  },

  goCreate() {
    wx.navigateTo({
      url: '/pages/puzzle/upload/upload'
    });
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({
          url: '/pages/puzzle/launch/launch'
        });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '时空拼图 - 我的生成记录',
      path: '/pages/puzzle/launch/launch',
      imageUrl: '/assets/images/share-puzzle.png'
    };
  }
});
