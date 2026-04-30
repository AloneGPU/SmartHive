import { useState, useEffect } from 'react';

export const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const checkDevice = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
    };

    // 初始检查
    checkDevice();

    // 监听窗口大小变化
    window.addEventListener('resize', checkDevice);

    // 清理监听器
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  return { isMobile, isTablet };
};