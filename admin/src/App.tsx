import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Prices from './pages/Prices';
import Templates from './pages/Templates';
import Users from './pages/Users';
import Orders from './pages/Orders';
import Monitor from './pages/Monitor';
import Config from './pages/Config';
import Logs from './pages/Logs';
import CallbackLogs from './pages/CallbackLogs';
import AuthGuard from './components/AuthGuard';
import AdminLayout from './components/AdminLayout';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <AuthGuard>
            <AdminLayout />
          </AuthGuard>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="users" element={<Users />} />
        <Route path="orders" element={<Orders />} />
        <Route path="prices" element={<Prices />} />
        <Route path="templates" element={<Templates />} />
        <Route path="monitor" element={<Monitor />} />
        <Route path="config" element={<Config />} />
        <Route path="logs" element={<Logs />} />
        <Route path="callback-logs" element={<CallbackLogs />} />
      </Route>
    </Routes>
  );
}

export default App;
