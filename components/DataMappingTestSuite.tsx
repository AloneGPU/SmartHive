import React, { useState, useEffect } from 'react';
import { BeehiveData } from '../types';
import { useLiveHiveQuery, useHiveRangeQuery } from '../hooks/useHiveData';
import {
  EnhancedAnalyticsPanel,
  SmartDashboard,
  OptimizedChartContainer,
  MobileOptimizedCharts,
  AdaptiveDataGrid,
  PerformanceOptimizedGrid
} from '../components';
import { Play, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface DataMappingTestSuiteProps {
  className?: string;
}

interface TestCase {
  id: string;
  name: string;
  component: any;
  description: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  details: any;
}

const COMPONENT_TESTS = [
  {
    id: 'enhanced-analytics',
    name: 'EnhancedAnalyticsPanel',
    component: EnhancedAnalyticsPanel,
    description: '测试增强分析面板的数据映射'
  },
  {
    id: 'smart-dashboard',
    name: 'SmartDashboard',
    component: SmartDashboard,
    description: '测试智能监控面板的数据映射'
  },
  {
    id: 'optimized-chart',
    name: 'OptimizedChartContainer',
    component: OptimizedChartContainer,
    description: '测试优化图表容器的数据映射'
  },
  {
    id: 'mobile-charts',
    name: 'MobileOptimizedCharts',
    component: MobileOptimizedCharts,
    description: '测试移动端优化图表的数据映射'
  },
  {
    id: 'adaptive-grid',
    name: 'AdaptiveDataGrid',
    component: AdaptiveDataGrid,
    description: '测试自适应数据网格的数据映射'
  },
  {
    id: 'performance-grid',
    name: 'PerformanceOptimizedGrid',
    component: PerformanceOptimizedGrid,
    description: '测试性能优化网格的数据映射'
  }
];

const FIELD_TEST_CASES = [
  {
    field: 'timestamp',
    checks: [
      (data: BeehiveData) => data.timestamp !== undefined && data.timestamp !== null,
      (data: BeehiveData) => !isNaN(new Date(data.timestamp).getTime()),
      (data: BeehiveData) => typeof data.timestamp === 'number'
    ]
  },
  {
    field: 'temperature',
    checks: [
      (data: BeehiveData) => data.temperature !== undefined && data.temperature !== null,
      (data: BeehiveData) => typeof data.temperature === 'number',
      (data: BeehiveData) => Number.isFinite(data.temperature)
    ]
  },
  {
    field: 'humidity',
    checks: [
      (data: BeehiveData) => data.humidity !== undefined && data.humidity !== null,
      (data: BeehiveData) => typeof data.humidity === 'number',
      (data: BeehiveData) => Number.isFinite(data.humidity)
    ]
  },
  {
    field: 'weight',
    checks: [
      (data: BeehiveData) => data.weight !== undefined && data.weight !== null,
      (data: BeehiveData) => typeof data.weight === 'number',
      (data: BeehiveData) => Number.isFinite(data.weight) && data.weight >= 0
    ]
  },
  {
    field: 'beesIn',
    checks: [
      (data: BeehiveData) => data.beesIn !== undefined && data.beesIn !== null,
      (data: BeehiveData) => typeof data.beesIn === 'number',
      (data: BeehiveData) => Number.isFinite(data.beesIn) && data.beesIn >= 0
    ]
  },
  {
    field: 'beesOut',
    checks: [
      (data: BeehiveData) => data.beesOut !== undefined && data.beesOut !== null,
      (data: BeehiveData) => typeof data.beesOut === 'number',
      (data: BeehiveData) => Number.isFinite(data.beesOut) && data.beesOut >= 0
    ]
  },
  {
    field: 'hornetsDetected',
    checks: [
      (data: BeehiveData) => data.hornetsDetected !== undefined && data.hornetsDetected !== null,
      (data: BeehiveData) => typeof data.hornetsDetected === 'number',
      (data: BeehiveData) => Number.isFinite(data.hornetsDetected) && data.hornetsDetected >= 0
    ]
  },
  {
    field: 'latitude',
    checks: [
      (data: BeehiveData) => data.latitude === undefined || data.latitude === null || (typeof data.latitude === 'number' && Number.isFinite(data.latitude) && data.latitude >= -90 && data.latitude <= 90)
    ]
  },
  {
    field: 'longitude',
    checks: [
      (data: BeehiveData) => data.longitude === undefined || data.longitude === null || (typeof data.longitude === 'number' && Number.isFinite(data.longitude) && data.longitude >= -180 && data.longitude <= 180)
    ]
  }
];

export const DataMappingTestSuite: React.FC<DataMappingTestSuiteProps> = ({ className = '' }) => {
  const { data: latestData } = useLiveHiveQuery();
  const { data: historyData } = useHiveRangeQuery(Date.now() - 24 * 60 * 60 * 1000, Date.now());

  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTestIndex, setCurrentTestIndex] = useState(-1);

  // 初始化测试用例
  useEffect(() => {
    const initialCases = COMPONENT_TESTS.map(test => ({
      ...test,
      status: 'pending' as const,
      details: {}
    }));
    setTestCases(initialCases);
  }, []);

  // 运行单个组件测试
  const runComponentTest = async (testCase: TestCase) => {
    const Component = testCase.component as unknown as React.ComponentType<any>;
    const testSample = historyData?.slice(0, 5) || [];

    try {
      // 尝试渲染组件
      const tempDiv = document.createElement('div');
      tempDiv.style.display = 'none';
      document.body.appendChild(tempDiv);

      // 使用 React 18 的 createRoot API
      import('react-dom/client').then(({ createRoot }) => {
        const root = createRoot(tempDiv);
        root.render(
          <React.StrictMode>
            <Component
              data={testSample}
              className="test-component"
            />
          </React.StrictMode>
        );

        // 检查是否渲染成功
        setTimeout(() => {
          const hasErrors = tempDiv.querySelector('.error') !== null;
          root.unmount();
          document.body.removeChild(tempDiv);

          setTestCases(prev => prev.map(t =>
            t.id === testCase.id ? {
              ...t,
              status: hasErrors ? 'failed' : 'passed',
              details: {
                sampleSize: testSample.length,
                hasErrors,
                timestamp: Date.now()
              }
            } : t
          ));
        }, 100);
      });

    } catch (error) {
      setTestCases(prev => prev.map(t =>
        t.id === testCase.id ? {
          ...t,
          status: 'failed',
          details: {
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: Date.now()
          }
        } : t
      ));
    }
  };

  // 运行所有测试
  const runAllTests = async () => {
    setIsRunning(true);
    setCurrentTestIndex(0);

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      if (testCase.status === 'pending' || testCase.status === 'failed') {
        setTestCases(prev => prev.map(t =>
          t.id === testCase.id ? { ...t, status: 'running' } : t
        ));

        await runComponentTest(testCase);
        await new Promise(resolve => setTimeout(resolve, 200)); // 间隔200ms
      }
      setCurrentTestIndex(i + 1);
    }

    setIsRunning(false);
  };

  // 测试字段映射
  const testFieldMappings = (data: BeehiveData) => {
    const results: any = {};

    FIELD_TEST_CASES.forEach(fieldTest => {
      const fieldResults = fieldTest.checks.map(check => {
        try {
          return { passed: check(data), error: null };
        } catch (error) {
          return { passed: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      });

      results[fieldTest.field] = {
        allPassed: fieldResults.every(r => r.passed),
        checks: fieldResults,
        notes: fieldResults.some(r => !r.passed) ?
          fieldResults.filter(r => !r.passed).map(r => r.error).join(', ') :
          'All checks passed'
      };
    });

    return results;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'running':
        return <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>;
      default:
        return <div className="w-5 h-5 border-2 border-gray-300 rounded-full"></div>;
    }
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">数据映射测试套件</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={runAllTests}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400"
          >
            <Play className="w-4 h-4" />
            {isRunning ? '测试中...' : '运行测试'}
          </button>
        </div>
      </div>

      {/* 测试进度 */}
      {isRunning && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">测试进度</span>
            <span className="text-sm text-gray-600">{currentTestIndex} / {testCases.length}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentTestIndex / testCases.length) * 100}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* 字段映射测试结果 */}
      {latestData && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">字段映射测试</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-green-700 mb-1">有效字段</p>
              <p className="text-2xl font-bold text-green-900">
                {Object.keys(testFieldMappings(latestData)).filter(field =>
                  testFieldMappings(latestData)[field].allPassed
                ).length}
              </p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4">
              <p className="text-yellow-700 mb-1">部分有效</p>
              <p className="text-2xl font-bold text-yellow-900">
                {Object.keys(testFieldMappings(latestData)).filter(field =>
                  !testFieldMappings(latestData)[field].allPassed &&
                  testFieldMappings(latestData)[field].checks.some((c: { passed: boolean }) => c.passed)
                ).length}
              </p>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <p className="text-red-700 mb-1">无效字段</p>
              <p className="text-2xl font-bold text-red-900">
                {Object.keys(testFieldMappings(latestData)).filter(field =>
                  !testFieldMappings(latestData)[field].checks.some((c: { passed: boolean }) => c.passed)
                ).length}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 组件测试列表 */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">组件测试结果</h3>
        <div className="space-y-3">
          {testCases.map((testCase, index) => (
            <div key={testCase.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon(testCase.status)}
                  <div>
                    <h4 className="font-medium text-gray-900">{testCase.name}</h4>
                    <p className="text-sm text-gray-600">{testCase.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    testCase.status === 'passed' ? 'bg-green-100 text-green-800' :
                    testCase.status === 'failed' ? 'bg-red-100 text-red-800' :
                    testCase.status === 'running' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {testCase.status === 'passed' ? '通过' :
                     testCase.status === 'failed' ? '失败' :
                     testCase.status === 'running' ? '运行中' : '待执行'}
                  </span>
                </div>
              </div>

              {testCase.status === 'failed' && testCase.details.error && (
                <div className="mt-3 p-3 bg-red-50 rounded-md">
                  <p className="text-sm text-red-700">错误: {testCase.details.error}</p>
                </div>
              )}

              {testCase.status === 'passed' && testCase.details.sampleSize !== undefined && (
                <div className="mt-3 text-sm text-gray-600">
                  使用了 {testCase.details.sampleSize} 条测试数据
                </div>
              )}

              {testCase.status === 'pending' && (
                <button
                  onClick={() => runComponentTest(testCase)}
                  className="mt-3 text-sm text-blue-600 hover:text-blue-800"
                >
                  运行此测试
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 测试总结 */}
      {testCases.length > 0 && !testCases.some(t => t.status === 'running') && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">测试总结</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-green-700">通过测试</p>
              <p className="text-2xl font-bold text-green-900">
                {testCases.filter(t => t.status === 'passed').length}
              </p>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <p className="text-red-700">失败测试</p>
              <p className="text-2xl font-bold text-red-900">
                {testCases.filter(t => t.status === 'failed').length}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-700">待执行</p>
              <p className="text-2xl font-bold text-gray-900">
                {testCases.filter(t => t.status === 'pending').length}
              </p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-blue-700">通过率</p>
              <p className="text-2xl font-bold text-blue-900">
                {testCases.length > 0 ?
                  Math.round((testCases.filter(t => t.status === 'passed').length / testCases.length) * 100) :
                  0}%
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};