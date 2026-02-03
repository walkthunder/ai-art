/**
 * 统一历史记录页面
 * 支持按模式筛选：全部 | 时空拼图 | 富贵变身
 */

const app = getApp();

Page({
  data: {
    // 标签页
    tabs: [
      { id: 'all', label: '全部' },
      { id: 'puzzle', label: '时空拼图' },
      { id: 'transform', label: '富贵变身' }
    ],
    activeTab: 'all',
    
    // 历史记录
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    loading: false,
    hasMore: true,
    
    // 空状态
    isEmpty: false,
    
    // 预览
    previewVisible: false,
    previewImage: ''
  },

  /**
   * 页面加载
   */
  onLoad() {
    console.log('[History] 页面加载');
    this.loadHistory();
  },

  /**
   * 页面显示
   */
  onShow() {
    console.log('[History] 页面显示');
    // 刷新历史记录
    this.setData({
      items: [],
      page: 1,
      hasMore: true
    });
    this.loadHistory();
  },

  /**
   * 标签页切换
   */
  onTabChange(e) {
    const { id } = e.currentTarget.dataset;
    console.log('[History] 切换标签页:', id);
    
    this.setData({
      activeTab: id,
      items: [],
      page: 1,
      hasMore: true,
      isEmpty: false
    });
    
    this.loadHistory();
  },

  /**
   * 加载历史记录
   */
  async loadHistory() {
    if (this.data.loading || !this.data.hasMore) {
      return;
    }

    try {
      this.setData({ loading: true });

      const userId = await app.getUserId(true);
      
      if (!userId) {
        console.warn('[History] 用户未登录');
        wx.showToast({
          title: '请先登录',
          icon: 'none'
        });
        this.setData({ loading: false });
        return;
      }

      const cloudbaseRequest = require('../../utils/cloudbase-request');
      
      // 构建查询参数
      const params = {
        page: this.data.page,
        pageSize: this.data.pageSize
      };
      
      // 如果不是"全部"，添加 mode 参数
      if (this.data.activeTab !== 'all') {
        params.mode = this.data.activeTab;
      }

      // 调用 API
      const res = await cloudbaseRequest.get(`/api/history/${userId}`, params);

      if (res && res.success) {
        const { items = [], total, page } = res.data;

        // 处理图片数据
        const processedItems = items.map(item => {
          return {
            ...item,
            // 解析 original_images 和 generated_image
            originalImages: this.parseImages(item.original_images),
            generatedImage: item.generated_image,
            // 格式化时间
            createdAtFormatted: this.formatTime(item.created_at),
            // 模式标签
            modeLabel: item.mode === 'puzzle' ? '时空拼图' : '富贵变身'
          };
        });

        // 更新数据
        const newItems = page === 1 ? processedItems : [...this.data.items, ...processedItems];
        
        this.setData({
          items: newItems,
          total: total,
          page: page + 1,
          hasMore: newItems.length < total,
          isEmpty: newItems.length === 0
        });

        console.log('[History] 加载成功，共', total, '条记录');
      } else {
        console.error('[History] 加载失败:', res);
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
      }
    } catch (err) {
      console.error('[History] 加载异常:', err);
      wx.showToast({
        title: '加载异常',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  /**
   * 解析图片数据
   */
  parseImages(imagesStr) {
    if (!imagesStr) return [];
    
    try {
      if (typeof imagesStr === 'string') {
        return JSON.parse(imagesStr);
      }
      return imagesStr;
    } catch (err) {
      console.error('[History] 解析图片失败:', err);
      return [];
    }
  },

  /**
   * 格式化时间
   */
  formatTime(dateStr) {
    if (!dateStr) return '';
    
    try {
      const date = new Date(dateStr);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    } catch (err) {
      console.error('[History] 格式化时间失败:', err);
      return dateStr;
    }
  },

  /**
   * 预览图片
   */
  onPreviewImage(e) {
    const { image } = e.currentTarget.dataset;
    console.log('[History] 预览图片:', image);
    
    this.setData({
      previewVisible: true,
      previewImage: image
    });
  },

  /**
   * 关闭预览
   */
  onClosePreview() {
    this.setData({
      previewVisible: false,
      previewImage: ''
    });
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    console.log('[History] 下拉刷新');
    
    this.setData({
      items: [],
      page: 1,
      hasMore: true
    });
    
    this.loadHistory().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    console.log('[History] 上拉加载更多');
    
    if (this.data.hasMore && !this.data.loading) {
      this.loadHistory();
    }
  },

  /**
   * 删除历史记录
   */
  async onDeleteItem(e) {
    const { id } = e.currentTarget.dataset;
    console.log('[History] 删除记录:', id);
    
    wx.showModal({
      title: '删除确认',
      content: '确定要删除这条记录吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            // TODO: 调用删除 API
            // const cloudbaseRequest = require('../../utils/cloudbase-request');
            // await cloudbaseRequest.delete(`/api/history/${id}`);
            
            // 从列表中移除
            const items = this.data.items.filter(item => item.id !== id);
            this.setData({
              items: items,
              total: this.data.total - 1,
              isEmpty: items.length === 0
            });
            
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            });
          } catch (err) {
            console.error('[History] 删除失败:', err);
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        }
      }
    });
  }
});
