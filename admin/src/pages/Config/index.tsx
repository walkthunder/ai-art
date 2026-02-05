import React, { useState, useEffect } from 'react';
import { Card, Form, InputNumber, Button, message, Space, Divider, Alert, Spin, Input, Switch, Tabs } from 'antd';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import { getSystemConfig, updateSystemConfig } from '../../services/config';
import type { SystemConfig } from '../../services/config';

const { TabPane } = Tabs;
const { TextArea } = Input;

const Config: React.FC = () => {
  const [form] = Form.useForm();
  const [appForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<any>(null);

  // 加载配置
  const loadConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch('/admin-api/config/all', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`,
        },
      });
      const result = await response.json();
      
      if (result.success) {
        setConfig(result.data);
        
        // 设置系统配置表单
        if (result.data.system) {
          form.setFieldsValue(result.data.system);
        }
        
        // 设置应用配置表单
        appForm.setFieldsValue({
          app: result.data.app || {},
          watermark: result.data.watermark || {},
          brand: result.data.brand || {},
          legal: result.data.legal || {},
          features: result.data.features || {},
        });
      } else {
        message.error(result.message || '加载配置失败');
      }
    } catch (error: any) {
      message.error(error.message || '加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  // 保存系统配置
  const handleSaveSystem = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      
      const response = await fetch('/admin-api/config/system', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`,
        },
        body: JSON.stringify(values),
      });
      
      const result = await response.json();
      
      if (result.success) {
        message.success('系统配置保存成功');
        loadConfig();
      } else {
        message.error(result.message || '保存失败');
      }
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请检查表单填写');
      } else {
        message.error(error.message || '保存配置失败');
      }
    } finally {
      setSaving(false);
    }
  };

  // 保存应用配置
  const handleSaveApp = async () => {
    try {
      const values = await appForm.validateFields();
      setSaving(true);
      
      const response = await fetch('/admin-api/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`,
        },
        body: JSON.stringify(values),
      });
      
      const result = await response.json();
      
      if (result.success) {
        message.success('应用配置保存成功');
        loadConfig();
      } else {
        message.error(result.message || '保存失败');
      }
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请检查表单填写');
      } else {
        message.error(error.message || '保存配置失败');
      }
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  if (loading && !config) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <Alert
        message="系统配置"
        description="修改系统配置后将立即生效，请谨慎操作"
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Tabs defaultActiveKey="app">
        <TabPane tab="📱 应用配置" key="app">
          <Card
            title="应用基本信息"
            extra={
              <Space>
                <Button icon={<ReloadOutlined />} onClick={loadConfig}>
                  刷新
                </Button>
                <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveApp} loading={saving}>
                  保存配置
                </Button>
              </Space>
            }
          >
            <Form form={appForm} layout="vertical">
              <Divider orientation="left">小程序信息</Divider>
              
              <Form.Item
                label="小程序名称"
                name={['app', 'name']}
                rules={[{ required: true, message: '请输入小程序名称' }]}
                extra="当前使用的小程序名称，会显示在页面和水印中"
              >
                <Input placeholder="WhisperAI" />
              </Form.Item>

              <Form.Item
                label="备用名称"
                name={['app', 'alternateName']}
                extra="审核中的备用名称"
              >
                <Input placeholder="团圆照相馆" />
              </Form.Item>

              <Form.Item
                label="小程序描述"
                name={['app', 'description']}
              >
                <Input placeholder="AI智能照片生成" />
              </Form.Item>

              <Form.Item
                label="版本号"
                name={['app', 'version']}
              >
                <Input placeholder="1.0.0" />
              </Form.Item>

              <Divider orientation="left">水印配置</Divider>

              <Form.Item
                label="水印文字模板"
                name={['watermark', 'textTemplate']}
                extra="使用 {appName} 作为占位符，会自动替换为小程序名称"
              >
                <TextArea rows={2} placeholder="{appName}\n扫码去水印" />
              </Form.Item>

              <Form.Item
                label="二维码URL"
                name={['watermark', 'qrUrl']}
                extra="水印中二维码指向的URL"
              >
                <Input placeholder="https://your-domain.com/pay" />
              </Form.Item>

              <Form.Item
                label="水印位置"
                name={['watermark', 'position']}
              >
                <Input placeholder="center" />
              </Form.Item>

              <Form.Item
                label="水印透明度"
                name={['watermark', 'opacity']}
                extra="0-255，数值越大越不透明"
              >
                <InputNumber min={0} max={255} style={{ width: 200 }} />
              </Form.Item>

              <Divider orientation="left">品牌信息</Divider>

              <Form.Item
                label="品牌标语"
                name={['brand', 'slogan']}
              >
                <Input placeholder="AI智能照片生成" />
              </Form.Item>

              <Form.Item
                label="客服邮箱"
                name={['brand', 'customerServiceEmail']}
              >
                <Input placeholder="support@example.com" />
              </Form.Item>

              <Divider orientation="left">法律信息</Divider>

              <Form.Item
                label="公司名称"
                name={['legal', 'companyName']}
              >
                <Input placeholder="您的公司名称" />
              </Form.Item>

              <Form.Item
                label="备案号"
                name={['legal', 'icpNumber']}
              >
                <Input placeholder="京ICP备xxxxxxxx号" />
              </Form.Item>

              <Divider orientation="left">功能开关</Divider>

              <Form.Item
                label="启用邀请功能"
                name={['features', 'enableInvite']}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>

              <Form.Item
                label="启用付费功能"
                name={['features', 'enablePayment']}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>

              <Form.Item
                label="启用水印（免费用户）"
                name={['features', 'enableWatermark']}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </Form>
          </Card>
        </TabPane>

        <TabPane tab="⚙️ 系统配置" key="system">
          <Card
            title="系统参数配置"
            extra={
              <Space>
                <Button icon={<ReloadOutlined />} onClick={loadConfig}>
                  刷新
                </Button>
                <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveSystem} loading={saving}>
                  保存配置
                </Button>
              </Space>
            }
          >
            <Form form={form} layout="vertical">
              <Divider orientation="left">用户初始次数</Divider>
              
              <Form.Item
                label="拼图模式免费次数"
                name={['initialBalance', 'freePuzzle']}
                rules={[{ required: true, message: '请输入拼图模式免费次数' }]}
                extra="新用户注册时获得的拼图模式免费次数"
              >
                <InputNumber min={0} max={100} style={{ width: 200 }} />
              </Form.Item>

              <Form.Item
                label="变身模式免费次数"
                name={['initialBalance', 'freeTransform']}
                rules={[{ required: true, message: '请输入变身模式免费次数' }]}
                extra="新用户注册时获得的变身模式免费次数"
              >
                <InputNumber min={0} max={100} style={{ width: 200 }} />
              </Form.Item>

              <Divider orientation="left">邀请奖励</Divider>

              <Form.Item
                label="邀请奖励次数"
                name={['invite', 'rewardCount']}
                rules={[{ required: true, message: '请输入邀请奖励次数' }]}
                extra="成功邀请一个新用户获得的次数奖励"
              >
                <InputNumber min={0} max={10} style={{ width: 200 }} />
              </Form.Item>

              <Divider orientation="left">任务配置</Divider>

              <Form.Item
                label="任务超时时间（分钟）"
                name={['task', 'timeoutMinutes']}
                rules={[{ required: true, message: '请输入任务超时时间' }]}
                extra="任务执行超过此时间将被标记为超时"
              >
                <InputNumber min={5} max={120} style={{ width: 200 }} />
              </Form.Item>

              <Form.Item
                label="最大重试次数"
                name={['task', 'maxRetries']}
                rules={[{ required: true, message: '请输入最大重试次数' }]}
                extra="任务失败后的最大重试次数"
              >
                <InputNumber min={0} max={5} style={{ width: 200 }} />
              </Form.Item>

              <Divider orientation="left">订单配置</Divider>

              <Form.Item
                label="订单超时时间（小时）"
                name={['order', 'timeoutHours']}
                rules={[{ required: true, message: '请输入订单超时时间' }]}
                extra="未支付订单超过此时间将被自动关闭"
              >
                <InputNumber min={1} max={72} style={{ width: 200 }} />
              </Form.Item>

              <Divider orientation="left">监控配置</Divider>

              <Form.Item
                label="订单创建失败率阈值（%）"
                name={['monitor', 'orderFailureThreshold']}
                rules={[{ required: true, message: '请输入失败率阈值' }]}
                extra="超过此阈值将触发告警"
              >
                <InputNumber min={0} max={100} style={{ width: 200 }} />
              </Form.Item>

              <Form.Item
                label="回调处理失败率阈值（%）"
                name={['monitor', 'callbackFailureThreshold']}
                rules={[{ required: true, message: '请输入失败率阈值' }]}
                extra="超过此阈值将触发告警"
              >
                <InputNumber min={0} max={100} style={{ width: 200 }} />
              </Form.Item>

              <Form.Item
                label="数据库备份次数阈值"
                name={['monitor', 'dbBackupThreshold']}
                rules={[{ required: true, message: '请输入备份次数阈值' }]}
                extra="超过此阈值将触发严重告警"
              >
                <InputNumber min={1} max={100} style={{ width: 200 }} />
              </Form.Item>
            </Form>
          </Card>
        </TabPane>
      </Tabs>

      <Card title="📝 配置说明" style={{ marginTop: 24 }}>
        <ul>
          <li><strong>应用配置</strong>：小程序名称、水印、品牌信息等，修改后立即生效</li>
          <li><strong>小程序名称</strong>：会自动应用到页面标题、水印文字、隐私协议等位置</li>
          <li><strong>水印配置</strong>：仅对免费用户生效，付费用户无水印</li>
          <li><strong>系统配置</strong>：用户初始次数、邀请奖励、任务超时等参数</li>
          <li><strong>功能开关</strong>：可以快速启用或禁用某些功能</li>
        </ul>
      </Card>
    </div>
  );
};

export default Config;
