import { BeehiveData } from '../types';
import {
  resolveInsideTemperature,
  resolveInsideHumidity,
  resolveOutsideTemperature,
  resolveOutsideHumidity,
  resolvePrimaryTemperature,
  resolvePrimaryHumidity,
  toFiniteNumber
} from '../services/hiveDataAdapter';

/**
 * 验证数据映射是否正确
 */
export const validateDataMapping = (data: BeehiveData): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  // 1. 验证必填字段
  if (!data.timestamp) {
    errors.push('缺少 timestamp 字段');
  } else {
    const date = new Date(data.timestamp);
    if (isNaN(date.getTime())) {
      errors.push('timestamp 格式错误');
    }
  }

  // 2. 验证温度字段
  if (typeof data.temperature !== 'number' || !Number.isFinite(data.temperature)) {
    warnings.push('temperature 字段无效或为空');
  } else {
    if (data.temperature < -50 || data.temperature > 60) {
      warnings.push(`温度值异常: ${data.temperature}°C`);
    }
  }

  // 3. 验证湿度字段
  if (typeof data.humidity !== 'number' || !Number.isFinite(data.humidity)) {
    warnings.push('humidity 字段无效或为空');
  } else {
    if (data.humidity < 0 || data.humidity > 100) {
      warnings.push(`湿度值异常: ${data.humidity}%`);
    }
  }

  // 4. 验证重量字段
  if (!data.weight || !Number.isFinite(data.weight)) {
    warnings.push('weight 字段无效或为空');
  } else {
    if (data.weight < 0 || data.weight > 1000) {
      warnings.push(`重量值异常: ${data.weight}kg`);
    }
  }

  // 5. 验证蜜蜂进出字段
  if (data.beesIn === undefined || data.beesIn === null) {
    warnings.push('beesIn 字段缺失');
  } else if (!Number.isFinite(data.beesIn) || data.beesIn < 0) {
    warnings.push(`beesIn 值异常: ${data.beesIn}`);
  }

  if (data.beesOut === undefined || data.beesOut === null) {
    warnings.push('beesOut 字段缺失');
  } else if (!Number.isFinite(data.beesOut) || data.beesOut < 0) {
    warnings.push(`beesOut 值异常: ${data.beesOut}`);
  }

  // 6. 验证马蜂检测字段
  if (data.hornetsDetected === undefined || data.hornetsDetected === null) {
    info.push('hornetsDetected 字段缺失（可能正常）');
  } else if (!Number.isFinite(data.hornetsDetected) || data.hornetsDetected < 0) {
    warnings.push(`hornetsDetected 值异常: ${data.hornetsDetected}`);
  }

  // 7. 测试数据适配器
  const testResults = testDataAdapters(data);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    info,
    testResults
  };
};

/**
 * 测试数据适配器
 */
const testDataAdapters = (data: BeehiveData) => {
  const results = {
    primaryTemperature: null as number | null,
    primaryHumidity: null as number | null,
    insideTemperature: null as number | null,
    insideHumidity: null as number | null,
    outsideTemperature: null as number | null,
    outsideHumidity: null as number | null
  };

  try {
    results.primaryTemperature = resolvePrimaryTemperature(data);
    results.primaryHumidity = resolvePrimaryHumidity(data);
    results.insideTemperature = resolveInsideTemperature(data);
    results.insideHumidity = resolveInsideHumidity(data);
    results.outsideTemperature = resolveOutsideTemperature(data);
    results.outsideHumidity = resolveOutsideHumidity(data);

    return results;
  } catch (error) {
    return {
      ...results,
      error: error instanceof Error ? error.message : '未知错误'
    };
  }
};

/**
 * 生成数据库SQL插入语句
 */
export const generateInsertSQL = (data: BeehiveData): string => {
  const { timestamp, temperature, humidity, weight, beesIn, beesOut, hornetsDetected, latitude, longitude } = data;

  const values = [
    timestamp,
    temperature,
    humidity,
    weight,
    beesIn,
    beesOut,
    hornetsDetected,
    latitude,
    longitude
  ].map(v => v === null ? 'NULL' : typeof v === 'number' ? v : `'${v}'`).join(', ');

  return `INSERT INTO hive_data (
    timestamp, temperature, humidity, weight, beesIn, beesOut, hornetsDetected, latitude, longitude
  ) VALUES (${values});`;
};

/**
 * 对比数据库字段和显示字段
 */
export const compareDbWithDisplay = (dbData: any, displayData: BeehiveData): FieldComparison[] => {
  const comparisons: FieldComparison[] = [];

  const dbFields = {
    timestamp: dbData.timestamp,
    temperature: dbData.temperature,
    humidity: dbData.humidity,
    weight: dbData.weight,
    beesIn: dbData.beesIn,
    beesOut: dbData.beesOut,
    hornetsDetected: dbData.hornetsDetected,
    latitude: dbData.latitude,
    longitude: dbData.longitude
  };

  Object.keys(dbFields).forEach(field => {
    const dbValue = dbFields[field as keyof typeof dbFields];
    const displayValue = displayData[field as keyof BeehiveData];

    comparisons.push({
      field,
      dbValue,
      displayValue,
      match: dbValue === displayValue ||
             (Number.isFinite(dbValue) && Number.isFinite(displayValue) &&
              Math.abs(Number(dbValue) - Number(displayValue)) < 0.001),
      difference: typeof dbValue === 'number' && typeof displayValue === 'number'
        ? dbValue - displayValue
        : null
    });
  });

  return comparisons;
};

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
  testResults: any;
}

export interface FieldComparison {
  field: string;
  dbValue: any;
  displayValue: any;
  match: boolean;
  difference: number | null;
}

/**
 * 批量验证数据
 */
export const validateBatchData = (dataList: BeehiveData[]): BatchValidationResult => {
  const validations = dataList.map((data, index) => ({
    index,
    data,
    result: validateDataMapping(data)
  }));

  const allErrors = validations.flatMap(v => v.result.errors);
  const allWarnings = validations.flatMap(v => v.result.warnings);
  const allInfo = validations.flatMap(v => v.result.info);

  return {
    total: dataList.length,
    valid: validations.filter(v => v.result.isValid).length,
    invalid: validations.filter(v => !v.result.isValid).length,
    errors: allErrors,
    warnings: allWarnings,
    info: allInfo,
    details: validations
  };
}

export interface BatchValidationResult {
  total: number;
  valid: number;
  invalid: number;
  errors: string[];
  warnings: string[];
  info: string[];
  details: Array<{
    index: number;
    data: BeehiveData;
    result: ValidationResult;
  }>;
}