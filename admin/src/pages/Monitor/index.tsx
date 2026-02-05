import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Alert, Button, Space, Tag, Progress, message, Spin } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  ReloadOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { getMonitorMetrics, getMonitorAlerts, getMonitorHealth, resetMonitorMetrics } from '../../services/monitor';
import type { MonitorMetrics, MonitorAlert, HealthStatus } from '../../services/monitor';

const Monitor: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<MonitorMetrics | null>(null);
  const [alerts, setAlerts] = useState<MonitorAlert[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);

  // 加载监控数据
  const loadMonitorData = async () => {
    setLoading(true);
    try {
      const [metricsData, alertsData, healthData] = await Promise.all([
        getMonitorMetrics(),
        getMonitorAlerts(),
        getMonitorHealth(),
      ]);
      setMetrics(metricsData);
      setAlerts(alertsData);
      setHealth(healthData);
    } catch (error: any) {
      message.error(error.message || '加载监控数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 重置指标
  const handleReset = async () => {
    try {
      await resetMonitorMetrics();
      message.success('指标已重置');
      loadMonitorData();
    } catch (error: any) {
      message.error(error.message || '重置失败');
    }
  };

  useEffect(() => {
    loadMonitorData();

    // 自动刷新（10秒）
    const interval = setInterval(() => {
      loadMonitorData();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  if (loading && !metrics) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  // 计算失败率颜色
  const getFailureRateColor = (rate: string) => {
    const numRate = parseFloat(rate);
    if (numRate === 0) return '#52c41a';
    if (numRate < 5) return '#faad14';
    return '#f5222d';
  };

  // 获取健康状态标签
  const getHealthTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      healthy: { color: 'success', text: '健康' },
      warning: { color: 'warning', text: '警告' },
      error: { color: 'error', text: '异常' },
    };
    const config = statusMap[status] || { color: 'default', text: '未知' };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  return (
    <div style={{ padding: '24px' }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>
          <DashboardOutlined /> 系统监控
        </h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadMonitorData}>
            刷新
          </Button>
          <Button onClick={handleReset}>重置指标</Button>
        </Space>
      </div>

      {/* 健康状态 */}
      {health && (
        <Alert
          message={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>系统状态：</span>
              {getHealthTag(health.status)}
              <span style={{ marginLeft: 16 }}>上次重置：{new Date(health.lastReset).toLocaleString('zh-CN')}</span>
            </div>
          }
          type={health.status === 'healthy' ? 'success' : health.status === 'warning' ? 'warning' : 'error'}
          style={{ marginBottom: 24 }}
        />
      )}

      {/* 告警信息 */}
      {alerts.length > 0 && (
        <Card title="⚠️ 告警信息" style={{ marginBottom: 24 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            {alerts.map((alert, index) => (
              <Alert
                key={index}
                message={alert.message}
                description={
                  <div>
                    <div>类型：{alert.type}</div>
                    {alert.data && (
                      <div style={{ marginTop: 8 }}>
                        详情：
                        {Object.entries(alert.data).map(([key, value]) => (
                          <span key={key} style={{ marginLeft: 8 }}>
                            {key}: {value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                }
                type={alert.level === 'critical' ? 'error' : 'warning'}
                showIcon
                icon={alert.level === 'critical' ? <CloseCircleOutlined /> : <WarningOutlined />}
              />
            ))}
          </Space>
        </Card>
      )}

      {/* 订单创建监控 */}
      <Card title="📦 订单创建监控" style={{ marginBottom: 24 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="成功创建"
              value={metrics?.orderCreated || 0}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="创建失败"
              value={metrics?.orderCreateFailed || 0}
              prefix={<CloseCircleOutlined style={{ color: '#f5222d' }} />}
              valueStyle={{ color: '#f5222d' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="失败率"
              value={metrics?.orderCreateFailureRate || '0%'}
              valueStyle={{ color: getFailureRateColor(metrics?.orderCreateFailureRate || '0%') }}
            />
          </Col>
          <Col span={6}>
            <div style={{ padding: '8px 0' }}>
              <div style={{ marginBottom: 8, color: 'rgba(0, 0, 0, 0.45)' }}>成功率</div>
              <Progress
                percent={100 - parseFloat(metrics?.orderCreateFailureRate || '0')}
                status={parseFloat(metrics?.orderCreateFailureRate || '0') > 5 ? 'exception' : 'success'}
                strokeColor={parseFloat(metrics?.orderCreateFailureRate || '0') > 5 ? '#f5222d' : '#52c41a'}
              />
            </div>
          </Col>
        </Row>
      </Card>

      {/* 回调处理监控 */}
      <Card title="🔔 回调处理监控" style={{ marginBottom: 24 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="处理成功"
              value={metrics?.callbackSuccess || 0}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="处理失败"
              value={metrics?.callbackFailed || 0}
              prefix={<CloseCircleOutlined style={{ color: '#f5222d' }} />}
              valueStyle={{ color: '#f5222d' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="失败率"
              value={metrics?.callbackFailureRate || '0%'}
              valueStyle={{ color: getFailureRateColor(metrics?.callbackFailureRate || '0%') }}
            />
          </Col>
          <Col span={6}>
            <div style={{ padding: '8px 0' }}>
              <div style={{ marginBottom: 8, color: 'rgba(0, 0, 0, 0.45)' }}>成功率</div>
              <Progress
                percent={100 - parseFloat(metrics?.callbackFailureRate || '0')}
                status={parseFloat(metrics?.callbackFailureRate || '0') > 5 ? 'exception' : 'success'}
                strokeColor={parseFloat(metrics?.callbackFailureRate || '0') > 5 ? '#f5222d' : '#52c41a'}
              />
            </div>
          </Col>
        </Row>
      </Card>

      {/* 数据库监控 */}
      <Card title="💾 数据库监控">
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="备份次数"
              value={metrics?.dbBackup || 0}
              prefix={<WarningOutlined style={{ color: metrics && metrics.dbBackup > 10 ? '#f5222d' : '#1890ff' }} />}
              valueStyle={{ color: metrics && metrics.dbBackup > 10 ? '#f5222d' : '#1890ff' }}
            />
          </Col>
          <Col span={16}>
            {metrics && metrics.dbBackup > 10 && (
              <Alert
                message="数据库故障频繁"
                description="备份次数超过阈值，请检查数据库连接状态"
                type="error"
                showIcon
              />
            )}
            {metrics && metrics.dbBackup <= 10 && metrics.dbBackup > 0 && (
              <Alert
                message="数据库运行正常"
                description={`当前备份次数：${metrics.dbBackup}，低于告警阈值`}
                type="success"
                showIcon
              />
            )}
            {metrics && metrics.dbBackup === 0 && (
              <Alert
                message="数据库运行稳定"
                description="本周期内无备份记录，系统运行良好"
                type="success"
                showIcon
              />
            )}
          </Col>
        </Row>
      </Card>

      {/* 监控说明 */}
      <Card title="📖 监控说明" style={{ marginTop: 24 }}>
        <ul>
          <li>指标每小时自动重置一次</li>
          <li>订单创建失败率 &gt; 5% 时触发警告</li>
          <li>回调处理失败率 &gt; 5% 时触发警告</li>
          <li>数据库备份次数 &gt; 10 时触发严重告警</li>
          <li>页面每10秒自动刷新数据</li>
        </ul>
      </Card>
    </div>
  );
};

export default Monitor;
