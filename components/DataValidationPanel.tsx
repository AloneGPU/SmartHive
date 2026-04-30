import React, { useState, useEffect } from 'react';
import { BeehiveData } from '../types';
import { useLiveHiveQuery, useHiveRangeQuery } from '../hooks/useHiveData';
import { validateBatchData, validateDataMapping, generateInsertSQL, FieldComparison } from '../utils/dataValidation';
import { Database, AlertCircle, CheckCircle, Info, RefreshCw } from 'lucide-react';

interface DataValidationPanelProps {
  className?: string;
}

export const DataValidationPanel: React.FC<DataValidationPanelProps> = ({ className = '' }) => {
  const { data: latestData } = useLiveHiveQuery();
  const { data: historyData } = useHiveRangeQuery(Date.now() - 24 * 60 * 60 * 1000, Date.now());

  const [validationResults, setValidationResults] = useState<any>(null);
  const [comparisonResults, setComparisonResults] = useState<FieldComparison[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // 运行验证
  const runValidation = async () => {
    setIsRunning(true);

    try {
      // 验证最新数据
      if (latestData) {
        const latestValidation = validateDataMapping(latestData);

        // 验证历史数据
        const batchValidation = validateBatchData(historyData || []);

        setValidationResults({
          latest: latestValidation,
          batch: batchValidation
        });
      }

      // 生成对比（如果有示例数据）
      if (latestData) {
        // 这里模拟数据库数据，实际应该从API获取原始数据
        const mockDbData = {
          timestamp: latestData.timestamp,
          temperature: latestData.temperature,
          humidity: latestData.humidity,
          weight: latestData.weight,
          beesIn: latestData.beesIn,
          beesOut: latestData.beesOut,
          hornetsDetected: latestData.hornetsDetected,
          latitude: latestData.latitude,
          longitude: latestData.longitude
        };

        const comparisons = {
          database: mockDbData,
          display: latestData,
          fields: Object.keys(mockDbData).map(field => ({
            field,
            dbValue: mockDbData[field as keyof typeof mockDbData],
            displayValue: latestData[field as keyof BeehiveData],
            match: mockDbData[field as keyof typeof mockDbData] === latestData[field as keyof BeehiveData],
            difference: typeof mockDbData[field as keyof typeof mockDbData] === 'number' &&
                       typeof latestData[field as keyof BeehiveData] === 'number'
                      ? (mockDbData[field as keyof typeof mockDbData] as number) - (latestData[field as keyof BeehiveData] as number)
                      : null
          }))
        };

        setComparisonResults(comparisons.fields);
      }
    } catch (error) {
      console.error('验证失败:', error);
    } finally {
      setIsRunning(false);
    }
  };

  // 自动运行验证
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isRunning) {
        runValidation();
      }
    }, 30000); // 每30秒验证一次

    return () => clearInterval(interval);
  }, [isRunning]);

  // 初始运行
  useEffect(() => {
    runValidation();
  }, []);

  const getStatusColor = (isValid: boolean) => {
    return isValid ? 'text-green-600' : 'text-red-600';
  };

  const getStatusIcon = (isValid: boolean) => {
    return isValid ?
      <CheckCircle className="w-5 h-5 text-green-600" /> :
      <AlertCircle className="w-5 h-5 text-red-600" />;
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">数据验证面板</h2>
        </div>
        <button
          onClick={runValidation}
          disabled={isRunning}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400"
        >
          <RefreshCw className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
          {isRunning ? '验证中...' : '重新验证'}
        </button>
      </div>

      {!validationResults ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-500">准备验证数据...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 总览状态 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <p className="text-2xl font-bold text-green-900">{validationResults.batch.valid}</p>
                  <p className="text-sm text-green-700">有效数据</p>
                </div>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <div>
                  <p className="text-2xl font-bold text-red-900">{validationResults.batch.invalid}</p>
                  <p className="text-sm text-red-700">无效数据</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold text-blue-900">{validationResults.batch.total}</p>
                  <p className="text-sm text-blue-700">总数据量</p>
                </div>
              </div>
            </div>
          </div>

          {/* 最新数据验证 */}
          {validationResults.latest && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">最新数据验证</h3>

              <div className="space-y-3">
                {validationResults.latest.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h4 className="font-medium text-red-900 mb-2 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      错误 ({validationResults.latest.errors.length})
                    </h4>
                    <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                      {validationResults.latest.errors.map((error: string, index: number) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {validationResults.latest.warnings.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="font-medium text-yellow-900 mb-2 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      警告 ({validationResults.latest.warnings.length})
                    </h4>
                    <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                      {validationResults.latest.warnings.map((warning: string, index: number) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {validationResults.latest.info.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      信息 ({validationResults.latest.info.length})
                    </h4>
                    <ul className="list-disc list-inside text-sm text-blue-700 space-y-1">
                      {validationResults.latest.info.map((info: string, index: number) => (
                        <li key={index}>{info}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 字段映射对比 */}
          {comparisonResults.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">数据库与显示字段对比</h3>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left">字段名</th>
                      <th className="px-4 py-2 text-left">数据库值</th>
                      <th className="px-4 py-2 text-left">显示值</th>
                      <th className="px-4 py-2 text-left">是否匹配</th>
                      <th className="px-4 py-2 text-left">差异</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonResults.map((comp, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-2 font-medium">{comp.field}</td>
                        <td className="px-4 py-2">
                          {typeof comp.dbValue === 'number' ? comp.dbValue.toFixed(2) : comp.dbValue || 'NULL'}
                        </td>
                        <td className="px-4 py-2">
                          {typeof comp.displayValue === 'number' ? comp.displayValue.toFixed(2) : comp.displayValue || 'NULL'}
                        </td>
                        <td className="px-4 py-2">
                          {comp.match ? (
                            <span className="text-green-600 flex items-center gap-1">
                              <CheckCircle className="w-4 h-4" />
                              匹配
                            </span>
                          ) : (
                            <span className="text-red-600 flex items-center gap-1">
                              <AlertCircle className="w-4 h-4" />
                              不匹配
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {comp.difference !== null ? (
                            <span className={Math.abs(comp.difference) < 0.01 ? 'text-green-600' : 'text-red-600'}>
                              {comp.difference.toFixed(4)}
                            </span>
                          ) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 数据适配器测试 */}
          {validationResults.latest?.testResults && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">数据适配器测试</h3>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-medium">主要温度</p>
                    <p className={getStatusColor(validationResults.latest.testResults.primaryTemperature !== null)}>
                      {validationResults.latest.testResults.primaryTemperature?.toFixed(2) || 'NULL'}°C
                    </p>
                  </div>
                  <div>
                    <p className="font-medium">主要湿度</p>
                    <p className={getStatusColor(validationResults.latest.testResults.primaryHumidity !== null)}>
                      {validationResults.latest.testResults.primaryHumidity?.toFixed(2) || 'NULL'}%
                    </p>
                  </div>
                  <div>
                    <p className="font-medium">内部温度</p>
                    <p className={getStatusColor(validationResults.latest.testResults.insideTemperature !== null)}>
                      {validationResults.latest.testResults.insideTemperature?.toFixed(2) || 'NULL'}°C
                    </p>
                  </div>
                  <div>
                    <p className="font-medium">内部湿度</p>
                    <p className={getStatusColor(validationResults.latest.testResults.insideHumidity !== null)}>
                      {validationResults.latest.testResults.insideHumidity?.toFixed(2) || 'NULL'}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};