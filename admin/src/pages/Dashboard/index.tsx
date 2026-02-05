import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Spin, Select, message } from 'antd';
import {
  UserOutlined,
  DollarOutlined,
  ShoppingOutlined,
  PictureOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { getDashboardData, getTrendData, type DashboardData, type TrendData } from '../../services/stats';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// 配置 dayjs 时区
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');

const { Option } = Select;

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [trendDays, setTrendDays] = useState<number>(7);
  const [trendData, setTrendData] = useState<TrendData | null>(null);

  // 加载看板数据
  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const data = await getDashboardData();
      setDashboardData(data);
      setTrendData(data.trends);
    } catch (error: any) {
      message.error(error.response?.data?.message || '加载看板数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载趋势数据
  const loadTrendData = async (days: number) => {
    try {
      const data = await getTrendData(days);
      setTrendData(data);
    } catch (error: any) {
      message.error('加载趋势数据失败');
    }
  };

  useEffect(() => {
    loadDashboardData();
    
    // 自动刷新（30秒）
    const interval = setInterval(() => {
      loadDashboardData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (dashboardData) {
      loadTrendData(trendDays);
    }
  }, [trendDays]);

  // 用户增长趋势图配置
  const getUserTrendOption = () => {
    if (!trendData) return {};

    return {
      title: { text: '用户增长趋势' },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: trendData.users.map(item => dayjs.utc(item.date).tz('Asia/Shanghai').format('MM-DD'))
      },
      yAxis: { type: 'value' },
      series: [{
        data: trendData.users.map(item => item.count),
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.3 }
      }]
    };
  };

  // 收入趋势图配置
  const getRevenueTrendOption = () => {
    if (!trendData) return {};

    return {
      title: { text: '收入趋势' },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const item = params[0];
          return `${item.name}<br/>收入: ¥${item.value.toFixed(2)}`;
        }
      },
      xAxis: {
        type: 'category',
        data: trendData.revenue.map(item => dayjs.utc(item.date).tz('Asia/Shanghai').format('MM-DD'))
      },
      yAxis: { type: 'value' },
      series: [{
        data: trendData.revenue.map(item => item.revenue),
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.3 },
        itemStyle: { color: '#52c41a' }
      }]
    };
  };

  // 用户分布饼图配置
  const getUserDistributionOption = () => {
    if (!dashboardData) return {};

    const statusMap: Record<string, string> = {
      free: '免费用户',
      basic: '基础版',
      premium: '高级版'
    };

    return {
      title: { text: '用户分布', left: 'center' },
      tooltip: { trigger: 'item' },
      legend: { orient: 'vertical', left: 'left' },
      series: [{
        type: 'pie',
        radius: '50%',
        data: dashboardData.userDistribution.map(item => ({
          name: statusMap[item.status] || item.status,
          value: item.count
        })),
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }]
    };
  };

  // 套餐销售分布图配置
  const getPackageDistributionOption = () => {
    if (!dashboardData) return {};

    const packageMap: Record<string, string> = {
      free: '免费',
      basic: '基础版',
      premium: '高级版'
    };

    return {
      title: { text: '套餐销售分布', left: 'center' },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          return `${params.name}<br/>订单数: ${params.value}<br/>收入: ¥${params.data.revenue.toFixed(2)}`;
        }
      },
      legend: { orient: 'vertical', left: 'left' },
      series: [{
        type: 'pie',
        radius: '50%',
        data: dashboardData.packageDistribution.map(item => ({
          name: packageMap[item.package] || item.package,
          value: item.count,
          revenue: item.revenue
        })),
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        }
      }]
    };
  };

  if (loading && !dashboardData) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* 今日数据统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日新增用户"
              value={dashboardData?.today.newUsers || 0}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#3f8600' }}
              suffix={<ArrowUpOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日收入"
              value={dashboardData?.today.revenue || 0}
              precision={2}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#cf1322' }}
              suffix="元"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日订单"
              value={dashboardData?.today.orders || 0}
              prefix={<ShoppingOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日生成次数"
              value={dashboardData?.today.generations || 0}
              prefix={<PictureOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 趋势图表 */}
      <Card
        title="数据趋势"
        extra={
          <Select
            value={trendDays}
            onChange={setTrendDays}
            style={{ width: 120 }}
          >
            <Option value={7}>最近7天</Option>
            <Option value={30}>最近30天</Option>
          </Select>
        }
        style={{ marginBottom: 24 }}
      >
        <Row gutter={16}>
          <Col span={12}>
            {trendData && <ReactECharts option={getUserTrendOption()} style={{ height: 300 }} />}
          </Col>
          <Col span={12}>
            {trendData && <ReactECharts option={getRevenueTrendOption()} style={{ height: 300 }} />}
          </Col>
        </Row>
      </Card>

      {/* 分布图表 */}
      <Row gutter={16}>
        <Col span={12}>
          <Card>
            {dashboardData && <ReactECharts option={getUserDistributionOption()} style={{ height: 300 }} />}
          </Card>
        </Col>
        <Col span={12}>
          <Card>
            {dashboardData && <ReactECharts option={getPackageDistributionOption()} style={{ height: 300 }} />}
          </Card>
        </Col>
      </Row>

      {/* 热门模板 */}
      {dashboardData && dashboardData.popularTemplates.length > 0 && (
        <Card title="热门模板 TOP 10" style={{ marginTop: 24 }}>
          <Row gutter={[16, 16]}>
            {dashboardData.popularTemplates.map((template, index) => (
              <Col span={24} key={index}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    <span style={{ fontWeight: 'bold', marginRight: 8 }}>#{index + 1}</span>
                    {template.template.split('/').pop() || template.template}
                  </span>
                  <span style={{ color: '#999' }}>使用次数: {template.count}</span>
                </div>
              </Col>
            ))}
          </Row>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
