import React, { useState } from 'react';
import { BeehiveData, AIAnalysisResult } from '../types';
import { useAppContext } from '../context/AppContext';
import { analyzeHiveHealth } from '../services/qwenService';
import { Bot, Send, User } from 'lucide-react';

interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  analysis?: AIAnalysisResult;
}

interface AIAssistantPanelProps {
  data: BeehiveData[];
  className?: string;
}

export const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({
  data,
  className = ''
}) => {
  const { aiConfig } = useAppContext();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'ai',
      content: '您好！我是您的智能蜂箱助手。我可以帮您分析蜂箱数据、检测异常并提供管理建议。请问有什么需要我帮助的吗？',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [recentAnalysis, setRecentAnalysis] = useState<AIAnalysisResult | null>(null);

  // 生成AI回复
  const generateAIResponse = async (userMessage: string): Promise<string> => {
    const dataPoints = data.slice(-50); // 最近50个数据点
    if (dataPoints.length === 0) {
      return '抱歉，当前没有足够的数据进行分析。请稍后再试。';
    }

    try {
      // 根据用户问题生成提示词
      let prompt = userMessage;

      if (userMessage.includes('温度') || userMessage.includes('湿度') || userMessage.includes('环境')) {
        prompt = `分析蜂箱环境数据。当前温度: ${dataPoints[dataPoints.length - 1].temperature}°C,
                 湿度: ${dataPoints[dataPoints.length - 1].humidity}%。
                 过去24小时数据变化趋势如何？有什么环境风险吗？`;
      } else if (userMessage.includes('活动') || userMessage.includes('蜜蜂')) {
        prompt = `分析蜜蜂活动数据。最近检测到的活动情况如何？是否正常？有什么异常行为吗？`;
      } else if (userMessage.includes('马蜂')) {
        prompt = `分析马蜂检测数据。最近有马蜂活动吗？频率如何？需要采取什么防护措施？`;
      } else if (userMessage.includes('健康') || userMessage.includes('状态')) {
        prompt = `分析蜂箱整体健康状况。基于最近的数据，蜂群健康状态如何？有什么需要关注的？`;
      } else if (userMessage.includes('建议') || userMessage.includes('管理')) {
        prompt = `提供蜂箱管理建议。根据当前数据，应该采取哪些管理措施？`;
      } else {
        prompt = `基于蜂箱数据回答用户问题：${userMessage}`;
      }

      // 构建AI分析请求
      const latest = dataPoints[dataPoints.length - 1];
      const stats = {
        points: dataPoints.length,
        range: { start: dataPoints[0].timestamp, end: latest.timestamp },
        temperature: {
          min: Math.min(...dataPoints.map(d => d.temperature)),
          max: Math.max(...dataPoints.map(d => d.temperature)),
          latest: latest.temperature
        },
        humidity: {
          min: Math.min(...dataPoints.map(d => d.humidity)),
          max: Math.max(...dataPoints.map(d => d.humidity)),
          latest: latest.humidity
        }
      };

      const aiResponse = await analyzeHiveHealth(latest, dataPoints, {
        apiKey: aiConfig.apiKey,
        modelName: aiConfig.modelName
      });

      setRecentAnalysis(aiResponse);

      // 生成友好的回复
      return generateFriendlyResponse(userMessage, aiResponse, prompt);
    } catch (error) {
      console.error('AI分析失败:', error);
      return '抱歉，我遇到了一些问题。请稍后再试。';
    }
  };

  // 生成友好的回复文本
  const generateFriendlyResponse = (
    userMessage: string,
    analysis: AIAnalysisResult,
    originalPrompt: string
  ): string => {
    const healthScore = analysis.healthScore;

    // 根据健康评分生成不同的回复风格
    if (healthScore >= 80) {
      return `🎉 蜂群状态良好！健康评分 ${healthScore}/100。

📊 数据摘要：
${analysis.summary}

💡 建议：
${analysis.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

${analysis.events.length > 0 ? '⚠️ 注意：' + analysis.events.map(e => e.msg).join('；') : ''}

需要了解更详细的信息吗？`;
    } else if (healthScore >= 60) {
      return `🤔 蜂群状态一般，需要关注。健康评分 ${healthScore}/100。

📊 数据分析：
${analysis.summary}

⚠️ 需要注意：
${analysis.recommendations.slice(0, 3).map((r, i) => `${i + 1}. ${r}`).join('\n')}

${analysis.events.length > 0 ? '🚨 重要提醒：' + analysis.events.map(e => e.msg).join('；') : ''}

建议您密切关注蜂群变化。`;
    } else {
      return `🚨 警告！蜂群状态不佳，健康评分仅 ${healthScore}/100。

📊 严重问题：
${analysis.summary}

🔧 紧急措施：
${analysis.recommendations.map((r, i) => `• ${r}`).join('\n')}

${analysis.events.filter(e => e.type === 'critical').map(e => `🚨 ${e.msg}`).join('\n')}

建议立即采取行动！`;
    }
  };

  // 发送消息
  const sendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const aiResponse = await generateAIResponse(inputValue);
      const attachedAnalysis = recentAnalysis ?? undefined;
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: aiResponse,
        timestamp: new Date(),
        analysis: attachedAnalysis
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: '抱歉，我暂时无法回复。请稍后再试。',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // 处理回车发送
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 预设问题
  const presetQuestions = [
    '蜂群健康状态如何？',
    '最近温度有什么异常吗？',
    '蜜蜂活动正常吗？',
    '需要马蜂防护吗？',
    '蜂箱管理建议'
  ];

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${className}`}>
      {/* 标题 */}
      <div className="flex items-center gap-2 p-4 border-b border-gray-200">
        <Bot className="w-5 h-5 text-purple-600" />
        <h3 className="text-lg font-semibold text-gray-900">AI智能助手</h3>
        {recentAnalysis && (
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full ml-auto">
            最新评分: {recentAnalysis.healthScore}/100
          </span>
        )}
      </div>

      {/* 聊天内容 */}
      <div className="h-96 overflow-y-auto p-4 space-y-4">
        {messages.map(message => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                message.type === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              <div className="flex items-start gap-2">
                {message.type === 'ai' && (
                  <Bot className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                )}
                <div>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  {message.analysis?.detailedAnalysis && (
                    <div className="mt-2 space-y-1 text-xs">
                      <div className="font-medium">详细分析：</div>
                      <div className="space-y-1">
                        <div>
                          <span className="font-medium">环境：</span>
                          <span className="text-gray-600">{message.analysis.detailedAnalysis.environment}</span>
                        </div>
                        <div>
                          <span className="font-medium">行为：</span>
                          <span className="text-gray-600">{message.analysis.detailedAnalysis.behavior}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {message.type === 'user' && (
                  <User className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 预设问题 */}
      {messages.length <= 2 && (
        <div className="px-4 pb-2">
          <p className="text-xs text-gray-500 mb-2">常用问题：</p>
          <div className="flex flex-wrap gap-2">
            {presetQuestions.map((question, index) => (
              <button
                key={index}
                onClick={() => setInputValue(question)}
                className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full hover:bg-gray-200 transition-colors"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 输入框 */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="输入您的问题..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
          <button
            onClick={sendMessage}
            disabled={!inputValue.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};