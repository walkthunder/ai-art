import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, message } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  ShoppingOutlined,
  DollarOutlined,
  PictureOutlined,
  SettingOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MonitorOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { logout } from '@/services/auth';

const { Header, Sider, Content } = Layout;

function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  
  const userStr = localStorage.getItem('admin_user');
  const user = userStr ? JSON.parse(userStr) : null;

  const menuItems: MenuProps['items'] = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '数据看板',
      onClick: () => navigate('/dashboard'),
    },
    {
      key: '/monitor',
      icon: <MonitorOutlined />,
      label: '系统监控',
      onClick: () => navigate('/monitor'),
    },
    {
      key: '/users',
      icon: <UserOutlined />,
      label: '用户管理',
      onClick: () => navigate('/users'),
    },
    {
      key: '/orders',
      icon: <ShoppingOutlined />,
      label: '订单管理',
      onClick: () => navigate('/orders'),
    },
    {
      key: '/prices',
      icon: <DollarOutlined />,
      label: '价格配置',
      onClick: () => navigate('/prices'),
    },
    {
      key: '/templates',
      icon: <PictureOutlined />,
      label: '模板管理',
      onClick: () => navigate('/templates'),
    },
    {
      key: '/logs',
      icon: <FileTextOutlined />,
      label: '日志查询',
      onClick: () => navigate('/logs'),
    },
    {
      key: '/config',
      icon: <SettingOutlined />,
      label: '系统配置',
      onClick: () => navigate('/config'),
    },
  ];

  const handleLogout = async () => {
    try {
      await logout();
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      message.success('登出成功');
      navigate('/login');
    } catch (error) {
      // 即使API失败也清除本地数据
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      navigate('/login');
    }
  };

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div style={{ 
          height: 64, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: '#fff',
          fontSize: 18,
          fontWeight: 'bold'
        }}>
          {collapsed ? 'AI' : 'AI全家福'}
        </div>
        <Menu
          theme="dark"
          defaultSelectedKeys={['/dashboard']}
          mode="inline"
          items={menuItems}
        />
      </Sider>
      <Layout>
        <Header style={{ 
          padding: '0 24px', 
          background: '#fff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: 18, fontWeight: 500 }}>
            管理后台
          </div>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar icon={<UserOutlined />} />
              <span>{user?.username || '管理员'}</span>
            </div>
          </Dropdown>
        </Header>
        <Content style={{ margin: '24px 16px', padding: 24, background: '#fff' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

export default AdminLayout;
