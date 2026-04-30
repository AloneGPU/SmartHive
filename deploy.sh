#!/bin/bash

# 智能蜂箱项目构建与打包脚本
# 用于生成宝塔面板部署包

echo "=== 智能蜂箱项目一键构建开始 ==="

# 1. 检查 Node.js 环境
if ! command -v node &> /dev/null; then
    echo "错误: Node.js 未安装，请先安装 Node.js v16+"
    exit 1
fi

echo "Node.js 环境检测通过"

# 2. 安装依赖
echo "正在检查并安装依赖..."
npm install --legacy-peer-deps
if [ $? -ne 0 ]; then
    echo "错误: 依赖安装失败"
    exit 1
fi

# 3. 构建前端
echo "正在构建前端..."
npm run build
if [ $? -ne 0 ]; then
    echo "错误: 前端构建失败"
    exit 1
fi

# 4. 构建后端
echo "正在构建后端..."
npm run build:server
if [ $? -ne 0 ]; then
    echo "错误: 后端构建失败"
    exit 1
fi

# 5. 打包文件
echo "正在打包部署文件..."
DEPLOY_DIR="deploy_temp"
rm -rf $DEPLOY_DIR
mkdir -p $DEPLOY_DIR

# 复制文件
cp -r dist $DEPLOY_DIR/
cp -r dist-server $DEPLOY_DIR/
cp package.json $DEPLOY_DIR/
cp .env.example $DEPLOY_DIR/
cp BAOTA_DEPLOYMENT_GUIDE.md $DEPLOY_DIR/README.md

# 创建 ZIP 包
ZIP_FILE="deploy.zip"
rm -f $ZIP_FILE

# 使用 zip 命令打包
if command -v zip &> /dev/null; then
    cd $DEPLOY_DIR
    zip -r ../$ZIP_FILE .
    cd ..
else
    echo "警告: 未找到 zip 命令，无法自动创建压缩包。"
    echo "请手动将 $DEPLOY_DIR 目录下的文件上传到服务器。"
fi

# 清理临时目录
rm -rf $DEPLOY_DIR

echo "=== 构建与打包完成！ ==="
if [ -f "$ZIP_FILE" ]; then
    echo "部署包已生成: $(pwd)/$ZIP_FILE"
    echo "请参照 BAOTA_DEPLOYMENT_GUIDE.md 中的说明上传到宝塔面板部署。"
fi
