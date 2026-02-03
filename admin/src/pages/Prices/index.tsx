/**
 * 价格配置管理页面
 */

import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, DatePicker, Select, message, Space, Tag, Card, Statistic, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, HistoryOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// 配置 dayjs 时区
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');
import type { ColumnsType } from 'antd/es/table';
import { 
  getAllPrices, 
  getCurrentPrices, 
  createPrice, 
  updatePrice, 
  deactivatePrice,
  getPriceHistory,
  type PriceConfig,
  type PriceHistory 
} from '../../services/price';

const { Option } = Select;

const CATEGORY_MAP: Record<string, string> = {
  package: '套餐',
  product: '产品',
  service: '服务'
};

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  active: { text: '启用', color: 'green' },
  inactive: { text: '停用', color: 'red' },
  scheduled: { text: '待生效', color: 'orange' }
};

const PricesPage: React.FC = () => {
  const [prices, setPrices] = useState<PriceConfig[]>([]);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [editingPrice, setEditingPrice] = useState<PriceConfig | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    loadPrices();
    loadCurrentPrices();
  }, []);

  const loadPrices = async () => {
    setLoading(true);
    try {
      const data = await getAllPrices();
      setPrices(data);
    } catch (error: any) {
      message.error(error.message || '加载价格配置失败');
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentPrices = async () => {
    try {
      const data = await getCurrentPrices();
      setCurrentPrices(data);
    } catch (error: any) {
      message.error('加载当前价格失败');
    }
  };

  const handleCreate = () => {
    setEditingPrice(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: PriceConfig) => {
    setEditingPrice(record);
    form.setFieldsValue({
      category: record.category,
      code: record.code,
      name: record.name,
      price: record.price,
      description: record.description,
      effectiveDate: dayjs(record.effective_date)
    });
    setModalVisible(true);
  };

  const handleViewHistory = async (id: string) => {
    try {
      const history = await getPriceHistory(id);
      setPriceHistory(history);
      setHistoryModalVisible(true);
    } catch (error: any) {
      message.error('加载价格历史失败');
    }
  };

  const handleDeactivate = async (id: string) => {
    Modal.confirm({
      title: '确认停用',
      content: '确定要停用此价格配置吗？',
      onOk: async () => {
        try {
          await deactivatePrice(id);
          message.success('停用成功');
          loadPrices();
          loadCurrentPrices();
        } catch (error: any) {
          message.error(error.message || '停用失败');
        }
      }
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const data = {
        category: values.category,
        code: values.code,
        name: values.name,
        price: values.price,
        description: values.description,
        effectiveDate: values.effectiveDate?.format('YYYY-MM-DD HH:mm:ss')
      };

      if (editingPrice) {
        await updatePrice(editingPrice.id, {
          price: data.price,
          description: data.description,
          effectiveDate: data.effectiveDate
        });
        message.success('更新成功');
      } else {
        await createPrice(data);
        message.success('创建成功');
      }

      setModalVisible(false);
      loadPrices();
      loadCurrentPrices();
    } catch (error: any) {
      if (error.errorFields) {
        return;
      }
      message.error(error.message || '操作失败');
    }
  };

  const columns: ColumnsType<PriceConfig> = [
    {
      title: '类别',
      dataIndex: 'category',
      key: 'category',
      width: 80,
      render: (category: string) => CATEGORY_MAP[category] || category
    },
    {
      title: '代码',
      dataIndex: 'code',
      key: 'code',
      width: 150
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 120
    },
    {
      title: '价格（元）',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (price: number) => `¥${Number(price).toFixed(2)}`
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 150,
      ellipsis: true
    },
    {
      title: '生效时间',
      dataIndex: 'effective_date',
      key: 'effective_date',
      width: 180,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => {
        const config = STATUS_MAP[status] || { text: status, color: 'default' };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
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
          <Button 
            type="link" 
            size="small"
            icon={<EditOutlined />} 
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Button 
            type="link" 
            size="small"
            icon={<HistoryOutlined />} 
            onClick={() => handleViewHistory(record.id)}
          >
            历史
          </Button>
          {record.status === 'active' && (
            <Button 
              type="link" 
              size="small"
              danger 
              icon={<DeleteOutlined />} 
              onClick={() => handleDeactivate(record.id)}
            >
              停用
            </Button>
          )}
        </Space>
      )
    }
  ];

  const historyColumns: ColumnsType<PriceHistory> = [
    {
      title: '变更时间',
      dataIndex: 'changed_at',
      key: 'changed_at',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '原价格',
      dataIndex: 'old_price',
      key: 'old_price',
      render: (price: number | null) => price !== null ? `¥${Number(price).toFixed(2)}` : '-'
    },
    {
      title: '新价格',
      dataIndex: 'new_price',
      key: 'new_price',
      render: (price: number) => `¥${Number(price).toFixed(2)}`
    },
    {
      title: '变更人',
      dataIndex: 'changed_by',
      key: 'changed_by'
    },
    {
      title: '变更原因',
      dataIndex: 'change_reason',
      key: 'change_reason'
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Card>
              <Statistic 
                title="免费版当前价格" 
                value={currentPrices.free || 0} 
                prefix="¥" 
                precision={2}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic 
                title="尝鲜包当前价格" 
                value={currentPrices.basic || 0} 
                prefix="¥" 
                precision={2}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic 
                title="尊享包当前价格" 
                value={currentPrices.premium || 0} 
                prefix="¥" 
                precision={2}
              />
            </Card>
          </Col>
        </Row>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新建价格配置
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={prices}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 1300 }}
      />

      <Modal
        title={editingPrice ? '编辑价格配置' : '新建价格配置'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="category"
            label="类别"
            rules={[{ required: true, message: '请选择类别' }]}
          >
            <Select placeholder="请选择类别" disabled={!!editingPrice}>
              <Option value="package">套餐</Option>
              <Option value="product">产品</Option>
              <Option value="service">服务</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="code"
            label="代码"
            rules={[{ required: true, message: '请输入代码' }]}
          >
            <Input placeholder="如: basic_package" disabled={!!editingPrice} />
          </Form.Item>

          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如: 尝鲜包" disabled={!!editingPrice} />
          </Form.Item>

          <Form.Item
            name="price"
            label="价格（元）"
            rules={[
              { required: true, message: '请输入价格' },
              { type: 'number', min: 0, message: '价格不能为负数' }
            ]}
          >
            <InputNumber 
              placeholder="请输入价格" 
              step={0.01} 
              precision={2}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            name="description"
            label="描述"
          >
            <Input.TextArea placeholder="请输入描述" rows={3} />
          </Form.Item>

          <Form.Item
            name="effectiveDate"
            label="生效时间"
          >
            <DatePicker 
              showTime 
              format="YYYY-MM-DD HH:mm:ss" 
              style={{ width: '100%' }}
              placeholder="留空则立即生效"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="价格变更历史"
        open={historyModalVisible}
        onCancel={() => setHistoryModalVisible(false)}
        footer={null}
        width={800}
      >
        <Table
          columns={historyColumns}
          dataSource={priceHistory}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Modal>
    </div>
  );
};

export default PricesPage;
