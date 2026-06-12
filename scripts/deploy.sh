#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

IMAGE_NAME="${IMAGE_NAME:-dtc-dashboard}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

usage() {
  cat <<'EOF'
DTC Dashboard Docker 部署脚本

用法:
  ./scripts/deploy.sh build          构建镜像
  ./scripts/deploy.sh up             构建并后台启动（docker compose）
  ./scripts/deploy.sh down           停止并移除容器
  ./scripts/deploy.sh restart        重启服务
  ./scripts/deploy.sh logs           查看日志
  ./scripts/deploy.sh status         查看容器与健康检查状态
  ./scripts/deploy.sh push [registry] 推送镜像（例: registry.example.com/dtc-dashboard）

环境变量:
  IMAGE_NAME   镜像名（默认 dtc-dashboard）
  IMAGE_TAG    镜像标签（默认 latest）
  COMPOSE_FILE compose 文件路径（默认 docker-compose.yml）

上线前请确认:
  1. 已复制 .env.example 为 .env 并填入生产配置
  2. SHOPIFY_APP_HOST / PUBLIC_SITE_URL 使用 HTTPS 公网域名
  3. Supabase Auth 回调 URL 已配置生产域名
EOF
}

require_env_file() {
  if [[ ! -f .env ]]; then
    echo "错误: 未找到 .env，请先复制 .env.example 并填入生产环境变量" >&2
    exit 1
  fi
}

cmd_build() {
  docker build -t "${IMAGE_NAME}:${IMAGE_TAG}" .
  echo "镜像已构建: ${IMAGE_NAME}:${IMAGE_TAG}"
}

cmd_up() {
  require_env_file
  docker compose -f "$COMPOSE_FILE" up -d --build
  echo "服务已启动，健康检查: http://localhost:${PORT:-8080}/health"
}

cmd_down() {
  docker compose -f "$COMPOSE_FILE" down
}

cmd_restart() {
  docker compose -f "$COMPOSE_FILE" restart
}

cmd_logs() {
  docker compose -f "$COMPOSE_FILE" logs -f --tail=200
}

cmd_status() {
  docker compose -f "$COMPOSE_FILE" ps
}

cmd_push() {
  local registry="${1:-}"
  if [[ -z "$registry" ]]; then
    echo "错误: 请指定镜像仓库地址，例如 ./scripts/deploy.sh push registry.example.com/dtc-dashboard" >&2
    exit 1
  fi
  docker tag "${IMAGE_NAME}:${IMAGE_TAG}" "${registry}:${IMAGE_TAG}"
  docker push "${registry}:${IMAGE_TAG}"
  echo "已推送: ${registry}:${IMAGE_TAG}"
}

main() {
  local cmd="${1:-}"
  shift || true

  case "$cmd" in
    build)   cmd_build ;;
    up)      cmd_up ;;
    down)    cmd_down ;;
    restart) cmd_restart ;;
    logs)    cmd_logs ;;
    status)  cmd_status ;;
    push)    cmd_push "$@" ;;
    -h|--help|help|"") usage ;;
    *)
      echo "未知命令: $cmd" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
