import React, { useState, useEffect } from 'react';
import { BeehiveData } from '../types';
import { useLiveHiveQuery, useHiveRangeQuery } from '../hooks/useHiveData';
import {
  resolveInsideTemperature,
  resolveInsideHumidity,
  resolveOutsideTemperature,
  resolveOutsideHumidity,
  resolvePrimaryTemperature,
  resolvePrimaryHumidity,
  toFiniteNumber
} from '../services/hiveDataAdapter';

interface DataMappingDebuggerProps {
  className?: string;
}

interface FieldMapping {
  fieldName: string;
  dbFieldName: string;
  dataType: string;
  rawValue: any;
  processedValue: any;
  isValid: boolean;
  notes: string;
}

export const DataMappingDebugger: React.FC<DataMappingDebuggerProps> = ({ className = '' }) => {
  const { data: latestData } = useLiveHiveQuery();
  const { data: historyData } = useHiveRangeQuery(Date.now() - 60 * 60 * 1000, Date.now());

  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [sampleData, setSampleData] = useState<BeehiveData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 分析数据映射
  const analyzeDataMapping = (data: BeehiveData) => {
    setIsAnalyzing(true);

    const mappings: FieldMapping[] = [
      {
        fieldName: 'timestamp',
        dbFieldName: 'timestamp',
        dataType: 'bigint',
        rawValue: data.timestamp,
        processedValue: new Date(data.timestamp).toLocaleString('zh-CN'),
        isValid: !isNaN(new Date(data.timestamp).getTime()),
        notes: data.timestamp ? '时间戳正常' : '时间戳缺失'
      },
      {
        fieldName: 'temperature',
        dbFieldName: 'temperature',
        dataType: 'float',
        rawValue: data.temperature,
        processedValue: data.temperature?.toFixed(1) + '°C',
        isValid: typeof data.temperature === 'number' && Number.isFinite(data.temperature),
        notes: data.temperature ? `温度值: ${data.temperature}°C` : '温度数据缺失'
      },
      {
        fieldName: 'humidity',
        dbFieldName: 'humidity',
        dataType: 'float',
        rawValue: data.humidity,
        processedValue: data.humidity?.toFixed(0) + '%',
        isValid: typeof data.humidity === 'number' && Number.isFinite(data.humidity),
        notes: data.humidity ? `湿度值: ${data.humidity}%` : '湿度数据缺失'
      },
      {
        fieldName: 'weight',
        dbFieldName: 'weight',
        dataType: 'float',
        rawValue: data.weight,
        processedValue: data.weight?.toFixed(1) + 'kg',
        isValid: typeof data.weight === 'number' && Number.isFinite(data.weight),
        notes: data.weight ? `重量值: ${data.weight}kg` : '重量数据缺失'
      },
      {
        fieldName: 'beesIn',
        dbFieldName: 'beesIn',
        dataType: 'int',
        rawValue: data.beesIn,
        processedValue: data.beesIn,
        isValid: typeof data.beesIn === 'number' && Number.isFinite(data.beesIn) && data.beesIn >= 0,
        notes: data.beesIn !== null ? `进蜂数量: ${data.beesIn}` : '进蜂数据缺失'
      },
      {
        fieldName: 'beesOut',
        dbFieldName: 'beesOut',
        dataType: 'int',
        rawValue: data.beesOut,
        processedValue: data.beesOut,
        isValid: typeof data.beesOut === 'number' && Number.isFinite(data.beesOut) && data.beesOut >= 0,
        notes: data.beesOut !== null ? `出蜂数量: ${data.beesOut}` : '出蜂数据缺失'
      },
      {
        fieldName: 'hornetsDetected',
        dbFieldName: 'hornetsDetected',
        dataType: 'int',
        rawValue: data.hornetsDetected,
        processedValue: data.hornetsDetected,
        isValid: typeof data.hornetsDetected === 'number' && Number.isFinite(data.hornetsDetected) && data.hornetsDetected >= 0,
        notes: data.hornetsDetected !== null ? `马蜂检测: ${data.hornetsDetected}` : '马蜂检测数据缺失（正常）'
      },
      {
        fieldName: 'latitude',
        dbFieldName: 'latitude',
        dataType: 'float',
        rawValue: data.latitude,
        processedValue: data.latitude?.toFixed(6),
        isValid: data.latitude !== null && data.latitude !== undefined && Number.isFinite(data.latitude),
        notes: data.latitude ? `纬度: ${data.latitude}` : '经纬度数据缺失'
      },
      {
        fieldName: 'longitude',
        dbFieldName: 'longitude',
        dataType: 'float',
        rawValue: data.longitude,
        processedValue: data.longitude?.toFixed(6),
        isValid: data.longitude !== null && data.longitude !== undefined && Number.isFinite(data.longitude),
        notes: data.longitude ? `经度: ${data.longitude}` : '经纬度数据缺失'
      }
    ];

    // 测试数据适配器
    const adapterTests = [
      {
        name: '主要温度',
        value: resolvePrimaryTemperature(data),
        notes: '使用内部或外部温度'
      },
      {
        name: '主要湿度',
        value: resolvePrimaryHumidity(data),
        notes: '使用内部或外部湿度'
      },
      {
        name: '内部温度',
        value: resolveInsideTemperature(data),
        notes: '优先使用 insideTemperature，否则使用 temperature'
      },
      {
        name: '内部湿度',
        value: resolveInsideHumidity(data),
        notes: '优先使用 insideHumidity，否则使用 humidity'
      }
    ];

    setFieldMappings(mappings);
    setSampleData(data);

    setIsAnalyzing(false);
  };

  // 自动分析最新数据
  useEffect(() => {
    if (latestData) {
      analyzeDataMapping(latestData);
    }
  }, [latestData]);

  const getStatusColor = (isValid: boolean) => {
    return isValid ? 'text-green-600' : 'text-red-600';
  };

  const getStatusBg = (isValid: boolean) => {
    return isValid ? 'bg-green-50' : 'bg-red-50';
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">数据映射调试器</h2>
        <button
          onClick={() => latestData && analyzeDataMapping(latestData)}
          disabled={isAnalyzing}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400"
        >
          {isAnalyzing ? '分析中...' : '重新分析'}
        </button>
      </div>

      {!sampleData ? (
        <div className="text-center py-8">
          <p className="text-gray-500">等待数据加载...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 数据总览 */}
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-3">数据总览</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-blue-600">时间</p>
                <p className="font-medium">{new Date(sampleData.timestamp).toLocaleString('zh-CN')}</p>
              </div>
              <div>
                <p className="text-blue-600">温度</p>
                <p className="font-medium">{sampleData.temperature?.toFixed(1)}°C</p>
              </div>
              <div>
                <p className="text-blue-600">湿度</p>
                <p className="font-medium">{sampleData.humidity?.toFixed(0)}%</p>
              </div>
              <div>
                <p className="text-blue-600">重量</p>
                <p className="font-medium">{sampleData.weight?.toFixed(1)}kg</p>
              </div>
            </div>
          </div>

          {/* 字段映射详情 */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">字段映射详情</h3>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">显示字段</th>
                    <th className="px-4 py-2 text-left">数据库字段</th>
                    <th className="px-4 py-2 text-left">数据类型</th>
                    <th className="px-4 py-2 text-left">原始值</th>
                    <th className="px-4 py-2 text-left">处理值</th>
                    <th className="px-4 py-2 text-left">状态</th>
                    <th className="px-4 py-2 text-left">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {fieldMappings.map((mapping, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-2 font-medium">{mapping.fieldName}</td>
                      <td className="px-4 py-2 text-gray-600">{mapping.dbFieldName}</td>
                      <td className="px-4 py-2">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">{mapping.dataType}</code>
                      </td>
                      <td className="px-4 py-2">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {typeof mapping.rawValue === 'number' ? mapping.rawValue.toFixed(2) : String(mapping.rawValue)}
                        </code>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-sm">{mapping.processedValue}</span>
                      </td>
                      <td className="px-4 py-2">
                        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${getStatusBg(mapping.isValid)}`}>
                          {mapping.isValid ? (
                            <>
                              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                              有效
                            </>
                          ) : (
                            <>
                              <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                              无效
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600">{mapping.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 数据适配器测试结果 */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">数据适配器测试</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  name: '主要温度',
                  value: resolvePrimaryTemperature(sampleData),
                  formula: '内部温度 ?? 外部温度'
                },
                {
                  name: '主要湿度',
                  value: resolvePrimaryHumidity(sampleData),
                  formula: '内部湿度 ?? 外部湿度'
                },
                {
                  name: '内部温度',
                  value: resolveInsideTemperature(sampleData),
                  formula: 'insideTemperature ?? temperature'
                },
                {
                  name: '内部湿度',
                  value: resolveInsideHumidity(sampleData),
                  formula: 'insideHumidity ?? humidity'
                }
              ].map((test, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-900">{test.name}</h4>
                    <span className={`px-2 py-1 rounded text-xs ${
                      test.value !== null ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
                    }`}>
                      {test.value !== null ? '有值' : 'NULL'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-1">{test.formula}</p>
                  <p className="text-lg font-semibold">
                    {test.value !== null ? `${test.value.toFixed(2)}${test.name.includes('温度') ? '°C' : '%'}` : 'NULL'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 数据质量指标 */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">数据质量指标</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-sm text-green-700 mb-1">有效字段数</p>
                <p className="text-2xl font-bold text-green-900">
                  {fieldMappings.filter(f => f.isValid).length} / {fieldMappings.length}
                </p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4">
                <p className="text-sm text-yellow-700 mb-1">警告字段数</p>
                <p className="text-2xl font-bold text-yellow-900">
                  {fieldMappings.filter(f => !f.isValid && f.fieldName !== 'hornetsDetected').length}
                </p>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <p className="text-sm text-red-700 mb-1">错误字段数</p>
                <p className="text-2xl font-bold text-red-900">
                  {fieldMappings.filter(f => !f.isValid && f.fieldName === 'timestamp').length}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};