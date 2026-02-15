#!/usr/bin/env node

/**
 * 配置验证脚本
 * 设计思路：验证测试配置文件和测试套件的语法和结构
 */

const fs = require('fs');
const path = require('path');

// 颜色定义
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// 日志函数
function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log('green', `[SUCCESS] ${message}`);
}

function logError(message) {
  log('red', `[ERROR] ${message}`);
}

function logWarning(message) {
  log('yellow', `[WARNING] ${message}`);
}

function logInfo(message) {
  log('blue', `[INFO] ${message}`);
}

// 验证JSON文件
function validateJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    // 基本验证
    if (!data.name) {
      logWarning(`${filePath}: 缺少name字段`);
    }

    if (!data.description) {
      logWarning(`${filePath}: 缺少description字段`);
    }

    return { valid: true, data };
  } catch (error) {
    logError(`${filePath}: JSON解析错误 - ${error.message}`);
    return { valid: false, error };
  }
}

// 验证测试配置
function validateTestConfig(configPath) {
  logInfo(`验证测试配置文件: ${configPath}`);

  const result = validateJsonFile(configPath);
  if (!result.valid) {
    return false;
  }

  const config = result.data;
  let isValid = true;

  // 必需字段检查
  const requiredFields = ['name', 'description', 'baseUrl', 'timeout'];
  for (const field of requiredFields) {
    if (!config[field]) {
      logError(`缺少必需字段: ${field}`);
      isValid = false;
    }
  }

  // 测试套件文件检查
  if (config.suites && Array.isArray(config.suites)) {
    logInfo(`检查测试套件文件 (${config.suites.length}个)`);

    for (const suitePath of config.suites) {
      const fullPath = path.join(path.dirname(configPath), suitePath);

      if (!fs.existsSync(fullPath)) {
        logError(`测试套件文件不存在: ${fullPath}`);
        isValid = false;
      } else {
        const suiteResult = validateJsonFile(fullPath);
        if (!suiteResult.valid) {
          isValid = false;
        } else {
          // 验证测试套件结构
          const suite = suiteResult.data;
          if (!suite.tests || !Array.isArray(suite.tests)) {
            logError(`${fullPath}: 缺少tests数组`);
            isValid = false;
          } else {
            logInfo(`  ${suite.name}: ${suite.tests.length}个测试用例`);
          }
        }
      }
    }
  } else {
    logError('缺少suites数组或格式不正确');
    isValid = false;
  }

  return isValid;
}

// 验证应用文件
function validateAppFiles() {
  logInfo('验证应用文件');

  const appFiles = [
    'index.html',
    'app.js',
    'style.css',
    'package.json'
  ];

  let allValid = true;

  for (const file of appFiles) {
    const filePath = path.join(__dirname, '..', file);

    if (!fs.existsSync(filePath)) {
      logError(`应用文件不存在: ${filePath}`);
      allValid = false;
    } else {
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        logError(`应用文件为空: ${filePath}`);
        allValid = false;
      } else {
        logSuccess(`  ${file}: ${stats.size} bytes`);
      }
    }
  }

  return allValid;
}

// 验证目录结构
function validateDirectoryStructure() {
  logInfo('验证目录结构');

  const requiredDirs = [
    'tests',
    'scripts',
    'docs'
  ];

  let allValid = true;

  for (const dir of requiredDirs) {
    const dirPath = path.join(__dirname, '..', dir);

    if (!fs.existsSync(dirPath)) {
      logError(`目录不存在: ${dirPath}`);
      allValid = false;
    } else if (!fs.statSync(dirPath).isDirectory()) {
      logError(`不是目录: ${dirPath}`);
      allValid = false;
    } else {
      const files = fs.readdirSync(dirPath);
      logSuccess(`  ${dir}/: ${files.length}个文件`);
    }
  }

  return allValid;
}

// 验证脚本文件
function validateScriptFiles() {
  logInfo('验证脚本文件');

  const scriptFiles = [
    'start-server.js',
    'run-tests.sh',
    'generate-report.sh'
  ];

  let allValid = true;

  for (const file of scriptFiles) {
    const filePath = path.join(__dirname, '..', 'scripts', file);

    if (!fs.existsSync(filePath)) {
      logError(`脚本文件不存在: ${filePath}`);
      allValid = false;
    } else {
      // 检查文件是否可执行（对于.sh文件）
      if (file.endsWith('.sh')) {
        try {
          fs.accessSync(filePath, fs.constants.X_OK);
          logSuccess(`  ${file}: 可执行`);
        } catch {
          logWarning(`  ${file}: 不可执行，请运行: chmod +x ${filePath}`);
        }
      }

      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        logError(`脚本文件为空: ${filePath}`);
        allValid = false;
      } else {
        logSuccess(`  ${file}: ${stats.size} bytes`);
      }
    }
  }

  return allValid;
}

// 主函数
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('Todo应用配置验证');
  console.log('='.repeat(60) + '\n');

  const configPath = path.join(__dirname, '..', 'test-config.json');

  // 执行各项验证
  const validations = [
    { name: '目录结构', func: validateDirectoryStructure },
    { name: '应用文件', func: validateAppFiles },
    { name: '脚本文件', func: validateScriptFiles },
    { name: '测试配置', func: () => validateTestConfig(configPath) }
  ];

  let allPassed = true;
  const results = [];

  for (const validation of validations) {
    logInfo(`\n执行验证: ${validation.name}`);

    try {
      const passed = validation.func();
      results.push({ name: validation.name, passed });

      if (passed) {
        logSuccess(`${validation.name}验证通过`);
      } else {
        logError(`${validation.name}验证失败`);
        allPassed = false;
      }
    } catch (error) {
      logError(`${validation.name}验证出错: ${error.message}`);
      results.push({ name: validation.name, passed: false, error });
      allPassed = false;
    }
  }

  // 显示总结
  console.log('\n' + '='.repeat(60));
  console.log('验证总结');
  console.log('='.repeat(60));

  for (const result of results) {
    const status = result.passed ? '✅ 通过' : '❌ 失败';
    console.log(`${status} ${result.name}`);

    if (result.error) {
      console.log(`   错误: ${result.error.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));

  if (allPassed) {
    logSuccess('所有验证通过！应用已准备好运行测试。');
    console.log('\n运行测试:');
    console.log('  npm test');
    console.log('  ./scripts/run-tests.sh');
    console.log('\n启动应用:');
    console.log('  npm start');
    console.log('  node scripts/start-server.js');
  } else {
    logError('验证失败，请修复上述问题后再运行测试。');
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    logError(`验证过程出错: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = {
  validateJsonFile,
  validateTestConfig,
  validateAppFiles,
  validateDirectoryStructure,
  validateScriptFiles
};