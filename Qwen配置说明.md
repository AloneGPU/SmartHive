# 通义千问 (Qwen) API 配置指南

## 📋 为什么选择通义千问？

- ✅ **国内可用**: 无需翻墙，访问速度快
- ✅ **中文优化**: 对中文理解更好，适合国内蜂农使用
- ✅ **价格实惠**: 相比国外服务，价格更友好
- ✅ **稳定可靠**: 阿里云服务，稳定性和可靠性有保障

## 🔑 获取 API Key

### 步骤 1: 注册阿里云账号

1. 访问 [阿里云官网](https://www.aliyun.com/)
2. 注册/登录账号（如果没有账号）

### 步骤 2: 开通 DashScope 服务

1. 访问 [DashScope 控制台](https://dashscope.console.aliyun.com/)
2. 点击"开通服务"
3. 完成实名认证（如需要）

### 步骤 3: 创建 API Key

1. 在 DashScope 控制台，进入 **API-KEY 管理**
2. 点击 **创建新的 API Key**
3. 复制生成的 API Key（格式类似：`sk-xxxxxxxxxxxxx`）
4. **重要**: 请妥善保管，API Key 只显示一次

### 步骤 4: 配置到项目

#### 方式一：通过 .env 文件配置（推荐）

在项目根目录的 `.env` 文件中添加：

```env
QWEN_API_KEY=sk-你的API密钥
```

#### 方式二：通过前端界面配置

1. 启动项目后，访问前端页面
2. 点击右上角的"设置"按钮（齿轮图标）
3. 在 AI 配置部分输入 API Key
4. 选择模型（推荐使用 `qwen-turbo`）
5. 点击"验证连接并同步"

## 🎯 支持的模型

| 模型名称 | 特点 | 适用场景 |
|---------|------|---------|
| **qwen-turbo** | 快速响应，成本低 | 实时分析、日常使用（推荐） |
| **qwen-plus** | 平衡性能和质量 | 需要更准确的分析 |
| **qwen-max** | 最强性能 | 复杂场景、重要决策 |
| **qwen-max-longcontext** | 长文本支持 | 需要分析大量历史数据 |

## 💰 费用说明

- 通义千问提供一定的免费额度
- 超出免费额度后按量计费
- 具体价格请查看 [DashScope 定价页面](https://help.aliyun.com/zh/model-studio/developer-reference/tongyi-thousand-questions-metering-and-billing)
- 对于日常使用，免费额度通常足够

## 🔧 测试配置

配置完成后，可以通过以下方式测试：

1. 在前端页面点击"生成智能生产报告"
2. 如果配置正确，会显示 AI 分析结果
3. 如果配置错误，会显示具体的错误信息

## ❓ 常见问题

### Q: API Key 在哪里获取？
A: 访问 https://dashscope.console.aliyun.com/ → API-KEY 管理

### Q: 提示 "API Key 无效"？
A: 请检查：
- API Key 是否完整复制（包括 `sk-` 前缀）
- API Key 是否已过期或被删除
- 是否开通了 DashScope 服务

### Q: 提示 "网络连接失败"？
A: 请检查：
- 网络是否能正常访问阿里云服务
- 防火墙是否阻止了连接
- 是否使用了代理（可能需要配置代理）

### Q: 如何查看使用量和费用？
A: 在 DashScope 控制台的"用量统计"页面可以查看

### Q: 可以更换模型吗？
A: 可以，在前端设置界面可以随时切换不同的 Qwen 模型

## 📞 技术支持

- [DashScope 官方文档](https://help.aliyun.com/zh/model-studio/)
- [阿里云技术支持](https://www.aliyun.com/service)

---

**提示**: 首次使用建议先用 `qwen-turbo` 模型测试，确认配置正确后再根据需要选择其他模型。

