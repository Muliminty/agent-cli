// Todo应用 - Agent-CLI测试示例
// 设计思路：模块化设计，支持本地存储持久化，提供完整的CRUD操作

class TodoApp {
    constructor() {
        this.todos = [];
        this.currentFilter = 'all';
        this.init();
    }

    // 初始化应用
    init() {
        this.loadFromStorage();
        this.bindEvents();
        this.render();
        this.showNotification('Todo应用已加载！', 'info');
    }

    // 绑定事件监听器
    bindEvents() {
        // 添加待办事项
        document.getElementById('add-btn').addEventListener('click', () => this.addTodo());
        document.getElementById('todo-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addTodo();
        });

        // 过滤按钮
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                this.setFilter(filter);
            });
        });

        // 清除按钮
        document.getElementById('clear-completed').addEventListener('click', () => {
            this.showConfirm('清除已完成', '确定要清除所有已完成的待办事项吗？', () => {
                this.clearCompleted();
            });
        });

        document.getElementById('clear-all').addEventListener('click', () => {
            this.showConfirm('清除全部', '确定要清除所有待办事项吗？此操作不可撤销！', () => {
                this.clearAll();
            });
        });

        // 主题切换
        document.getElementById('toggle-theme').addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleTheme();
        });

        // 数据导入导出
        document.getElementById('export-data').addEventListener('click', (e) => {
            e.preventDefault();
            this.exportData();
        });

        document.getElementById('import-data').addEventListener('click', (e) => {
            e.preventDefault();
            this.showImportDialog();
        });

        // 模态框事件
        document.getElementById('confirm-cancel').addEventListener('click', () => this.hideConfirm());
        document.getElementById('confirm-ok').addEventListener('click', () => this.confirmAction());
        document.getElementById('import-cancel').addEventListener('click', () => this.hideImportDialog());
        document.getElementById('import-ok').addEventListener('click', () => this.importData());
        document.getElementById('notification-close').addEventListener('click', () => this.hideNotification());
    }

    // 添加待办事项
    addTodo() {
        const input = document.getElementById('todo-input');
        const text = input.value.trim();

        if (!text) {
            this.showNotification('请输入待办事项内容！', 'warning');
            input.focus();
            return;
        }

        if (text.length > 100) {
            this.showNotification('待办事项内容不能超过100个字符！', 'warning');
            return;
        }

        const todo = {
            id: Date.now(),
            text: text,
            completed: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.todos.unshift(todo); // 添加到开头
        input.value = '';
        this.saveToStorage();
        this.render();
        this.showNotification('待办事项已添加！', 'success');
    }

    // 切换待办事项完成状态
    toggleTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (todo) {
            todo.completed = !todo.completed;
            todo.updatedAt = new Date().toISOString();
            this.saveToStorage();
            this.render();
            this.showNotification(`待办事项已标记为${todo.completed ? '已完成' : '进行中'}！`, 'info');
        }
    }

    // 编辑待办事项
    editTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (!todo) return;

        const newText = prompt('编辑待办事项：', todo.text);
        if (newText !== null && newText.trim() !== '' && newText !== todo.text) {
            if (newText.length > 100) {
                this.showNotification('待办事项内容不能超过100个字符！', 'warning');
                return;
            }
            todo.text = newText.trim();
            todo.updatedAt = new Date().toISOString();
            this.saveToStorage();
            this.render();
            this.showNotification('待办事项已更新！', 'success');
        }
    }

    // 删除待办事项
    deleteTodo(id) {
        const todo = this.todos.find(t => t.id === id);
        if (!todo) return;

        this.showConfirm('删除待办事项', `确定要删除"${todo.text}"吗？`, () => {
            this.todos = this.todos.filter(t => t.id !== id);
            this.saveToStorage();
            this.render();
            this.showNotification('待办事项已删除！', 'success');
        });
    }

    // 设置过滤条件
    setFilter(filter) {
        this.currentFilter = filter;

        // 更新按钮状态
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        this.render();
    }

    // 清除已完成
    clearCompleted() {
        const completedCount = this.todos.filter(t => t.completed).length;
        if (completedCount === 0) {
            this.showNotification('没有已完成的待办事项！', 'info');
            return;
        }

        this.todos = this.todos.filter(t => !t.completed);
        this.saveToStorage();
        this.render();
        this.showNotification(`已清除${completedCount}个已完成的待办事项！`, 'success');
    }

    // 清除全部
    clearAll() {
        if (this.todos.length === 0) {
            this.showNotification('没有待办事项可清除！', 'info');
            return;
        }

        this.todos = [];
        this.saveToStorage();
        this.render();
        this.showNotification('所有待办事项已清除！', 'success');
    }

    // 切换主题
    toggleTheme() {
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        localStorage.setItem('todo-theme', isDarkMode ? 'dark' : 'light');
        this.showNotification(`已切换到${isDarkMode ? '深色' : '浅色'}主题！`, 'info');
    }

    // 导出数据
    exportData() {
        const data = {
            todos: this.todos,
            exportDate: new Date().toISOString(),
            version: '1.0.0'
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `todo-data-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showNotification('数据已导出！', 'success');
    }

    // 显示导入对话框
    showImportDialog() {
        document.getElementById('import-dialog').style.display = 'flex';
        document.getElementById('import-textarea').value = '';
    }

    // 隐藏导入对话框
    hideImportDialog() {
        document.getElementById('import-dialog').style.display = 'none';
    }

    // 导入数据
    importData() {
        const textarea = document.getElementById('import-textarea');
        const data = textarea.value.trim();

        if (!data) {
            this.showNotification('请输入要导入的数据！', 'warning');
            return;
        }

        try {
            const parsed = JSON.parse(data);

            // 验证数据格式
            if (!parsed.todos || !Array.isArray(parsed.todos)) {
                throw new Error('数据格式不正确：缺少todos数组');
            }

            // 验证每个待办事项
            const validTodos = parsed.todos.filter(todo => {
                return todo &&
                       typeof todo.id === 'number' &&
                       typeof todo.text === 'string' &&
                       typeof todo.completed === 'boolean';
            });

            if (validTodos.length === 0) {
                throw new Error('没有有效的待办事项数据');
            }

            this.todos = validTodos;
            this.saveToStorage();
            this.render();
            this.hideImportDialog();
            this.showNotification(`成功导入${validTodos.length}个待办事项！`, 'success');
        } catch (error) {
            this.showNotification(`导入失败：${error.message}`, 'error');
        }
    }

    // 显示确认对话框
    showConfirm(title, message, callback) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        document.getElementById('confirm-dialog').style.display = 'flex';
        this.confirmCallback = callback;
    }

    // 隐藏确认对话框
    hideConfirm() {
        document.getElementById('confirm-dialog').style.display = 'none';
        this.confirmCallback = null;
    }

    // 确认操作
    confirmAction() {
        if (this.confirmCallback) {
            this.confirmCallback();
        }
        this.hideConfirm();
    }

    // 显示通知
    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        const messageEl = document.getElementById('notification-message');

        messageEl.textContent = message;
        notification.className = `notification ${type} show`;

        // 自动隐藏
        setTimeout(() => {
            this.hideNotification();
        }, 3000);
    }

    // 隐藏通知
    hideNotification() {
        const notification = document.getElementById('notification');
        notification.classList.remove('show');
    }

    // 保存到本地存储
    saveToStorage() {
        try {
            localStorage.setItem('todo-app-data', JSON.stringify(this.todos));
        } catch (error) {
            console.error('保存数据失败：', error);
            this.showNotification('保存数据失败！', 'error');
        }
    }

    // 从本地存储加载
    loadFromStorage() {
        try {
            const data = localStorage.getItem('todo-app-data');
            if (data) {
                this.todos = JSON.parse(data);
            }
        } catch (error) {
            console.error('加载数据失败：', error);
            this.todos = [];
        }

        // 加载主题设置
        const theme = localStorage.getItem('todo-theme');
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
        }
    }

    // 获取过滤后的待办事项
    getFilteredTodos() {
        switch (this.currentFilter) {
            case 'active':
                return this.todos.filter(t => !t.completed);
            case 'completed':
                return this.todos.filter(t => t.completed);
            default:
                return this.todos;
        }
    }

    // 计算统计信息
    calculateStats() {
        const total = this.todos.length;
        const completed = this.todos.filter(t => t.completed).length;
        const active = total - completed;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

        return { total, active, completed, completionRate };
    }

    // 渲染应用
    render() {
        const filteredTodos = this.getFilteredTodos();
        const stats = this.calculateStats();

        // 更新统计信息
        document.getElementById('total-count').textContent = stats.total;
        document.getElementById('active-count').textContent = stats.active;
        document.getElementById('completed-count').textContent = stats.completed;
        document.getElementById('completion-rate').textContent = `${stats.completionRate}%`;

        // 渲染待办事项列表
        const todoList = document.getElementById('todo-list');

        if (filteredTodos.length === 0) {
            todoList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-clipboard"></i>
                    <p>${this.currentFilter === 'all' ? '暂无待办事项' :
                         this.currentFilter === 'active' ? '没有进行中的待办事项' :
                         '没有已完成的待办事项'}</p>
                    <p class="empty-hint">${this.currentFilter === 'all' ? '添加你的第一个待办事项开始吧！' :
                                           this.currentFilter === 'active' ? '所有待办事项都已完成！' :
                                           '还没有完成任何待办事项'}</p>
                </div>
            `;
            return;
        }

        todoList.innerHTML = filteredTodos.map(todo => `
            <div class="todo-item ${todo.completed ? 'completed' : ''}" data-id="${todo.id}">
                <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''}>
                <span class="todo-text">${this.escapeHtml(todo.text)}</span>
                <div class="todo-actions">
                    <button class="todo-action-btn edit" title="编辑">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="todo-action-btn delete" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        // 重新绑定事件
        this.bindTodoEvents();
    }

    // 绑定待办事项事件
    bindTodoEvents() {
        document.querySelectorAll('.todo-item').forEach(item => {
            const id = parseInt(item.dataset.id);

            // 复选框点击
            const checkbox = item.querySelector('.todo-checkbox');
            checkbox.addEventListener('change', () => this.toggleTodo(id));

            // 编辑按钮
            const editBtn = item.querySelector('.edit');
            editBtn.addEventListener('click', () => this.editTodo(id));

            // 删除按钮
            const deleteBtn = item.querySelector('.delete');
            deleteBtn.addEventListener('click', () => this.deleteTodo(id));
        });
    }

    // HTML转义
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.todoApp = new TodoApp();
});