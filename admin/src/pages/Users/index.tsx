/**
 * 用户管理页面
 */

import React, { useState, useEffect } from 'react';
import { 
  Table, 
  Input, 
  Select, 
  Button, 
  Tag, 
  Space, 
  Drawer, 
  Descriptions, 
  Timeline, 
  message,
  Modal
} from 'antd';
import { 
  SearchOutlined, 
  DownloadOutlined, 
  EyeOutlined, 
  EditOutlined 
} from '@ant-design/icons';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// 配置 dayjs 时区
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');
import type { ColumnsType } from 'antd/es/table';
import {
  getUserList,
  getUserDetail,
  updateUserPaymentStatus,
  exportUsers,
  type User,
  type UserDetail,
  type UserListParams
} from '../../services/user';

const { Search } = Input;
const { Option } = Select;

const PAYMENT_STATUS_MAP: Record<string, { text: string; color: string }> = {
  free: { text: '免费版', color: 'default' },
  basic: { text: '尝鲜包', color: 'blue' },
  premium: { text: '尊享包', color: 'gold' }
};

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0
  });
  const [filters, setFilters] = useState<UserListParams>({
    search: '',
    paymentStatus: ''
  });
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ user: User; generations: Generation[]; orders: Order[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [pagination.current, pagination.pageSize, filters]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await getUserList({
        page: pagination.current,
        pageSize: pagination.pageSize,
        ...filters
      });
      setUsers(data.users);
      setPagination(prev => ({
        ...prev,
        total: data.pagination.total
      }));
    } catch (error: any) {
      message.error(error.response?.data?.message || '加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setFilters(prev => ({ ...prev, search: value }));
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handleViewDetail = async (userId: string) => {
    setDetailLoading(true);
    setDetailVisible(true);
    try {
      const detail = await getUserDetail(userId);
      setSelectedUser(detail);
    } catch (error: any) {
      message.error('加载用户详情失败');
      setDetailVisible(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleUpdatePaymentStatus = (userId: string, currentStatus: string) => {
    Modal.confirm({
      title: '修改付费状态',
      content: (
        <Select
          defaultValue={currentStatus}
          style={{ width: '100%', marginTop: 16 }}
          id="payment-status-select"
        >
          <Option value="free">免费版</Option>
          <Option value="basic">尝鲜包</Option>
          <Option value="premium">尊享包</Option>
        </Select>
      ),
      onOk: async () => {
        const select = document.getElementById('payment-status-select') as HTMLSelectElement;
        const newStatus = select?.value || currentStatus;
        if (newStatus === currentStatus) return;
        
        try {
          await updateUserPaymentStatus(userId, newStatus as any);
          message.success('付费状态更新成功');
          loadUsers();
          if (selectedUser?.user.id === userId) {
            handleViewDetail(userId);
          }
        } catch (error: any) {
          message.error(error.response?.data?.message || '更新失败');
        }
      }
    });
  };

  const handleExport = async () => {
    try {
      message.loading('正在导出...', 0);
      const blob = await exportUsers(filters);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      message.destroy();
      message.success('导出成功');
    } catch (error: any) {
      message.destroy();
      message.error('导出失败');
    }
  };

  const columns: ColumnsType<User> = [
    {
      title: '用户ID',
      dataIndex: 'id',
      key: 'id',
      width: 200,
      ellipsis: true
    },
    {
      title: 'OpenID',
      dataIndex: 'openid',
      key: 'openid',
      width: 150,
      ellipsis: true,
      render: (openid) => openid || '-'
    },
    {
      title: '付费状态',
      dataIndex: 'payment_status',
      key: 'payment_status',
      width: 100,
      render: (status: string) => {
        const config = PAYMENT_STATUS_MAP[status];
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: '剩余次数',
      dataIndex: 'regenerate_count',
      key: 'regenerate_count',
      width: 100
    },
    {
      title: '生成次数',
      dataIndex: 'generation_count',
      key: 'generation_count',
      width: 100
    },
    {
      title: '订单数量',
      dataIndex: 'order_count',
      key: 'order_count',
      width: 100
    },
    {
      title: '注册时间',
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
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record.id)}
          >
            详情
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleUpdatePaymentStatus(record.id, record.payment_status)}
          >
            修改状态
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
        <Search
          placeholder="搜索用户ID或OpenID"
          allowClear
          onSearch={handleSearch}
          style={{ width: 300 }}
          prefix={<SearchOutlined />}
        />
        <Select
          placeholder="付费状态"
          allowClear
          style={{ width: 150 }}
          onChange={(value) => handleFilterChange('paymentStatus', value || '')}
        >
          <Option value="free">免费版</Option>
          <Option value="basic">尝鲜包</Option>
          <Option value="premium">尊享包</Option>
        </Select>
        <Button
          icon={<DownloadOutlined />}
          onClick={handleExport}
        >
          导出数据
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条记录`,
          onChange: (page, pageSize) => {
            setPagination(prev => ({ ...prev, current: page, pageSize }));
          }
        }}
        scroll={{ x: 1200 }}
      />

      <Drawer
        title="用户详情"
        placement="right"
        width={720}
        onClose={() => setDetailVisible(false)}
        open={detailVisible}
        loading={detailLoading}
      >
        {selectedUser && (
          <div>
            <Descriptions title="基本信息" bordered column={2}>
              <Descriptions.Item label="用户ID" span={2}>
                {selectedUser.user.id}
              </Descriptions.Item>
              <Descriptions.Item label="OpenID" span={2}>
                {selectedUser.user.openid || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="付费状态">
                <Tag color={PAYMENT_STATUS_MAP[selectedUser.user.payment_status].color}>
                  {PAYMENT_STATUS_MAP[selectedUser.user.payment_status].text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="剩余次数">
                {selectedUser.user.regenerate_count}
              </Descriptions.Item>
              <Descriptions.Item label="生成次数">
                {selectedUser.user.generation_count}
              </Descriptions.Item>
              <Descriptions.Item label="订单数量">
                {selectedUser.user.order_count}
              </Descriptions.Item>
              <Descriptions.Item label="注册时间" span={2}>
                {dayjs.utc(selectedUser.user.created_at).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
            </Descriptions>

            <div style={{ marginTop: 24 }}>
              <h3>生成历史（最近10条）</h3>
              <Timeline
                items={selectedUser.generations.map(gen => ({
                  children: (
                    <div>
                      <div>模式: {gen.mode} | 状态: {gen.status}</div>
                      <div style={{ fontSize: 12, color: '#999' }}>
                        {dayjs.utc(gen.created_at).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')}
                      </div>
                    </div>
                  )
                }))}
              />
            </div>

            <div style={{ marginTop: 24 }}>
              <h3>订单记录（最近10条）</h3>
              <Timeline
                items={selectedUser.orders.map(order => ({
                  children: (
                    <div>
                      <div>
                        {order.package_type} | ¥{order.amount} | {order.status}
                      </div>
                      <div style={{ fontSize: 12, color: '#999' }}>
                        {dayjs.utc(order.created_at).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')}
                      </div>
                    </div>
                  )
                }))}
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default UsersPage;
