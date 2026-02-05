import React, { useState, useEffect } from 'react';
import {
  Table,
  Card,
  Tag,
  Button,
  Space,
  message,
  Modal,
  Statistic,
  Row,
  Col,
  Select,
  DatePicker,
} from 'antd';
import {
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  getCallbackLogs,
  getCallbackStats,
  resolveCallbackLog,
  retryCallbackLog,
  type CallbackLog,
} from '../../services/callbackLog';

const { RangePicker } = DatePicker;

const CallbackLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<CallbackLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<string>();
  const [dateRange, setDateRange] = useState<[string, string]>();
  const [stats, setStats] = useState<any>(null);

  // 加载数据
  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = { page, pageSize };
      if (status) params.status = status;
      if (dateRange) {
        params.startDate = dateRange[0];
        params.endDate = dateRange[1];
      }

      const result = await getCallbackLogs(params);
      setLogs(result.data.list);
      setTotal(result.data.total);
    } catch (error: any) {
      message.error('加载失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 加载统计
  const loadStats = async () => {
    try {
      const result = await getCallbackStats();
      setStats(result.data);
    } catch (error: any) {
      message.error('加载统计失败: ' + error.message);
    }
  };

  useEffect(() => {
    loadData();
    loadStats();
  }, [page, pageSize, status, dateRange]);

  // 标记为已解决
  const handleResolve = async (id: string) => {
    try {
      await resolveCallbackLog(id);
      message.success('已标记为解决');
      loadData();
      loadStats();
    } catch (error: any) {
      message.error('操作失败: ' + error.message);
    }
  };

  // 重试
  const handleRetry = async (id: string) => {
    try {
      const result = await retryCallbackLog(id);
      if (result.success) {
        message.success(result.message);
        loadData();
      } else {
        Modal.warning({
          title: '需要手动处理',
          content: result.message,
        });
      }
    } catch (error: any) {
      message.error('重试失败: ' + error.message);
    }
  };

  // 查看详情
  const showDetail = (record: CallbackLog) => {
    Modal.info({
      title: '回调详情',
      width: 800,
      content: (
        <div>
          <p><strong>订单号:</strong> {record.out_trade_no}</p>
          <p><strong>微信订单号:</strong> {record.transaction_id || '-'}</p>
          <p><strong>事件类型:</strong> {record.event_type || '-'}</p>
          <p><strong>状态:</strong> {getStatusTag(record.status)}</p>
          {record.error_message && (
            <>
              <p><strong>错误信息:</strong></p>
              <pre style={{ background: '#f5f5f5', padding: 10, borderRadius: 4 }}>
                {record.error_message}
              </pre>
            </>
          )}
          {record.request_data && (
            <>
              <p><strong>请求数据:</strong></p>
              <pre style={{ background: '#f5f5f5', padding: 10, borderRadius: 4, maxHeight: 200, overflow: 'auto' }}>
                {JSON.stringify(record.request_data, null, 2)}
              </pre>
            </>
          )}
          {record.response_data && (
            <>
              <p><strong>响应数据:</strong></p>
              <pre style={{ background: '#f5f5f5', padding: 10, borderRadius: 4, maxHeight: 200, overflow: 'auto' }}>
                {JSON.stringify(record.response_data, null, 2)}
              </pre>
            </>
          )}
        </div>
      ),
    });
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; icon: React.ReactNode; text: string }> = {
      success: { color: 'success', icon: <CheckCircleOutlined />, text: '成功' },
      decrypt_failed: { color: 'error', icon: <CloseCircleOutlined />, text: '解密失败' },
      process_failed: { color: 'warning', icon: <ExclamationCircleOutlined />, text: '处理失败' },
    };
    const config = statusMap[status] || { color: 'default', icon: null, text: status };
    return <Tag color={config.color} icon={config.icon}>{config.text}</Tag>;
  };

  const columns: ColumnsType<CallbackLog> = [
    {
      title: '订单号',
      dataIndex: 'out_trade_no',
      key: 'out_trade_no',
      width: 180,
    },
    {
      title: '微信订单号',
      dataIndex: 'transaction_id',
      key: 'transaction_id',
      width: 200,
      render: (text) => text || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => getStatusTag(status),
    },
    {
      title: '错误信息',
      dataIndex: 'error_message',
      key: 'error_message',
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: '重试次数',
      dataIndex: 'retry_count',
      key: 'retry_count',
      width: 100,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (text) => dayjs(text).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '解决时间',
      dataIndex: 'resolved_at',
      key: 'resolved_at',
      width: 180,
      render: (text) => text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => showDetail(record)}>
            详情
          </Button>
          {!record.resolved_at && record.status !== 'success' && (
            <>
              <Button size="small" onClick={() => handleRetry(record.id)}>
                重试
              </Button>
              <Button size="small" type="primary" onClick={() => handleResolve(record.id)}>
                标记解决
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h1>支付回调日志</h1>

      {/* 统计卡片 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="今日成功"
                value={stats.today.find((s: any) => s.status === 'success')?.count || 0}
                valueStyle={{ color: '#3f8600' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="今日解密失败"
                value={stats.today.find((s: any) => s.status === 'decrypt_failed')?.count || 0}
                valueStyle={{ color: '#cf1322' }}
                prefix={<CloseCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="今日处理失败"
                value={stats.today.find((s: any) => s.status === 'process_failed')?.count || 0}
                valueStyle={{ color: '#faad14' }}
                prefix={<ExclamationCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="未解决问题"
                value={stats.unresolved}
                valueStyle={{ color: stats.unresolved > 0 ? '#cf1322' : '#3f8600' }}
                prefix={<ExclamationCircleOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 筛选条件 */}
      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Select
            style={{ width: 150 }}
            placeholder="选择状态"
            allowClear
            value={status}
            onChange={setStatus}
          >
            <Select.Option value="success">成功</Select.Option>
            <Select.Option value="decrypt_failed">解密失败</Select.Option>
            <Select.Option value="process_failed">处理失败</Select.Option>
          </Select>
          <RangePicker
            onChange={(dates) => {
              if (dates) {
                setDateRange([
                  dates[0]!.format('YYYY-MM-DD'),
                  dates[1]!.format('YYYY-MM-DD'),
                ]);
              } else {
                setDateRange(undefined);
              }
            }}
          />
          <Button icon={<ReloadOutlined />} onClick={loadData}>
            刷新
          </Button>
        </Space>
      </Card>

      {/* 数据表格 */}
      <Card>
        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1500 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => {
              setPage(page);
              setPageSize(pageSize);
            },
          }}
        />
      </Card>
    </div>
  );
};

export default CallbackLogsPage;
