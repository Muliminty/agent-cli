#!/bin/bash

# Todo应用测试运行脚本
# 设计思路：提供完整的测试执行流程，包括环境检查、服务器启动、测试执行和清理

set -e  # 遇到错误时退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "命令 '$1' 未找到，请先安装"
        exit 1
    fi
}

# 检查端口是否被占用
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        log_warning "端口 $port 已被占用"
        return 1
    fi
    return 0
}

# 等待服务器启动
wait_for_server() {
    local url=$1
    local max_attempts=30
    local attempt=1

    log_info "等待服务器启动..."

    while [ $attempt -le $max_attempts ]; do
        if curl -s -f $url > /dev/null 2>&1; then
            log_success "服务器已启动"
            return 0
        fi

        log_info "尝试 $attempt/$max_attempts: 服务器尚未就绪，等待 1 秒..."
        sleep 1
        attempt=$((attempt + 1))
    done

    log_error "服务器启动超时"
    return 1
}

# 清理函数
cleanup() {
    log_info "执行清理..."

    # 停止服务器
    if [ ! -z "$SERVER_PID" ]; then
        log_info "停止服务器 (PID: $SERVER_PID)"
        kill $SERVER_PID 2>/dev/null || true
        wait $SERVER_PID 2>/dev/null || true
    fi

    # 清理临时目录
    if [ -d "./tmp" ]; then
        rm -rf ./tmp
        log_info "已清理临时目录"
    fi

    log_success "清理完成"
}

# 设置陷阱，确保脚本退出时执行清理
trap cleanup EXIT INT TERM

# 主函数
main() {
    log_info "开始执行 Todo 应用测试"
    log_info "当前目录: $(pwd)"

    # 检查必要命令
    check_command "node"
    check_command "npm"
    check_command "curl"

    # 检查 agent-cli 是否可用
    if ! command -v agent-cli &> /dev/null; then
        log_warning "agent-cli 未在 PATH 中找到，尝试使用本地版本..."
        if [ -f "../../dist/index.js" ]; then
            AGENT_CLI="node ../../dist/index.js"
        else
            log_error "未找到 agent-cli，请先构建项目"
            exit 1
        fi
    else
        AGENT_CLI="agent-cli"
    fi

    log_info "使用 agent-cli: $AGENT_CLI"

    # 创建必要的目录
    mkdir -p ./screenshots ./reports ./logs

    # 检查端口
    PORT=3000
    if ! check_port $PORT; then
        log_error "请先停止占用端口 $PORT 的进程"
        exit 1
    fi

    # 启动服务器
    log_info "启动本地服务器..."
    node ./scripts/start-server.js &
    SERVER_PID=$!

    # 等待服务器启动
    if ! wait_for_server "http://localhost:$PORT"; then
        log_error "服务器启动失败"
        exit 1
    fi

    # 运行测试
    log_info "开始执行测试..."

    # 检查测试配置文件
    if [ ! -f "./test-config.json" ]; then
        log_error "未找到测试配置文件: test-config.json"
        exit 1
    fi

    # 执行测试命令
    TEST_COMMAND="$AGENT_CLI test --config ./test-config.json --report-dir ./reports --screenshot-dir ./screenshots"

    log_info "执行命令: $TEST_COMMAND"

    # 执行测试
    if $TEST_COMMAND; then
        log_success "测试执行完成"

        # 检查报告文件
        if [ -f "./reports/test-report.html" ]; then
            log_success "测试报告已生成: ./reports/test-report.html"
        fi

        if [ -f "./reports/test-report.json" ]; then
            log_success "JSON报告已生成: ./reports/test-report.json"
        fi

        # 显示测试统计
        if [ -f "./reports/test-report.json" ]; then
            echo ""
            log_info "测试统计:"
            node -e "
                const fs = require('fs');
                try {
                    const report = JSON.parse(fs.readFileSync('./reports/test-report.json', 'utf8'));
                    console.log('总测试套件:', report.summary.totalSuites);
                    console.log('总测试用例:', report.summary.totalTests);
                    console.log('通过:', report.summary.passed);
                    console.log('失败:', report.summary.failed);
                    console.log('跳过:', report.summary.skipped);
                    console.log('成功率:', ((report.summary.passed / report.summary.totalTests) * 100).toFixed(2) + '%');
                    console.log('总耗时:', (report.summary.duration / 1000).toFixed(2) + '秒');
                } catch (e) {
                    console.log('无法解析报告文件');
                }
            "
        fi

    else
        log_error "测试执行失败"
        exit 1
    fi

    log_success "所有测试完成"
}

# 显示帮助信息
show_help() {
    echo "Todo 应用测试运行脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help     显示此帮助信息"
    echo "  -p, --port     指定服务器端口 (默认: 3000)"
    echo "  -s, --suite    指定测试套件文件"
    echo "  -t, --test     指定单个测试用例"
    echo "  --no-server    不启动服务器（使用已运行的服务器）"
    echo "  --headless     无头模式运行浏览器"
    echo ""
    echo "示例:"
    echo "  $0                    # 运行所有测试"
    echo "  $0 -p 8080            # 在端口 8080 运行测试"
    echo "  $0 -s todo-basic      # 只运行基础测试套件"
}

# 解析命令行参数
PORT=3000
START_SERVER=true
HEADLESS=true
TEST_SUITE=""
TEST_CASE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -p|--port)
            PORT="$2"
            shift 2
            ;;
        -s|--suite)
            TEST_SUITE="$2"
            shift 2
            ;;
        -t|--test)
            TEST_CASE="$2"
            shift 2
            ;;
        --no-server)
            START_SERVER=false
            shift
            ;;
        --headless)
            HEADLESS=true
            shift
            ;;
        *)
            log_error "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
done

# 运行主函数
main