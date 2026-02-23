// Gemini Navigator Content Script
console.log('Gemini Navigator: Premium glassmorphism script loaded');

class GeminiNavigator {
    constructor() {
        this.wrapper = null;
        this.toggleBtn = null;
        this.isOpen = false;
        this.queries = []; // Array of object: { element: HTMLElement, text: string }
        this.queryObserver = null;

        // 初始化 UI
        this.initUI();

        // 监听 DOM 变化以收集新的提问
        this.observer = new MutationObserver(this.handleDOMMutations.bind(this));
        this.startObserving();

        // 初始扫描现有的提问
        this.scanForQueries();
    }

    initUI() {
        // 检查是否已存在
        if (document.getElementById('gemini-navigator-wrapper')) return;

        // 创建包裹容器 (右下方悬浮)
        this.wrapper = document.createElement('div');
        this.wrapper.id = 'gemini-navigator-wrapper';

        // 创建主弹出容器
        this.container = document.createElement('div');
        this.container.id = 'gemini-navigator-container';

        // 创建浮动切换按钮 (FAB)
        this.toggleBtn = document.createElement('div');
        this.toggleBtn.id = 'gn-toggle-btn';
        this.toggleBtn.innerHTML = `
      <svg viewBox="0 0 24 24" class="gn-icon-menu">
        <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
      </svg>
      <svg viewBox="0 0 24 24" class="gn-icon-close" style="display:none;">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    `;
        this.toggleBtn.title = "展开提问导航";
        this.toggleBtn.addEventListener('click', () => this.toggleSidebar());

        // 创建列表容器
        this.listContainer = document.createElement('ul');
        this.listContainer.className = 'gn-list';

        // 创建 Header 显示总数和进度
        this.header = document.createElement('div');
        this.header.className = 'gn-header';
        this.header.innerHTML = `
            <span>提问导航</span>
            <span class="gn-count"><span id="gn-current-index">-</span> / <span id="gn-total-count">0</span></span>
        `;

        // 组装 UI
        this.container.appendChild(this.header);
        this.container.appendChild(this.listContainer);

        this.wrapper.appendChild(this.container);
        this.wrapper.appendChild(this.toggleBtn);

        document.body.appendChild(this.wrapper);

        // 添加点击外部收起导航栏的功能
        document.addEventListener('click', (event) => {
            if (this.isOpen && !this.wrapper.contains(event.target)) {
                this.toggleSidebar();
            }
        });

        this.renderList();
        this.observeQueries();
    }

    // 动态调整主内容区域以留白
    updateMainContentMargin(isOpen) {
        // Gemini 的主要聊天区域容器之一，可能需要根据具体 DOM 调整选择器
        const chatContainer = document.querySelector('chat-window') ||
            document.querySelector('.chat-container') ||
            document.querySelector('main');
        if (chatContainer) {
            if (isOpen) {
                // 如果导航栏展开，则在右侧留出相应的安全距离 (比如 导航栏宽 240px + 间距 20px + 右边距 40px = 300px)
                chatContainer.style.transition = 'margin-right 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                chatContainer.style.marginRight = '300px';
            } else {
                // 如果导航收起，则清除我们添加的 margin，恢复原本的样式
                chatContainer.style.marginRight = '';
            }
        }
    }

    toggleSidebar() {
        this.isOpen = !this.isOpen;
        const menuIcon = this.toggleBtn.querySelector('.gn-icon-menu');
        const closeIcon = this.toggleBtn.querySelector('.gn-icon-close');

        if (this.isOpen) {
            this.container.classList.add('gn-open');
            this.wrapper.classList.add('gn-wrapper-open');
            menuIcon.style.display = 'none';
            closeIcon.style.display = 'block';
        } else {
            this.container.classList.remove('gn-open');
            this.wrapper.classList.remove('gn-wrapper-open');
            menuIcon.style.display = 'block';
            closeIcon.style.display = 'none';
        }

        // 调用更新预留空间的函数
        this.updateMainContentMargin(this.isOpen);
    }

    startObserving() {
        // 观察整个 body 的变化
        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    handleDOMMutations(mutations) {
        let shouldUpdate = false;
        for (const mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
                shouldUpdate = true;
            }
        }

        if (shouldUpdate) {
            // 节流重新扫描
            clearTimeout(this.scanTimeout);
            this.scanTimeout = setTimeout(() => {
                this.scanForQueries();
            }, 500);
        }
    }

