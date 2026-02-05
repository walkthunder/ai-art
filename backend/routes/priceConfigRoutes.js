/**
 * 价格配置路由模块
 * 管理套餐价格的增删改查
 */

const express = require('express');
const router = express.Router();
const priceConfigService = require('../services/priceConfigService');
const { authenticate, authorize } = require('../middleware/adminAuth');
const { logOperation } = require('../middleware/adminLogger');

/**
 * 获取所有价格配置（管理后台）
 * GET /admin-api/prices
 */
router.get('/', authenticate, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const prices = await priceConfigService.getAllPriceConfigs();
    res.json({ success: true, data: prices });
  } catch (error) {
    console.error('获取价格配置失败:', error);
    res.status(500).json({ error: '获取价格配置失败', message: error.message });
  }
});

/**
 * 获取当前生效的价格（公开API）
 * GET /api/prices/current
 * Query参数: details=true 返回详细信息（包含充值次数）
 */
router.get('/current', async (req, res) => {
  try {
    const includeDetails = req.query.details === 'true';
    const prices = await priceConfigService.getCurrentPrices(true, includeDetails);
    res.json({ success: true, data: prices });
  } catch (error) {
    console.error('获取当前价格失败:', error);
    res.status(500).json({ error: '获取当前价格失败', message: error.message });
  }
});

/**
 * 创建价格配置
 * POST /admin-api/prices
 */
router.post('/', 
  authenticate, 
  authorize('super_admin'), 
  logOperation,
  async (req, res) => {
    try {
      const { category, code, name, price, rechargeAmount, description, effectiveDate } = req.body;
      
      if (!category || !code || !name || price === undefined) {
        return res.status(400).json({ 
          error: '缺少必要参数', 
          message: '需要提供 category, code, name 和 price' 
        });
      }
      
      const validCategories = ['package', 'product', 'service'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ 
          error: '无效的类别', 
          message: '类别必须是 package, product 或 service' 
        });
      }
      
      if (price < 0) {
        return res.status(400).json({ error: '价格不能为负数' });
      }
      
      const result = await priceConfigService.createPriceConfig({
        category,
        code,
        name,
        price,
        rechargeAmount,
        description,
        effectiveDate: effectiveDate || new Date().toISOString().slice(0, 19).replace('T', ' '),
        createdBy: req.admin.id  // 使用 ID 而不是 username
      });
      
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('创建价格配置失败:', error);
      res.status(500).json({ error: '创建价格配置失败', message: error.message });
    }
  }
);

/**
 * 更新价格配置
 * PUT /admin-api/prices/:id
 */
router.put('/:id', 
  authenticate, 
  authorize('super_admin'), 
  logOperation,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { price, rechargeAmount, effectiveDate, status, description } = req.body;
      
      if (!id) {
        return res.status(400).json({ error: '缺少价格配置ID' });
      }
      
      const updateData = {};
      if (price !== undefined) {
        if (price < 0) {
          return res.status(400).json({ error: '价格不能为负数' });
        }
        updateData.price = price;
      }
      if (rechargeAmount !== undefined) {
        updateData.rechargeAmount = rechargeAmount;
      }
      if (effectiveDate !== undefined) {
        updateData.effectiveDate = effectiveDate;
      }
      if (status !== undefined) {
        const validStatuses = ['active', 'inactive', 'scheduled'];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ error: '无效的状态值' });
        }
        updateData.status = status;
      }
      if (description !== undefined) {
        updateData.description = description;
      }
      
      const result = await priceConfigService.updatePriceConfig(
        id, 
        updateData, 
        req.admin.id  // 使用 ID 而不是 username
      );
      
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('更新价格配置失败:', error);
      res.status(500).json({ error: '更新价格配置失败', message: error.message });
    }
  }
);

/**
 * 获取价格历史记录
 * GET /admin-api/prices/history/:id
 */
router.get('/history/:id', authenticate, authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const history = await priceConfigService.getPriceHistory(id);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('获取价格历史失败:', error);
    res.status(500).json({ error: '获取价格历史失败', message: error.message });
  }
});

/**
 * 获取指定代码的价格历史
 * GET /admin-api/prices/history/code/:code
 */
router.get('/history/code/:code', 
  authenticate, 
  authorize('super_admin', 'admin'), 
  async (req, res) => {
    try {
      const { code } = req.params;
      const history = await priceConfigService.getPriceHistoryByCode(code);
      res.json({ success: true, data: history });
    } catch (error) {
      console.error('获取价格历史失败:', error);
      res.status(500).json({ error: '获取价格历史失败', message: error.message });
    }
  }
);

/**
 * 停用价格配置
 * DELETE /admin-api/prices/:id
 */
router.delete('/:id', 
  authenticate, 
  authorize('super_admin'), 
  logOperation,
  async (req, res) => {
    try {
      const { id } = req.params;
      await priceConfigService.deactivatePriceConfig(id, req.admin.id);
      res.json({ success: true, message: '价格配置已停用' });
    } catch (error) {
      console.error('停用价格配置失败:', error);
      res.status(500).json({ error: '停用价格配置失败', message: error.message });
    }
  }
);

module.exports = router;
