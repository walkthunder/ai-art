import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// 首页重定向到引导页
export default function Home() {
  const navigate = useNavigate();
  
  useEffect(() => {
    navigate('/');
  }, [navigate]);
  
  return null;
}