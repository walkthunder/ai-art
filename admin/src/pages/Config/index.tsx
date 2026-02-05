import React, { useState, useEffect } from 'react';
import { Card, Form, InputNumber, Button, message, Space, Divider, Alert, Spin } from 'antd';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import { getSystemConfig, updateSystemConfig } from '../../services/config';
import type { SystemConfig } from '../../services/config';

const Config: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<SystemConfig | null>(null);

  // 加载配置
  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await getSystemConfig();
      setConfig(data);
      form.setFieldsValue(data);
    } catch (error: any) {
      message.error(error.message || '加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  // 保存配置
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await updateSystemConfig(values);
      message.success('配置保存成功');
      loadConfig();
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

      <Card
        title="⚙️ 系统参数配置"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadConfig}>
              刷新
            </Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
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

      <Card title="📝 配置说明" style={{ marginTop: 24 }}>
        <ul>
          <li>所有配置修改后立即生效，无需重启服务</li>
          <li>用户初始次数：新用户注册时自动分配</li>
          <li>邀请奖励：成功邀请新用户后邀请人获得的奖励</li>
          <li>任务超时：超时任务将自动恢复用户次数</li>
          <li>订单超时：超时订单将自动关闭，释放资源</li>
          <li>监控阈值：用于触发系统告警，及时发现问题</li>
        </ul>
      </Card>
    </div>
  );
};

export default Config;
