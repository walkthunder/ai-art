import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  Select,
  DatePicker,
  Modal,
  Form,
  message,
  Drawer,
  Descriptions,
  Statistic,
  Row,
  Col,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
  DollarOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// 配置 dayjs 时区
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');
import {
  getOrderList,
  getOrderDetail,
  updateOrderStatus,
  refundOrder,
  exportOrderData,
  getOrderStats,
  type Order,
  type PaymentOrder,
  type ProductOrder,
  type OrderStats
} from '../../services/order';

const { RangePicker } = DatePicker;
const { Option } = Select;

const Orders: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [orderType, setOrderType] = useState<'payment' | 'product' | 'all'>('all');
  const [status, setStatus] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [refundModalVisible, setRefundModalVisible] = useState(false);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [form] = Form.useForm();
  const [refundForm] = Form.useForm();

  // 加载订单列表
  const loadOrders = async () => {
    setLoading(true);
    try {
      const result = await getOrderList({
        page,
        pageSize,
        orderType,
        status: status || undefined,
        userId: userId || undefined,
        startDate: dateRange?.[0],
        endDate: dateRange?.[1],
        sortBy: 'created_at',
        sortOrder: 'DESC'
      });
      setOrders(result.orders);
      setTotal(result.pagination.total);
    } catch (error: any) {
      message.error(error.response?.data?.message || '加载订单列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载统计数据
  const loadStats = async () => {
    try {
      const result = await getOrderStats(dateRange?.[0], dateRange?.[1]);
      setStats(result);
    } catch (error: any) {
      console.error('加载统计数据失败:', error);
    }
  };

  useEffect(() => {
    loadOrders();
    loadStats();
  }, [page, pageSize, orderType, status, userId, dateRange]);

  // 查看订单详情
  const handleViewDetail = async (record: Order) => {
    try {
      const detail = await getOrderDetail(record.id, record.order_type);
      setSelectedOrder(detail);
      setDetailVisible(true);
    } catch (error: any) {
      message.error(error.response?.data?.message || '加载订单详情失败');
    }
  };

  // 更新订单状态
  const handleUpdateStatus = async () => {
    if (!selectedOrder) return;
    
    try {
      const values = await form.validateFields();
      await updateOrderStatus(selectedOrder.id, values.status, selectedOrder.order_type);
      message.success('订单状态更新成功');
      setStatusModalVisible(false);
      form.resetFields();
      loadOrders();
    } catch (error: any) {
      message.error(error.response?.data?.message || '更新订单状态失败');
    }
  };

  // 订单退款
  const handleRefund = async () => {
    if (!selectedOrder || selectedOrder.order_type !== 'payment') return;
    
    try {
      const values = await refundForm.validateFields();
      await refundOrder(selectedOrder.id, values.reason);
      message.success('退款成功');
      setRefundModalVisible(false);
      refundForm.resetFields();
      loadOrders();
    } catch (error: any) {
      message.error(error.response?.data?.message || '退款失败');
    }
  };

  // 导出订单
  const handleExport = async () => {
    try {
      await exportOrderData(orderType, dateRange?.[0], dateRange?.[1]);
      message.success('导出成功');
    } catch (error: any) {
      message.error('导出失败');
    }
  };

  // 订单状态标签
  const getStatusTag = (status: string, type: 'payment' | 'product') => {
    const paymentStatusMap: Record<string, { color: string; text: string }> = {
      pending: { color: 'default', text: '待支付' },
      paid: { color: 'success', text: '已支付' },
      failed: { color: 'error', text: '支付失败' },
      refunded: { color: 'warning', text: '已退款' }
    };

    const productStatusMap: Record<string, { color: string; text: string }> = {
      pending: { color: 'default', text: '待支付' },
      paid: { color: 'processing', text: '已支付' },
      exported: { color: 'cyan', text: '已导出' },
      shipped: { color: 'blue', text: '已发货' },
      delivered: { color: 'success', text: '已送达' },
      cancelled: { color: 'error', text: '已取消' }
    };

    const map = type === 'payment' ? paymentStatusMap : productStatusMap;
    const config = map[status] || { color: 'default', text: status };
    
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 支付订单列
  const paymentColumns: ColumnsType<PaymentOrder> = [
    {
      title: '订单ID',
      dataIndex: 'id',
      key: 'id',
      width: 200,
      ellipsis: true
    },
    {
      title: '用户ID',
      dataIndex: 'user_id',
      key: 'user_id',
      width: 200,
      ellipsis: true
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      render: (amount: number | string) => `¥${Number(amount).toFixed(2)}`
    },
    {
      title: '套餐类型',
      dataIndex: 'package_type',
      key: 'package_type',
      width: 100,
      render: (type: string) => {
        const typeMap: Record<string, string> = {
          free: '免费',
          basic: '基础版',
          premium: '高级版'
        };
        return typeMap[type] || type;
      }
    },
    {
      title: '支付方式',
      dataIndex: 'payment_method',
      key: 'payment_method',
      width: 100
    },
    {
      title: '交易类型',
      dataIndex: 'trade_type',
      key: 'trade_type',
      width: 100
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string, record) => getStatusTag(status, record.order_type)
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (date: string) => dayjs.utc(date).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleViewDetail(record)}>
            详情
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              setSelectedOrder(record);
              setStatusModalVisible(true);
            }}
          >
            更新状态
          </Button>
          {record.status === 'paid' && (
            <Button
              type="link"
              size="small"
              danger
              onClick={() => {
                setSelectedOrder(record);
                setRefundModalVisible(true);
              }}
            >
              退款
            </Button>
          )}
        </Space>
      )
    }
  ];

  // 产品订单列
  const productColumns: ColumnsType<ProductOrder> = [
    {
      title: '订单ID',
      dataIndex: 'id',
      key: 'id',
      width: 200,
      ellipsis: true
    },
    {
      title: '用户ID',
      dataIndex: 'user_id',
      key: 'user_id',
      width: 200,
      ellipsis: true
    },
    {
      title: '产品类型',
      dataIndex: 'product_type',
      key: 'product_type',
      width: 100,
      render: (type: string) => {
        const typeMap: Record<string, string> = {
          crystal: '晶瓷画',
          scroll: '卷轴'
        };
        return typeMap[type] || type;
      }
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      render: (amount: number | string) => `¥${Number(amount).toFixed(2)}`
    },
    {
      title: '收货人',
      dataIndex: 'shipping_name',
      key: 'shipping_name',
      width: 100
    },
    {
      title: '电话',
      dataIndex: 'shipping_phone',
      key: 'shipping_phone',
      width: 120
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string, record) => getStatusTag(status, record.order_type)
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (date: string) => dayjs.utc(date).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleViewDetail(record)}>
            详情
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              setSelectedOrder(record);
              setStatusModalVisible(true);
            }}
          >
            更新状态
          </Button>
        </Space>
      )
    }
  ];

  // 混合订单列
  const mixedColumns: ColumnsType<Order> = [
    {
      title: '订单ID',
      dataIndex: 'id',
      key: 'id',
      width: 200,
      ellipsis: true
    },
    {
      title: '订单类型',
      dataIndex: 'order_type',
      key: 'order_type',
      width: 100,
      render: (type: string) => (
        <Tag color={type === 'payment' ? 'blue' : 'green'}>
          {type === 'payment' ? '支付订单' : '产品订单'}
        </Tag>
      )
    },
    {
      title: '用户ID',
      dataIndex: 'user_id',
      key: 'user_id',
      width: 200,
      ellipsis: true
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      render: (amount: number | string) => `¥${Number(amount).toFixed(2)}`
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string, record) => getStatusTag(status, record.order_type)
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (date: string) => dayjs.utc(date).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleViewDetail(record)}>
            详情
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              setSelectedOrder(record);
              setStatusModalVisible(true);
            }}
          >
            更新状态
          </Button>
        </Space>
      )
    }
  ];

  const getColumns = () => {
    if (orderType === 'payment') return paymentColumns;
    if (orderType === 'product') return productColumns;
    return mixedColumns;
  };

  return (
    <div style={{ padding: '24px' }}>
      {/* 统计卡片 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="支付订单总数"
                value={stats.payment.total_count}
                prefix={<DollarOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="支付订单金额"
                value={stats.payment.total_amount}
                precision={2}
                prefix="¥"
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="产品订单总数"
                value={stats.product.total_count}
                prefix={<ShoppingOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="产品订单金额"
                value={stats.product.total_amount}
                precision={2}
                prefix="¥"
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 订单列表 */}
      <Card
        title="订单管理"
        extra={
          <Space>
            <Button icon={<ExportOutlined />} onClick={handleExport}>
              导出
            </Button>
            <Button icon={<ReloadOutlined />} onClick={loadOrders}>
              刷新
            </Button>
          </Space>
        }
      >
        {/* 筛选条件 */}
        <Space style={{ marginBottom: 16 }} wrap>
          <Select
            style={{ width: 150 }}
            placeholder="订单类型"
            value={orderType}
            onChange={setOrderType}
          >
            <Option value="all">全部订单</Option>
            <Option value="payment">支付订单</Option>
            <Option value="product">产品订单</Option>
          </Select>

          <Select
            style={{ width: 150 }}
            placeholder="订单状态"
            value={status}
            onChange={setStatus}
            allowClear
          >
            {orderType === 'payment' || orderType === 'all' ? (
              <>
                <Option value="pending">待支付</Option>
                <Option value="paid">已支付</Option>
                <Option value="failed">支付失败</Option>
                <Option value="refunded">已退款</Option>
              </>
            ) : null}
            {orderType === 'product' || orderType === 'all' ? (
              <>
                <Option value="exported">已导出</Option>
                <Option value="shipped">已发货</Option>
                <Option value="delivered">已送达</Option>
                <Option value="cancelled">已取消</Option>
              </>
            ) : null}
          </Select>

          <Input
            style={{ width: 200 }}
            placeholder="用户ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            prefix={<SearchOutlined />}
            allowClear
          />

          <RangePicker
            onChange={(dates) => {
              if (dates) {
                setDateRange([
                  dates[0]!.format('YYYY-MM-DD'),
                  dates[1]!.format('YYYY-MM-DD')
                ]);
              } else {
                setDateRange(null);
              }
            }}
          />

          <Button type="primary" icon={<SearchOutlined />} onClick={loadOrders}>
            搜索
          </Button>
        </Space>

        {/* 订单表格 */}
        <Table
          columns={getColumns() as any}
          dataSource={orders}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1500 }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => {
              setPage(page);
              setPageSize(pageSize);
            }
          }}
        />
      </Card>

      {/* 订单详情抽屉 */}
      <Drawer
        title="订单详情"
        width={600}
        open={detailVisible}
        onClose={() => setDetailVisible(false)}
      >
        {selectedOrder && (
          <Descriptions column={1} bordered>
            <Descriptions.Item label="订单ID">{selectedOrder.id}</Descriptions.Item>
            <Descriptions.Item label="订单类型">
              <Tag color={selectedOrder.order_type === 'payment' ? 'blue' : 'green'}>
                {selectedOrder.order_type === 'payment' ? '支付订单' : '产品订单'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="用户ID">{selectedOrder.user_id}</Descriptions.Item>
            <Descriptions.Item label="金额">¥{Number(selectedOrder.amount).toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="状态">
              {getStatusTag(selectedOrder.status, selectedOrder.order_type)}
            </Descriptions.Item>
            
            {selectedOrder.order_type === 'payment' && (
              <>
                <Descriptions.Item label="套餐类型">
                  {(selectedOrder as PaymentOrder).package_type}
                </Descriptions.Item>
                <Descriptions.Item label="支付方式">
                  {(selectedOrder as PaymentOrder).payment_method}
                </Descriptions.Item>
                <Descriptions.Item label="交易类型">
                  {(selectedOrder as PaymentOrder).trade_type}
                </Descriptions.Item>
                <Descriptions.Item label="交易ID">
                  {(selectedOrder as PaymentOrder).transaction_id || '-'}
                </Descriptions.Item>
              </>
            )}
            
            {selectedOrder.order_type === 'product' && (
              <>
                <Descriptions.Item label="产品类型">
                  {(selectedOrder as ProductOrder).product_type === 'crystal' ? '晶瓷画' : '卷轴'}
                </Descriptions.Item>
                <Descriptions.Item label="收货人">
                  {(selectedOrder as ProductOrder).shipping_name}
                </Descriptions.Item>
                <Descriptions.Item label="联系电话">
                  {(selectedOrder as ProductOrder).shipping_phone}
                </Descriptions.Item>
                <Descriptions.Item label="收货地址">
                  {(selectedOrder as ProductOrder).shipping_address}
                </Descriptions.Item>
              </>
            )}
            
            <Descriptions.Item label="创建时间">
              {dayjs.utc(selectedOrder.created_at).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {dayjs.utc(selectedOrder.updated_at).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

      {/* 更新状态弹窗 */}
      <Modal
        title="更新订单状态"
        open={statusModalVisible}
        onOk={handleUpdateStatus}
        onCancel={() => {
          setStatusModalVisible(false);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="status"
            label="订单状态"
            rules={[{ required: true, message: '请选择订单状态' }]}
          >
            <Select placeholder="请选择订单状态">
              {selectedOrder?.order_type === 'payment' ? (
                <>
                  <Option value="pending">待支付</Option>
                  <Option value="paid">已支付</Option>
                  <Option value="failed">支付失败</Option>
                  <Option value="refunded">已退款</Option>
                </>
              ) : (
                <>
                  <Option value="pending">待支付</Option>
                  <Option value="paid">已支付</Option>
                  <Option value="exported">已导出</Option>
                  <Option value="shipped">已发货</Option>
                  <Option value="delivered">已送达</Option>
                  <Option value="cancelled">已取消</Option>
                </>
              )}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 退款弹窗 */}
      <Modal
        title="订单退款"
        open={refundModalVisible}
        onOk={handleRefund}
        onCancel={() => {
          setRefundModalVisible(false);
          refundForm.resetFields();
        }}
      >
        <Form form={refundForm} layout="vertical">
          <Form.Item
            name="reason"
            label="退款原因"
            rules={[{ required: true, message: '请输入退款原因' }]}
          >
            <Input.TextArea rows={4} placeholder="请输入退款原因" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Orders;
