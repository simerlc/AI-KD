# AI快搭 V1 沙箱镜像
#
# 基础镜像：node:20-alpine
# 预装：Vite 5 + 常用 React 依赖（在容器启动时按 package.json 安装）
#
# 容器内工作目录固定为 /app，由主机挂载 ./workspaces/{appId} 进来。
# Vite Dev Server 监听 5173 端口（容器内），主机端口由 sandbox 动态映射。

FROM node:20-alpine

# 安装最小化系统依赖（git 用于可能的 npm 包解析）
RUN apk add --no-cache git

# 预装 Vite 主版本（避免每次启动都拉取）
# 实际项目依赖在容器启动时通过 npm install 安装
RUN npm install -g vite@^5.4.0

# 工作目录（由主机挂载覆盖）
WORKDIR /app

# 容器内监听端口
EXPOSE 5173

# 默认启动命令：安装依赖 + 启动 Vite Dev Server
# --host 0.0.0.0 让容器外可访问
# --port 5173 固定端口，由 sandbox 端映射到主机
CMD ["sh", "-c", "npm install --no-audit --no-fund && npx vite --host 0.0.0.0 --port 5173 --strictPort"]
