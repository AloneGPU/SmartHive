import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, Bot, Clock, X, AlertCircle } from 'lucide-react';
import { ChatMessage, CustomAIConfig } from '../types';

interface AIChatWindowProps {
  config: CustomAIConfig;
}

export const AIChatWindow: React.FC<AIChatWindowProps> = ({ config }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickQuestions = [
    { id: 'today-health', label: '今天健康情况', text: '请根据我今天的蜂箱数据，告诉我蜂群健康情况如何？重点看温湿度、马蜂风险、进出蜂活跃度，并给出今天要做的3件事。' },
    { id: 'week-health', label: '本周健康趋势', text: '请根据我本周的数据，总结蜂群健康趋势（变好/变差）和主要原因，并给出下周的管理建议。' },
    { id: 'today-honey', label: '今天产蜜估算', text: '请根据今天重量变化，估算今天的产蜜/增重情况，并说明这个估算可能受哪些因素影响。' },
    { id: 'week-honey', label: '本周产蜜估算', text: '请根据本周重量变化，估算本周的产蜜/增重情况，并给出是否建议取蜜的判断依据。' },
    { id: 'risk', label: '风险点排查', text: '请帮我做一次风险排查：温度、湿度、马蜂、进出蜂是否异常？如果异常，按优先级告诉我怎么处理。' },
    { id: 'action', label: '一键操作清单', text: '请给我一个通俗易懂的“今日蜂场操作清单”，按优先级列出要做的事，每条不超过两句话。' }
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const generateId = () => {
    return Math.random().toString(36).substr(2, 9);
  };

  const callBackendAIChat = async (userMessage: string): Promise<string> => {
    const baseUrl = (config.apiBaseUrl || '/api').trim() || '/api';
    const token = (config.apiToken || '').trim();
    const modelName = (config.modelName || 'qwen-flash').trim() || 'qwen-flash';
    if (!token) {
      throw new Error('未配置后端 API Token（API_TOKEN），请在管理员界面完成配置后再使用 AI 问答');
    }

    const response = await fetch(`${baseUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        message: userMessage,
        modelName
      })
    });

    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const msg = payload?.message || payload?.error || text || `请求失败: ${response.status} ${response.statusText}`;
      throw new Error(String(msg));
    }

    const answer = payload?.answer;
    if (!answer) throw new Error('AI 未返回有效内容');
    return String(answer);
  };

  const handleSend = async (overrideMessage?: string) => {
    const text = (overrideMessage ?? input).trim();
    if (!text || isLoading) return;

    const userMessage: ChatMessage = {
      id: generateId(),
      content: text,
      sender: 'user',
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = text;
    setInput('');
    setIsLoading(true);

    try {
      const aiResponse = await callBackendAIChat(currentInput);
      const aiMessage: ChatMessage = {
        id: generateId(),
        content: aiResponse,
        sender: 'ai',
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error: any) {
      console.error('AI response error:', error);
      const errorMessage: ChatMessage = {
        id: generateId(),
        content: error?.message || 'AI 服务暂时不可用，请检查网络连接或API配置。',
        sender: 'ai',
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const sendQuickQuestion = async (text: string) => {
    if (isLoading || !config.apiToken) return;
    await handleSend(text);
  };

  const clearMessages = () => {
    setMessages([]);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
            <Bot className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">AI养蜂顾问</h3>
            <p className="text-xs text-gray-500">随时解答您的养蜂问题</p>
          </div>
        </div>
        <button
          onClick={clearMessages}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-full"
          title="清空对话"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="h-[500px] sm:h-[600px] overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <MessageSquare className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm font-medium">开始与AI养蜂顾问对话</p>
            <p className="text-xs mt-1 text-center px-4">您可以询问关于养蜂的任何问题，例如：</p>
            <div className="mt-4 w-full max-w-md px-4">
              <div className="text-xs text-gray-500 mb-2">常用问题（点击直接询问）</div>
              <div className="grid grid-cols-2 gap-2">
                {quickQuestions.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => void sendQuickQuestion(q.text)}
                    disabled={!config.apiToken || isLoading}
                    className={`text-left text-xs rounded-xl border px-3 py-2 transition-colors ${
                      !config.apiToken || isLoading
                        ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700'
                    }`}
                    title={q.text}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 text-[11px] text-gray-400">
                也可以在下方输入框里自己提问（支持“今天/本周”等时间范围）。
              </div>
            </div>
            {!config.apiToken && (
              <div className="mt-4 flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-2 rounded-lg">
                <AlertCircle className="w-4 h-4" />
                <p className="text-xs">请先配置后端 API Token（API_TOKEN）</p>
              </div>
            )}
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[80%] rounded-2xl p-3 ${
                  message.sender === 'user' 
                    ? 'bg-indigo-50 text-indigo-900' 
                    : 'bg-gray-50 text-gray-800'
                }`}
              >
                {message.sender === 'ai' && (
                  <div className="flex items-center gap-2 mb-2">
                    <Bot className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-semibold text-indigo-600">AI养蜂顾问</span>
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                <div className="flex items-center mt-2">
                  <Clock className="w-3 h-3 mr-1 text-gray-400" />
                  <span className="text-xs text-gray-500">
                    {new Date(message.timestamp).toLocaleTimeString('zh-CN', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-50 rounded-2xl p-3 max-w-[80%]">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-semibold text-indigo-600">AI养蜂顾问</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-100 bg-gray-50">
        <div className="mb-2 flex flex-wrap gap-2">
          {quickQuestions.slice(0, 4).map((q) => (
            <button
              key={`chip-${q.id}`}
              type="button"
              onClick={() => setInput(q.text)}
              disabled={!config.apiToken || isLoading}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                !config.apiToken || isLoading
                  ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
              title="点击填入问题，可编辑后发送"
            >
              {q.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={config.apiToken ? "输入您的养蜂问题..." : "请先配置API_TOKEN..."}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            disabled={isLoading || !config.apiToken}
          />
          <button
            onClick={() => void handleSend()}
            disabled={isLoading || !input.trim() || !config.apiToken}
            className={`bg-indigo-600 text-white rounded-xl px-4 py-2.5 hover:bg-indigo-700 transition-colors flex items-center gap-2 ${
              (isLoading || !input.trim() || !config.apiToken) 
                ? 'opacity-50 cursor-not-allowed' 
                : ''
            }`}
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span className="text-sm hidden sm:inline">思考中...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span className="text-sm hidden sm:inline">发送</span>
              </>
            )}
          </button>
        </div>
        {!config.apiToken && (
          <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            需要配置后端 API Token（API_TOKEN）才能使用AI问答功能
          </p>
        )}
      </div>
    </div>
  );
};
