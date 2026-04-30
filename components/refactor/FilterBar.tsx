import { RefreshCw } from 'lucide-react';

type Preset = '24h' | '7d' | '31d';
type QuickFilter = { id: string; label: string };

export const FilterBar = (props: {
  preset: Preset;
  start: Date;
  end: Date;
  onPresetChange: (preset: Preset) => void;
  onRefresh: () => void;
  summaryItems?: string[];
  quickFilters?: QuickFilter[];
  activeQuickFilterIds?: string[];
  onQuickFilterToggle?: (id: string) => void;
  onClearFilters?: () => void;
}) => {
  const items: Array<{ id: Preset; label: string }> = [
    { id: '24h', label: '近24小时' },
    { id: '7d', label: '近7天' },
    { id: '31d', label: '近31天' }
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 flex flex-col gap-3" data-tour="filter">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => props.onPresetChange(it.id)}
              data-active={props.preset === it.id ? 'true' : 'false'}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                props.preset === it.id ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
              aria-label={it.label}
            >
              {it.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={props.onRefresh}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm font-medium"
          aria-label="刷新"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>
    </div>
  );
};

