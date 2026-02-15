#!/bin/bash

# 测试报告生成脚本
# 设计思路：从测试结果生成可读的报告，支持多种格式输出

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 日志函数
log() {
    echo -e "${CYAN}[REPORT]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查文件是否存在
check_file() {
    if [ ! -f "$1" ]; then
        log_error "文件不存在: $1"
        return 1
    fi
    return 0
}

# 生成文本报告
generate_text_report() {
    local input_file=$1
    local output_file=$2

    log "生成文本报告: $output_file"

    cat > "$output_file" << EOF
Todo应用测试报告
================

生成时间: $(date)
测试环境: $(uname -s) $(uname -r)

测试统计
--------

EOF

    # 从JSON报告提取统计信息
    if [ -f "$input_file" ]; then
        node -e "
            const fs = require('fs');
            try {
                const report = JSON.parse(fs.readFileSync('$input_file', 'utf8'));

                // 写入统计信息
                const summary = report.summary;
                const out = fs.createWriteStream('$output_file', { flags: 'a' });

                out.write(\`总测试套件: \${summary.totalSuites}\\n\`);
                out.write(\`总测试用例: \${summary.totalTests}\\n\`);
                out.write(\`通过: \${summary.passed}\\n\`);
                out.write(\`失败: \${summary.failed}\\n\`);
                out.write(\`跳过: \${summary.skipped}\\n\`);
                out.write(\`成功率: \${((summary.passed / summary.totalTests) * 100).toFixed(2)}%\\n\`);
                out.write(\`总耗时: \${(summary.duration / 1000).toFixed(2)}秒\\n\\n\`);

                // 写入套件详情
                out.write('测试套件详情\\n');
                out.write('--------------\\n\\n');

                report.suites.forEach((suite, suiteIndex) => {
                    out.write(\`\${suiteIndex + 1}. \${suite.name}\\n\`);
                    out.write(\`   描述: \${suite.description || '无'}\\n\`);
                    out.write(\`   状态: \${suite.passed ? '通过' : '失败'}\\n\`);
                    out.write(\`   耗时: \${(suite.duration / 1000).toFixed(2)}秒\\n\`);
                    out.write(\`   通过率: \${suite.tests.filter(t => t.passed).length}/\${suite.tests.length}\\n\\n\`);

                    suite.tests.forEach((test, testIndex) => {
                        out.write(\`   \${testIndex + 1}. \${test.name}\\n\`);
                        out.write(\`      状态: \${test.passed ? '通过' : '失败'}\\n\`);
                        out.write(\`      耗时: \${(test.duration / 1000).toFixed(2)}秒\\n\`);
                        if (!test.passed && test.error) {
                            out.write(\`      错误: \${test.error}\\n\`);
                        }
                        out.write('\\n');
                    });
                });

                out.end();
            } catch (e) {
                console.error('解析JSON报告失败:', e.message);
                process.exit(1);
            }
        "
    else
        log_error "JSON报告文件不存在: $input_file"
        return 1
    fi

    log_success "文本报告已生成: $output_file"
}

# 生成Markdown报告
generate_markdown_report() {
    local input_file=$1
    local output_file=$2

    log "生成Markdown报告: $output_file"

    cat > "$output_file" << EOF
# Todo应用测试报告

**生成时间**: $(date)
**测试环境**: $(uname -s) $(uname -r)

## 测试统计

EOF

    # 从JSON报告提取统计信息
    if [ -f "$input_file" ]; then
        node -e "
            const fs = require('fs');
            try {
                const report = JSON.parse(fs.readFileSync('$input_file', 'utf8'));

                // 写入统计信息
                const summary = report.summary;
                const out = fs.createWriteStream('$output_file', { flags: 'a' });

                out.write(\`| 指标 | 值 |\\n\`);
                out.write(\`|------|-----|\\n\`);
                out.write(\`| 总测试套件 | \${summary.totalSuites} |\\n\`);
                out.write(\`| 总测试用例 | \${summary.totalTests} |\\n\`);
                out.write(\`| 通过 | \${summary.passed} |\\n\`);
                out.write(\`| 失败 | \${summary.failed} |\\n\`);
                out.write(\`| 跳过 | \${summary.skipped} |\\n\`);
                out.write(\`| 成功率 | \${((summary.passed / summary.totalTests) * 100).toFixed(2)}% |\\n\`);
                out.write(\`| 总耗时 | \${(summary.duration / 1000).toFixed(2)}秒 |\\n\\n\`);

                // 写入套件详情
                out.write('## 测试套件详情\\n\\n');

                report.suites.forEach((suite, suiteIndex) => {
                    const passedTests = suite.tests.filter(t => t.passed).length;
                    const totalTests = suite.tests.length;
                    const passRate = ((passedTests / totalTests) * 100).toFixed(2);
                    const statusIcon = suite.passed ? '✅' : '❌';

                    out.write(\`### \${suiteIndex + 1}. \${statusIcon} \${suite.name}\\n\\n\`);
                    out.write(\`**描述**: \${suite.description || '无'}\\n\\n\`);
                    out.write(\`**状态**: \${suite.passed ? '通过' : '失败'}\\n\`);
                    out.write(\`**耗时**: \${(suite.duration / 1000).toFixed(2)}秒\\n\`);
                    out.write(\`**通过率**: \${passedTests}/\${totalTests} (\${passRate}%)\\n\\n\`);

                    out.write('| 测试用例 | 状态 | 耗时 | 错误信息 |\\n');
                    out.write('|----------|------|------|----------|\\n');

                    suite.tests.forEach((test, testIndex) => {
                        const testStatusIcon = test.passed ? '✅' : '❌';
                        const testStatus = test.passed ? '通过' : '失败';
                        const errorMsg = test.error ? test.error.substring(0, 50) + (test.error.length > 50 ? '...' : '') : '';

                        out.write(\`| \${test.name} | \${testStatusIcon} \${testStatus} | \${(test.duration / 1000).toFixed(2)}秒 | \${errorMsg} |\\n\`);
                    });

                    out.write('\\n');
                });

                // 写入失败详情
                const failedTests = report.suites.flatMap(s => s.tests.filter(t => !t.passed));
                if (failedTests.length > 0) {
                    out.write('## 失败详情\\n\\n');

                    failedTests.forEach((test, index) => {
                        out.write(\`### \${index + 1}. \${test.name}\\n\\n\`);
                        out.write(\`**套件**: \${test.suiteName || '未知'}\\n\\n\`);
                        out.write(\`**错误**:\\n\\n\`);
                        out.write(\`\`\`\\n\${test.error || '无错误信息'}\\n\`\`\`\\n\\n\`);

                        if (test.screenshot) {
                            const screenshotPath = test.screenshot.replace(/^\.\//, '');
                            out.write(\`**截图**: ![](\${screenshotPath})\\n\\n\`);
                        }
                    });
                }

                out.end();
            } catch (e) {
                console.error('解析JSON报告失败:', e.message);
                process.exit(1);
            }
        "
    else
        log_error "JSON报告文件不存在: $input_file"
        return 1
    fi

    log_success "Markdown报告已生成: $output_file"
}

# 生成HTML报告（简单版本）
generate_html_report() {
    local input_file=$1
    local output_file=$2

    log "生成HTML报告: $output_file"

    cat > "$output_file" << EOF
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Todo应用测试报告</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }

        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }

        .header .subtitle {
            opacity: 0.9;
            font-size: 1.1rem;
        }

        .summary {
            padding: 30px;
            border-bottom: 1px solid #eee;
        }

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }

        .stat-card {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            transition: transform 0.3s;
        }

        .stat-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }

        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 5px;
        }

        .stat-label {
            font-size: 0.9rem;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .suites {
            padding: 30px;
        }

        .suite {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            border-left: 4px solid #667eea;
        }

        .suite.passed {
            border-left-color: #48bb78;
        }

        .suite.failed {
            border-left-color: #f56565;
        }

        .suite-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }

        .suite-title {
            font-size: 1.3rem;
            font-weight: bold;
            color: #333;
        }

        .suite-status {
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: bold;
        }

        .status-passed {
            background: #c6f6d5;
            color: #22543d;
        }

        .status-failed {
            background: #fed7d7;
            color: #742a2a;
        }

        .tests-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }

        .tests-table th {
            background: #e2e8f0;
            padding: 12px;
            text-align: left;
            font-weight: bold;
            color: #4a5568;
        }

        .tests-table td {
            padding: 12px;
            border-bottom: 1px solid #e2e8f0;
        }

        .test-passed {
            color: #48bb78;
        }

        .test-failed {
            color: #f56565;
        }

        .error-details {
            background: #fff5f5;
            border: 1px solid #fed7d7;
            border-radius: 4px;
            padding: 15px;
            margin-top: 10px;
            font-family: monospace;
            font-size: 0.9rem;
            white-space: pre-wrap;
            word-break: break-all;
        }

        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            border-top: 1px solid #eee;
            font-size: 0.9rem;
        }

        @media (max-width: 768px) {
            .summary-grid {
                grid-template-columns: 1fr;
            }

            .suite-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 10px;
            }

            .tests-table {
                display: block;
                overflow-x: auto;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Todo应用测试报告</h1>
            <div class="subtitle">
                生成时间: $(date) | 测试环境: $(uname -s) $(uname -r)
            </div>
        </div>

        <div class="summary">
            <h2>测试统计</h2>
            <div class="summary-grid" id="summary-grid">
                <!-- 统计信息将通过JavaScript动态生成 -->
            </div>
        </div>

        <div class="suites" id="suites-container">
            <!-- 测试套件信息将通过JavaScript动态生成 -->
        </div>

        <div class="footer">
            <p>© 2026 Agent-CLI测试示例项目 | 使用 agent-cli 生成</p>
        </div>
    </div>

    <script>
        // 从JSON文件加载报告数据
        fetch('test-report.json')
            .then(response => response.json())
            .then(report => {
                renderSummary(report.summary);
                renderSuites(report.suites);
            })
            .catch(error => {
                console.error('加载报告数据失败:', error);
                document.getElementById('summary-grid').innerHTML =
                    '<div class="error-details">加载报告数据失败: ' + error.message + '</div>';
            });

        function renderSummary(summary) {
            const grid = document.getElementById('summary-grid');

            const stats = [
                { label: '总测试套件', value: summary.totalSuites },
                { label: '总测试用例', value: summary.totalTests },
                { label: '通过', value: summary.passed, color: '#48bb78' },
                { label: '失败', value: summary.failed, color: '#f56565' },
                { label: '跳过', value: summary.skipped, color: '#ed8936' },
                {
                    label: '成功率',
                    value: ((summary.passed / summary.totalTests) * 100).toFixed(2) + '%',
                    color: '#667eea'
                },
                {
                    label: '总耗时',
                    value: (summary.duration / 1000).toFixed(2) + '秒',
                    color: '#9f7aea'
                }
            ];

            grid.innerHTML = stats.map(stat => \`
                <div class="stat-card">
                    <div class="stat-value" style="color: \${stat.color || '#667eea'}">\${stat.value}</div>
                    <div class="stat-label">\${stat.label}</div>
                </div>
            \`).join('');
        }

        function renderSuites(suites) {
            const container = document.getElementById('suites-container');

            container.innerHTML = suites.map((suite, index) => {
                const passedTests = suite.tests.filter(t => t.passed).length;
                const totalTests = suite.tests.length;
                const passRate = ((passedTests / totalTests) * 100).toFixed(2);
                const suiteClass = suite.passed ? 'passed' : 'failed';
                const statusText = suite.passed ? '通过' : '失败';
                const statusClass = suite.passed ? 'status-passed' : 'status-failed';

                return \`
                    <div class="suite \${suiteClass}">
                        <div class="suite-header">
                            <div class="suite-title">
                                \${index + 1}. \${suite.name}
                            </div>
                            <div class="suite-status \${statusClass}">
                                \${statusText} (\${passedTests}/\${totalTests}, \${passRate}%)
                            </div>
                        </div>

                        <p>\${suite.description || '无描述'}</p>
                        <p><strong>耗时:</strong> \${(suite.duration / 1000).toFixed(2)}秒</p>

                        <table class="tests-table">
                            <thead>
                                <tr>
                                    <th>测试用例</th>
                                    <th>状态</th>
                                    <th>耗时</th>
                                    <th>详情</th>
                                </tr>
                            </thead>
                            <tbody>
                                \${suite.tests.map(test => {
                                    const testClass = test.passed ? 'test-passed' : 'test-failed';
                                    const testStatus = test.passed ? '通过' : '失败';
                                    const errorHtml = test.error ? \`
                                        <div class="error-details">
                                            \${test.error}
                                            \${test.screenshot ? \`<br><br><strong>截图:</strong> <a href="\${test.screenshot}" target="_blank">查看</a>\` : ''}
                                        </div>
                                    \` : '';

                                    return \`
                                        <tr>
                                            <td>\${test.name}</td>
                                            <td class="\${testClass}">\${testStatus}</td>
                                            <td>\${(test.duration / 1000).toFixed(2)}秒</td>
                                            <td>\${errorHtml}</td>
                                        </tr>
                                    \`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                \`;
            }).join('');
        }
    </script>
</body>
</html>
EOF

    log_success "HTML报告已生成: $output_file"
}

# 主函数
main() {
    log "开始生成测试报告"

    # 检查输入文件
    local input_file="./reports/test-report.json"
    if ! check_file "$input_file"; then
        log_error "请先运行测试生成JSON报告"
        exit 1
    fi

    # 创建输出目录
    mkdir -p ./reports/generated

    # 生成各种格式的报告
    generate_text_report "$input_file" "./reports/generated/test-report.txt"
    generate_markdown_report "$input_file" "./reports/generated/test-report.md"
    generate_html_report "$input_file" "./reports/generated/test-report-custom.html"

    # 复制HTML报告到主目录（如果存在）
    if [ -f "./reports/test-report.html" ]; then
        cp "./reports/test-report.html" "./reports/generated/test-report-original.html"
        log_success "已复制原始HTML报告"
    fi

    # 显示生成的文件
    echo ""
    log "生成的报告文件:"
    ls -la ./reports/generated/ | grep -E "\.(txt|md|html)$" | awk '{print "  " $9 " (" $5 " bytes)"}'

    log_success "报告生成完成"
}

# 显示帮助信息
show_help() {
    echo "测试报告生成脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help         显示此帮助信息"
    echo "  -i, --input        指定输入JSON报告文件 (默认: ./reports/test-report.json)"
    echo "  -o, --output-dir   指定输出目录 (默认: ./reports/generated)"
    echo "  --format           指定输出格式 (txt, md, html, all) (默认: all)"
    echo ""
    echo "示例:"
    echo "  $0                    # 生成所有格式的报告"
    echo "  $0 --format md        # 只生成Markdown报告"
    echo "  $0 -i custom.json     # 使用自定义JSON报告文件"
}

# 解析命令行参数
INPUT_FILE="./reports/test-report.json"
OUTPUT_DIR="./reports/generated"
FORMAT="all"

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -i|--input)
            INPUT_FILE="$2"
            shift 2
            ;;
        -o|--output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --format)
            FORMAT="$2"
            shift 2
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