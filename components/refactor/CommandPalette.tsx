import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, BarChart2, CalendarDays, Image, Shield, MessageSquare } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';

type Item = { id: string; label: string; href: string; icon: React.ReactNode };

export const CommandPalette = () => {
  const navigate = useNavigate();
  const { auth } = useAppContext();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const items = useMemo<Item[]>(() => {
    const base: Item[] = [
      { id: 'overview', label: '指标总览', href: '/overview', icon: <LayoutDashboard className="w-4 h-4" /> },
      { id: 'breakdown', label: '指标细分', href: '/breakdown', icon: <BarChart2 className="w-4 h-4" /> },
      { id: 'detail', label: '数据详情', href: '/detail', icon: <CalendarDays className="w-4 h-4" /> },
      { id: 'chat', label: 'AI问答', href: '/chat', icon: <MessageSquare className="w-4 h-4" /> },
      { id: 'vision', label: '视觉识别', href: '/vision', icon: <Image className="w-4 h-4" /> }
    ];
    if (auth.role === 'admin') {
      base.push({ id: 'admin', label: '管理后台', href: '/admin', icon: <Shield className="w-4 h-4" /> });
    }
    return base;
  }, [auth.role]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label="全局搜索" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <div className="absolute left-1/2 top-16 w-[92vw] max-w-xl -translate-x-1/2 rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden">
        <div className="p-3 border-b border-gray-100">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索页面…"
            className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-200"
            aria-label="搜索输入"
          />
        </div>
        <div className="max-h-[50vh] overflow-auto">
          {filtered.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">无匹配结果</div>
          ) : (
            <ul className="p-2">
              {filtered.map((it) => (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setQuery('');
                      navigate(it.href);
                    }}
                    className="w-full px-3 py-2 rounded-lg hover:bg-gray-50 text-left flex items-center gap-3"
                    aria-label={it.label}
                  >
                    <span className="text-gray-500">{it.icon}</span>
                    <span className="text-sm font-medium text-gray-800">{it.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

