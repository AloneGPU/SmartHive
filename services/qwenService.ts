import { BeehiveData, AIAnalysisResult, CustomAIConfig, HiveConfig, PhysicalAssessmentResult } from "../types";

/**
 * 使用通义千问（Qwen）API 进行蜂箱健康分析
 */
export const analyzeHiveHealth = async (
  data: BeehiveData, 
  config: CustomAIConfig,
  hiveConfig?: HiveConfig
): Promise<AIAnalysisResult> => {
  // 优先使用自定义配置，如果没有则回退到环境变量
  const activeApiKey = config.isActive ? config.apiKey : process.env.QWEN_API_KEY || process.env.API_KEY;
  const activeModel = config.isActive ? config.modelName : 'qwen-turbo';

  if (!activeApiKey) {
    throw new Error("API Key 未配置，请在设置中输入通义千问API密钥");
  }

  // 构建更丰富的上下文
  const harvestContext = hiveConfig ? `
    养殖配置信息:
    - 上次采蜜时间: ${new Date(hiveConfig.lastHarvestDate || Date.now()).toLocaleDateString()}
    - 目标产量: ${hiveConfig.targetWeight}kg
    - 距离上次采蜜: ${Math.floor((Date.now() - (hiveConfig.lastHarvestDate || Date.now())) / (1000 * 60 * 60 * 24))}天
  ` : '';

  const prompt = `
作为资深数字化养蜂专家，请分析以下蜂箱多维传感数据并给出专业决策。
${harvestContext}

实时指标:
- 环境: 温度 ${data.temperature}°C, 湿度 ${data.humidity}%
- 生产: 重量 ${data.weight}kg
- 行为: 入巢 ${data.beesIn}, 出巢 ${data.beesOut}, 差值 ${data.beesIn - data.beesOut}
- 威胁: 胡蜂检测 ${data.hornetsDetected}只

分析重点:
1. 温湿度稳定性是否适合幼虫发育？
2. 进出蜂比例是否暗示分蜂风险、盗蜂现象或中暑倾向？
3. 根据重量趋势和距离上次采蜜的时间，结合当前重量与目标重量(${hiveConfig?.targetWeight || 50}kg)，预测最佳采蜜时机。

请严格返回如下 JSON 格式（不要包含任何其他文字，只返回JSON）：
{
  "healthScore": 85,
  "summary": "分析蜂群状态的专业洞察，重点包含对采蜜时间的预测，50字以内",
  "recommendations": ["建议1", "建议2", "建议3"]
}
`;

  try {
    // 使用通义千问API（兼容OpenAI格式）
    // Qwen API 使用固定的 DashScope 地址
    const apiUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeApiKey}`
      },
      body: JSON.stringify({
        model: activeModel,
        messages: [
          {
            role: 'system',
            content: '你是一位资深的数字化养蜂专家，擅长分析蜂箱传感器数据并提供专业的养殖建议。请始终以JSON格式返回分析结果。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Qwen API Error:', errorData);
      
      if (response.status === 401) {
        throw new Error('API Key 无效，请检查您的通义千问API密钥');
      } else if (response.status === 429) {
        throw new Error('API 调用频率超限，请稍后再试');
      } else {
        throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
      }
    }

    const result = await response.json();
    
    // 提取回复内容
    const content = result.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("AI 未返回有效数据");
    }

    // 解析JSON响应
    let parsed;
    try {
      // 尝试直接解析
      parsed = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (parseError) {
      // 如果解析失败，尝试提取JSON部分
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("无法解析AI返回的JSON数据");
      }
    }

    // 验证返回的数据结构
    if (typeof parsed.healthScore !== 'number' || !parsed.summary || !Array.isArray(parsed.recommendations)) {
      throw new Error("AI返回的数据格式不正确");
    }

    return {
      healthScore: Math.max(0, Math.min(100, parsed.healthScore)), // 确保分数在0-100之间
      summary: parsed.summary || "分析完成",
      recommendations: Array.isArray(parsed.recommendations) 
        ? parsed.recommendations.slice(0, 3) // 最多3条建议
        : ["请检查蜂箱状态", "关注温湿度变化", "定期检查蜂群健康"],
      lastUpdated: Date.now()
    };

  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    
    // 处理特定的错误信息
    let errorMsg = "AI 诊断引擎暂时不可用，请检查网络或配置。";
    if (error?.message) {
      if (error.message.includes('API Key')) {
        errorMsg = "API Key 无效，请重新配置通义千问API密钥";
      } else if (error.message.includes('网络') || error.message.includes('fetch')) {
        errorMsg = "网络连接失败，请检查网络环境";
      } else {
        errorMsg = error.message;
      }
    }
      
    return {
      healthScore: 0,
      summary: errorMsg,
      recommendations: [
        "检查通义千问 API Key 是否正确配置",
        "检查网络环境是否正常（需要能访问阿里云服务）",
        "尝试切换到其他Qwen模型（如qwen-plus）"
      ],
      lastUpdated: Date.now()
    };
  }
};

/**
 * AI综合分析生成蜂群体质评估数据
 * 通过AI分析传感器数据，生成可信的体质评估分数
 */
export const analyzePhysicalAssessment = async (
  data: BeehiveData,
  history: BeehiveData[],
  config: CustomAIConfig
): Promise<PhysicalAssessmentResult> => {
  const activeApiKey = config.isActive ? config.apiKey : process.env.QWEN_API_KEY || process.env.API_KEY;
  const activeModel = config.isActive ? config.modelName : 'qwen-turbo';

  if (!activeApiKey) {
    // 如果没有API Key，使用基于规则的简单计算作为后备
    return {
      生产效率: Math.min(100, Math.max(0, (data.weight / 50) * 100)),
      控温能力: data.temperature >= 33 && data.temperature <= 36 ? 95 : Math.max(0, 100 - Math.abs(data.temperature - 34.5) * 10),
      归巢防御: data.beesOut > 0 ? Math.min(100, (data.beesIn / data.beesOut) * 100) : 100,
      lastUpdated: Date.now()
    };
  }

  // 计算历史趋势
  const avgTemp = history.length > 0 
    ? history.reduce((sum, h) => sum + h.temperature, 0) / history.length 
    : data.temperature;
  const tempStability = history.length > 1
    ? 100 - (history.reduce((sum, h, i, arr) => {
        if (i === 0) return 0;
        return sum + Math.abs(h.temperature - arr[i-1].temperature);
      }, 0) / history.length) * 10
    : 100;
  const weightTrend = history.length > 1
    ? ((history[history.length - 1].weight - history[0].weight) / history.length) * 10
    : 0;

  const prompt = `
作为资深数字化养蜂专家，请基于以下传感器数据综合分析蜂群体质，给出三个维度的专业评分（0-100分）。

实时数据:
- 温度: ${data.temperature}°C (历史平均: ${avgTemp.toFixed(1)}°C, 稳定性: ${tempStability.toFixed(1)})
- 湿度: ${data.humidity}%
- 重量: ${data.weight}kg (趋势: ${weightTrend > 0 ? '上升' : weightTrend < 0 ? '下降' : '稳定'})
- 入巢: ${data.beesIn}只
- 出巢: ${data.beesOut}只
- 归巢率: ${data.beesOut > 0 ? ((data.beesIn / data.beesOut) * 100).toFixed(1) : 100}%
- 胡蜂威胁: ${data.hornetsDetected}只

请从专业角度评估以下三个维度，并给出0-100的分数：

1. **生产效率**：综合考虑重量、重量增长趋势、采集活跃度（进出蜂数量）等因素
2. **控温能力**：综合考虑当前温度、温度稳定性、湿度等因素
3. **归巢防御**：综合考虑归巢率、进出蜂比例、胡蜂威胁等因素

请严格返回如下 JSON 格式（不要包含任何其他文字，只返回JSON）：
{
  "生产效率": 85,
  "控温能力": 90,
  "归巢防御": 75
}
`;

  try {
    const apiUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeApiKey}`
      },
      body: JSON.stringify({
        model: activeModel,
        messages: [
          {
            role: 'system',
            content: '你是一位资深的数字化养蜂专家，擅长基于传感器数据评估蜂群体质。请始终以JSON格式返回分析结果，分数范围0-100。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.5, // 降低温度以获得更稳定的结果
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`);
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("AI 未返回有效数据");
    }

    let parsed;
    try {
      parsed = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (parseError) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("无法解析AI返回的JSON数据");
      }
    }

    // 验证并规范化数据
    return {
      生产效率: Math.max(0, Math.min(100, parsed.生产效率 || parsed['生产效率'] || 50)),
      控温能力: Math.max(0, Math.min(100, parsed.控温能力 || parsed['控温能力'] || 50)),
      归巢防御: Math.max(0, Math.min(100, parsed.归巢防御 || parsed['归巢防御'] || 50)),
      lastUpdated: Date.now()
    };

  } catch (error: any) {
    console.error("Physical Assessment AI Error:", error);
    
    // 如果AI分析失败，使用基于规则的简单计算
    return {
      生产效率: Math.min(100, Math.max(0, (data.weight / 50) * 100)),
      控温能力: data.temperature >= 33 && data.temperature <= 36 ? 95 : Math.max(0, 100 - Math.abs(data.temperature - 34.5) * 10),
      归巢防御: data.beesOut > 0 ? Math.min(100, (data.beesIn / data.beesOut) * 100) : 100,
      lastUpdated: Date.now()
    };
  }
};

/**
 * 验证 Qwen API Key 和模型是否可用
 */
export const validateConfig = async (apiKey: string, modelName: string): Promise<boolean> => {
  try {
    const apiUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName || 'qwen-turbo',
        messages: [
          {
            role: 'user',
            content: '请简短回复：配置已连接'
          }
        ],
        max_tokens: 10
      })
    });

    if (!response.ok) {
      return false;
    }

    const result = await response.json();
    return !!result.choices?.[0]?.message?.content;
  } catch (e) {
    console.error("Validation failed:", e);
    return false;
  }
};

