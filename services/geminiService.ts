
import { GoogleGenAI, Type } from "@google/genai";
import { BeehiveData, AIAnalysisResult, CustomAIConfig } from "../types";

export const analyzeHiveHealth = async (
  data: BeehiveData, 
  config: CustomAIConfig
): Promise<AIAnalysisResult> => {
  // 优先使用自定义配置，如果没有则回退到环境变量
  const activeApiKey = config.isActive ? config.apiKey : process.env.API_KEY;
  const activeModel = config.isActive ? config.modelName : 'gemini-3-flash-preview';

  if (!activeApiKey) {
    throw new Error("API Key 未配置，请在设置中输入密钥");
  }

  const ai = new GoogleGenAI({ apiKey: activeApiKey });

  const prompt = `
    作为资深数字化养蜂专家，请分析以下蜂箱多维传感数据并给出专业决策。
    
    实时指标:
    - 环境: 温度 ${data.temperature}°C, 湿度 ${data.humidity}%
    - 生产: 重量 ${data.weight}kg
    - behavior: 入巢 ${data.beesIn}, 出巢 ${data.beesOut}, 差值 ${data.beesIn - data.beesOut}
    
    分析重点:
    1. 温湿度稳定性是否适合幼虫发育？
    2. 进出蜂比例是否暗示分蜂风险、盗蜂现象或中暑倾向？
    3. 根据重量趋势判断是否处于蜜源植物丰产期？

    请严格返回如下 JSON 格式：
    {
      "healthScore": (0-100),
      "summary": (分析蜂群状态的专业洞察，50字以内，中文),
      "recommendations": (3条具备可操作性的专家建议，数组，中文)
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: activeModel,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                healthScore: { type: Type.INTEGER },
                summary: { type: Type.STRING },
                recommendations: { 
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        }
      }
    });

    const result = response.text;
    if (!result) throw new Error("AI 未返回有效数据");
    
    const parsed = JSON.parse(result);
    return {
        ...parsed,
        lastUpdated: Date.now()
    };

  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    // 处理特定的 Key 错误
    const errorMsg = error?.message?.includes('API_KEY_INVALID') 
      ? "API Key 无效，请重新配置" 
      : "AI 诊断引擎暂时不可用，请检查网络或配置。";
      
    return {
      healthScore: 0,
      summary: errorMsg,
      recommendations: ["检查自定义 API Key 是否正确", "检查网络环境是否正常", "尝试切换到 Flash 模型"],
      lastUpdated: Date.now()
    };
  }
};

/**
 * 验证 API Key 和模型是否可用
 */
export const validateConfig = async (apiKey: string, modelName: string): Promise<boolean> => {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelName,
      contents: "请简短回复：配置已连接",
    });
    return !!response.text;
  } catch (e) {
    console.error("Validation failed:", e);
    return false;
  }
};
