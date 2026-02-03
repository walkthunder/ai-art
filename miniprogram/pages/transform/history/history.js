/**
 * 富贵变身模式历史记录页
 * Requirements: 2.3, 11.1-11.4
 * 
 * 功能：
 * - 复用原网页 TransformHistoryPage 样式
 * - 实现历史记录列表展示
 * - 实现点击查看详情
 * - 实现删除功能（服务端+本地）
 */

const { getHistory, deleteHistory } = require('../../../utils/storage');
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
    
    // 每次显示时刷新数据
    this.fetchHistory();
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.fetchHistory().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 获取历史记录
   * Requirements: 11.1
   */
  async fetchHistory() {
    this.setData({ loading: true, error: null });
    
    try {
      // 先从本地获取
      const localRecords = getHistory('transform');
      console.log('[TransformHistory] 本地记录:', localRecords.length);
      
      // 尝试从服务器获取
      const app = getApp();
      const userId = await app.getUserId(false); // 不强制登录，允许查看本地记录
      
      if (userId) {
        try {
          // 使用 cloudRequest 获取历史记录
          const result = await cloudRequest({
            path: `/api/history/user/${userId}?limit=20`,
            method: 'GET',
            showError: false
          });
          
          if (result.success && result.data && result.data.length > 0) {
            // 合并服务器和本地记录，去重
            const serverRecords = result.data.map(r => ({
              id: r.id,
              originalImages: r.original_image_urls || [],
              generatedImage: r.selected_image_url || (r.generated_image_urls && r.generated_image_urls[0]) || '',
              generatedImages: r.generated_image_urls || [],
              createdAt: r.created_at,
              status: r.status,
              mode: 'transform',
              isServerRecord: true // 标记为服务端记录
            }));
            
            // 合并去重
            const allRecords = [...serverRecords];
            localRecords.forEach(local => {
              if (!allRecords.find(r => r.id === local.id)) {
                allRecords.push({ ...local, isServerRecord: false });
              }
            });
            
            // 按时间排序
            allRecords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            this.setData({
              records: allRecords,
              loading: false
            });
            return;
          }
        } catch (err) {
          console.log('[TransformHistory] 服务器获取失败，使用本地数据:', err);
        }
      }
      
      // 使用本地记录
      this.setData({
        records: localRecords.map(r => ({ ...r, isServerRecord: false })),
        loading: false
      });
      
    } catch (err) {
      console.error('[TransformHistory] 获取历史记录失败:', err);
      this.setData({
        error: '加载历史记录失败',
        loading: false
      });
    }
  },

  /**
   * 点击记录查看详情
   * Requirements: 11.2
   */
  handleRecordClick(e) {
    const { record } = e.currentTarget.dataset;
    
    if (!record) return;
    
    // 如果有多张生成图片，跳转到选择页
    if (record.generatedImages && record.generatedImages.length > 1) {
      const app = getApp();
      app.globalData.transformData = {
        generatedImages: record.generatedImages,
        uploadedImages: record.originalImages,
        taskId: record.taskId || record.id,
        recordId: record.recordId || record.id // 传递 recordId
      };
      
      wx.navigateTo({
        url: '/pages/transform/result-selector/result-selector'
      });
    } else if (record.generatedImage) {
      // 只有一张图片，直接跳转到结果页
      const generationId = record.recordId || record.id; // 优先使用 recordId
      wx.navigateTo({
        url: `/pages/transform/result/result?image=${encodeURIComponent(record.generatedImage)}&generationId=${generationId}`
      });
    } else {
      wx.showToast({
        title: '该记录暂无可查看的图片',
        icon: 'none'
      });
    }
  },

  /**
   * 删除记录
   * Requirements: 11.4
   */
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

  /**
   * 执行删除（服务端+本地）
   */
  async doDelete(id) {
    if (this.data.isDeleting) return;
    
    this.setData({ isDeleting: true });
    
    const record = this.data.records.find(r => r.id === id);
    const app = getApp();
    const userId = await app.getUserId(false); // 不强制登录
    
    try {
      // 如果是服务端记录，先删除服务端
      if (record && record.isServerRecord && userId) {
        try {
          const result = await cloudRequest({
            path: `/api/history/${id}?userId=${userId}`,
            method: 'DELETE',
            showError: false
          });
          
          if (!result.success) {
            console.warn('[TransformHistory] 服务端删除失败:', result);
          } else {
            console.log('[TransformHistory] 服务端删除成功:', id);
          }
        } catch (err) {
          console.warn('[TransformHistory] 服务端删除请求失败:', err);
          // 服务端删除失败不阻止本地删除
        }
      }
      
      // 删除本地记录
      deleteHistory(id);
      
      // 更新列表
      const records = this.data.records.filter(r => r.id !== id);
      this.setData({ records, isDeleting: false });
      
      wx.showToast({
        title: '删除成功',
        icon: 'success'
      });
    } catch (err) {
      console.error('[TransformHistory] 删除失败:', err);
      this.setData({ isDeleting: false });
      wx.showToast({
        title: '删除失败',
        icon: 'none'
      });
    }
  },

  /**
   * 清空所有历史记录
   */
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

  /**
   * 执行清空所有记录
   */
  async doClearAll() {
    if (this.data.isDeleting) return;
    
    this.setData({ isDeleting: true });
    
    const app = getApp();
    const userId = await app.getUserId(false); // 不强制登录
    
    try {
      // 清空服务端记录
      if (userId) {
        try {
          await cloudRequest({
            path: `/api/history/user/${userId}/all`,
            method: 'DELETE',
            showError: false
          });
          console.log('[TransformHistory] 服务端清空成功');
        } catch (err) {
          console.warn('[TransformHistory] 服务端清空失败:', err);
        }
      }
      
      // 清空本地记录
      const { clearHistory } = require('../../../utils/storage');
      clearHistory('transform');
      
      this.setData({ records: [], isDeleting: false });
      
      wx.showToast({
        title: '已清空',
        icon: 'success'
      });
    } catch (err) {
      console.error('[TransformHistory] 清空失败:', err);
      this.setData({ isDeleting: false });
      wx.showToast({
        title: '清空失败',
        icon: 'none'
      });
    }
  },

  /**
   * 去制作
   */
  goCreate() {
    wx.navigateTo({
      url: '/pages/transform/upload/upload'
    });
  },

  /**
   * 返回上一页
   */
  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.redirectTo({
          url: '/pages/transform/launch/launch'
        });
      }
    });
  },

  /**
   * 格式化日期
   */
  formatDate(dateStr) {
    const date = new Date(dateStr);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hour}:${minute}`;
  },

  /**
   * 获取状态文本
   */
  getStatusText(status) {
    const statusMap = {
      pending: '等待中',
      processing: '生成中',
      completed: '已完成',
      failed: '失败'
    };
    return statusMap[status] || status || '已完成';
  },

  /**
   * 获取状态样式类
   */
  getStatusClass(status) {
    const classMap = {
      pending: 'status-pending',
      processing: 'status-processing',
      completed: 'status-completed',
      failed: 'status-failed'
    };
    return classMap[status] || 'status-completed';
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '富贵变身 - 我的生成记录',
      path: '/pages/transform/launch/launch',
      imageUrl: '/assets/images/share-transform.png'
    };
  }
});