    scanForQueries() {
        let queryElements = [];

        // 这里增加更多选择器覆盖可能的情况
        const possibleSelectors = [
            'user-query',
            '[data-message-author-role="user"]',
            '.user-message',
            'div[class*="user-query"]',
            'div[class*="query-content"]'
        ];

        for (const selector of possibleSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                queryElements = Array.from(elements);
                break;
            }
        }

        // Fallback 分析
        if (queryElements.length === 0) {
            const fallbackElements = document.querySelectorAll('message-content:not([class*="model"])');
            if (fallbackElements.length > 0) {
                queryElements = Array.from(fallbackElements);
            }
        }

        const newQueries = [];

        queryElements.forEach((el, index) => {
            let text = el.textContent || el.innerText || '';

            // 去除 Gemini 中可能包含的 "你说" 前缀
            text = text.replace(/^你说\s*/i, '').trim();

            if (text) {
                // 去除换行符，限制摘要长度，保持列表整洁
                text = text.replace(/\n+/g, ' ');
                const summary = text.length > 50 ? text.substring(0, 50) + '...' : text;

                newQueries.push({
                    id: 'query-' + index,
                    element: el,
                    text: summary,
                    fullText: text // 完整提问内容，用于 title 提示
                });
            }
        });

        if (this.queries.length !== newQueries.length ||
            JSON.stringify(this.queries.map(q => q.text)) !== JSON.stringify(newQueries.map(q => q.text))) {
            this.queries = newQueries;

            const totalCountEls = document.querySelectorAll('#gn-total-count');
            if (totalCountEls.length) totalCountEls.forEach(el => el.textContent = this.queries.length || '0');

            this.renderList();
            this.observeQueries();
        }
    }

    renderList() {
        this.listContainer.innerHTML = '';

        if (this.queries.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'gn-empty-state';
            emptyState.textContent = '暂未检测到提问...';
            this.listContainer.appendChild(emptyState);
            return;
        }

        this.queries.forEach((query, index) => {
            const li = document.createElement('li');
            li.className = 'gn-item';
            li.dataset.index = index;

            // 添加圆点标志和文本
            const dot = document.createElement('span');
            dot.className = 'gn-dot';

            const textSpan = document.createElement('span');
            textSpan.textContent = query.text;

            li.appendChild(dot);
            li.appendChild(textSpan);
            li.title = query.fullText;

            li.addEventListener('click', () => {
                query.element.scrollIntoView({ behavior: 'smooth', block: 'center' });

                const originalBg = query.element.style.backgroundColor;
                const originalTransition = query.element.style.transition;

                query.element.style.transition = 'background-color 0.5s';
                query.element.style.backgroundColor = 'rgba(138, 180, 248, 0.3)';

                setTimeout(() => {
                    query.element.style.backgroundColor = originalBg;
                    setTimeout(() => {
                        query.element.style.transition = originalTransition;
                    }, 500);
                }, 1500);
            });

            this.listContainer.appendChild(li);
        });
    }

    observeQueries() {
        if (this.queryObserver) {
            this.queryObserver.disconnect();
        }

        this.queryObserver = new IntersectionObserver((entries) => {
            let intersectingIndex = -1;
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const index = this.queries.findIndex(q => q.element === entry.target);
                    if (index > intersectingIndex) {
                        intersectingIndex = index;
                    }
                }
            });

            if (intersectingIndex !== -1) {
                this.updateCurrentPosition(intersectingIndex + 1);
            }
        }, {
            // 当内容到达视口中间区域附近时触发高亮
            rootMargin: "-20% 0px -40% 0px",
            threshold: 0
        });

        this.queries.forEach(q => {
            this.queryObserver.observe(q.element);
        });
    }

    updateCurrentPosition(index) {
        const currentEl = document.getElementById('gn-current-index');
        if (currentEl) currentEl.textContent = index;

        const items = this.listContainer.querySelectorAll('.gn-item');
        items.forEach((item, i) => {
            if (i === index - 1) {
                item.classList.add('gn-active');
            } else {
                item.classList.remove('gn-active');
            }
        });
    }
}

// 延迟初始化
setTimeout(() => {
    new GeminiNavigator();
}, 2000);
