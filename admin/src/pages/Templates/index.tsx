/**
 * 模板管理页面
 */

import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Space, Tag, Card, Image, InputNumber } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getAllTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type Template
} from '../../services/template';

const { Option } = Select;
const { TextArea } = Input;

const MODE_MAP: Record<string, string> = {
  puzzle: '时空拼图',
  transform: '富贵变身',
  caishen: '财神变身'
};

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  active: { text: '启用', color: 'green' },
  inactive: { text: '停用', color: 'red' }
};

const TemplatesPage: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await getAllTemplates();
      setTemplates(data);
    } catch (error: any) {
      message.error(error.message || '加载模板列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Template) => {
    setEditingTemplate(record);
    form.setFieldsValue({
      mode: record.mode,
      code: record.code,
      name: record.name,
      imageUrl: record.image_url,
      prompt: record.prompt,
      category: record.category,
      duration: record.duration,
      sortOrder: record.sort_order,
      status: record.status
    });
    setModalVisible(true);
  };

  const handlePreview = (record: Template) => {
    setPreviewTemplate(record);
    setPreviewVisible(true);
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除此模板吗？此操作不可恢复。',
      onOk: async () => {
        try {
          await deleteTemplate(id);
          message.success('删除成功');
          loadTemplates();
        } catch (error: any) {
          message.error(error.message || '删除失败');
        }
      }
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingTemplate) {
        await updateTemplate(editingTemplate.id, {
          name: values.name,
          imageUrl: values.imageUrl,
          prompt: values.prompt,
          category: values.category,
          duration: values.duration,
          sortOrder: values.sortOrder,
          status: values.status
        });
        message.success('更新成功');
      } else {
        await createTemplate({
          mode: values.mode,
          code: values.code,
          name: values.name,
          imageUrl: values.imageUrl,
          prompt: values.prompt,
          category: values.category,
          duration: values.duration,
          sortOrder: values.sortOrder,
          status: values.status
        });
        message.success('创建成功');
      }

      setModalVisible(false);
      loadTemplates();
    } catch (error: any) {
      if (error.errorFields) {
        return;
      }
      message.error(error.message || '操作失败');
    }
  };

  const columns: ColumnsType<Template> = [
    {
      title: '模式',
      dataIndex: 'mode',
      key: 'mode',
      width: 100,
      render: (mode: string) => MODE_MAP[mode] || mode
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
      title: '预览',
      dataIndex: 'image_url',
      key: 'image_url',
      width: 100,
      render: (url: string) => (
        <Image
          src={url}
          alt="模板预览"
          width={60}
          height={60}
          style={{ objectFit: 'cover', borderRadius: 4 }}
        />
      )
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 100
    },
    {
      title: '排序',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: 80
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
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button 
            type="link" 
            size="small"
            icon={<EyeOutlined />} 
            onClick={() => handlePreview(record)}
          >
            查看
          </Button>
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
            danger 
            icon={<DeleteOutlined />} 
            onClick={() => handleDelete(record.id)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新建模板
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={templates}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        scroll={{ x: 1200 }}
      />

      <Modal
        title={editingTemplate ? '编辑模板' : '新建模板'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={800}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="mode"
            label="模式"
            rules={[{ required: true, message: '请选择模式' }]}
          >
            <Select placeholder="请选择模式" disabled={!!editingTemplate}>
              <Option value="puzzle">时空拼图</Option>
              <Option value="transform">富贵变身</Option>
              <Option value="caishen">财神变身</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="code"
            label="模板代码"
            rules={[{ required: true, message: '请输入模板代码' }]}
          >
            <Input placeholder="如: transform-custom-1" disabled={!!editingTemplate} />
          </Form.Item>

          <Form.Item
            name="name"
            label="模板名称"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input placeholder="如: 富贵团圆" />
          </Form.Item>

          <Form.Item
            name="imageUrl"
            label="图片URL"
            rules={[{ required: true, message: '请输入图片URL' }]}
          >
            <Input placeholder="https://..." />
          </Form.Item>

          <Form.Item
            name="prompt"
            label="AI提示词"
          >
            <TextArea placeholder="请输入AI生成提示词" rows={6} />
          </Form.Item>

          <Form.Item
            name="category"
            label="分类"
          >
            <Input placeholder="如: chinese, luxury, modern" />
          </Form.Item>

          <Form.Item
            name="duration"
            label="视频时长（秒）"
            tooltip="仅用于财神变身模式"
          >
            <InputNumber placeholder="默认5秒" min={1} max={30} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="sortOrder"
            label="排序顺序"
          >
            <InputNumber placeholder="数字越小越靠前" style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="status"
            label="状态"
            rules={[{ required: true, message: '请选择状态' }]}
          >
            <Select placeholder="请选择状态">
              <Option value="active">启用</Option>
              <Option value="inactive">停用</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="模板详情"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={null}
        width={800}
      >
        {previewTemplate && (
          <Card>
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <div>
                <strong>模式：</strong>{MODE_MAP[previewTemplate.mode]}
              </div>
              <div>
                <strong>代码：</strong>{previewTemplate.code}
              </div>
              <div>
                <strong>名称：</strong>{previewTemplate.name}
              </div>
              <div>
                <strong>分类：</strong>{previewTemplate.category}
              </div>
              <div>
                <strong>图片预览：</strong>
                <div style={{ marginTop: 8 }}>
                  <Image
                    src={previewTemplate.image_url}
                    alt={previewTemplate.name}
                    style={{ maxWidth: '100%', borderRadius: 8 }}
                  />
                </div>
              </div>
              <div>
                <strong>AI提示词：</strong>
                <div style={{ 
                  marginTop: 8, 
                  padding: 12, 
                  background: '#f5f5f5', 
                  borderRadius: 4,
                  whiteSpace: 'pre-wrap'
                }}>
                  {previewTemplate.prompt || '无'}
                </div>
              </div>
            </Space>
          </Card>
        )}
      </Modal>
    </div>
  );
};

export default TemplatesPage;
