// ==UserScript==
// @name         焦作工贸 青果系统软件
// @namespace    http://tampermonkey.net/
// @version      3.4
// @description  由翟雨晨制作
// @author       You
// @match        https://jwxt.jzcit.edu.cn/*
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    const BUTTON_ID = 'oneClickExcellentBtn_Quick';
    let buttonAdded = false;
    let scanRequested = false;
    let scanTimeout = null;

    // 按钮样式
    GM_addStyle(`
        #${BUTTON_ID} {
            position: fixed !important;
            z-index: 2147483647 !important;
            padding: 10px 20px !important;
            font-size: 14px !important;
            font-weight: bold !important;
            color: white !important;
            background: #4CAF50 !important;
            border: 2px solid white !important;
            border-radius: 20px !important;
            cursor: pointer !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
            font-family: "Microsoft YaHei", sans-serif !important;
            user-select: none !important;
            right: 15px !important;
            bottom: 80px !important;
            transition: all 0.3s !important;
        }
        #${BUTTON_ID}:hover {
            background: #45a049 !important;
            transform: translateY(-2px) !important;
        }
    `);

    // ========== 性能优化版检测函数 ==========
    function quickCheckFourOptions() {
        if (buttonAdded) return false;

        const options = {
            '优': false,
            '良': false,
            '中': false,
            '差': false
        };

        // 方法1：只检查可见的文本节点（性能最好）
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // 只检查可见的文本节点
                    if (node.parentElement &&
                        node.parentElement.offsetParent !== null &&
                        node.textContent.trim().length <= 2) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                }
            }
        );

        let node;
        while ((node = walker.nextNode())) {
            const text = node.textContent.trim();
            if (text === '优') options['优'] = true;
            if (text === '良') options['良'] = true;
            if (text === '中') options['中'] = true;
            if (text === '差') options['差'] = true;

            // 如果四个都找到了，提前退出
            if (options['优'] && options['良'] && options['中'] && options['差']) {
                break;
            }
        }

        // 方法2：检查radio/checkbox的value和label（如果还没找全）
        if (!(options['优'] && options['良'] && options['中'] && options['差'])) {
            // 只查一次querySelectorAll，然后分析
            const possibleElements = document.querySelectorAll(
                'input[type="radio"], input[type="checkbox"], label, span, td, div'
            );

            // 限制检查数量，避免卡顿
            const maxChecks = Math.min(100, possibleElements.length);
            for (let i = 0; i < maxChecks; i++) {
                const el = possibleElements[i];
                const text = el.textContent || el.value || '';

                if (text.includes('优')) options['优'] = true;
                if (text.includes('良')) options['良'] = true;
                if (text.includes('中')) options['中'] = true;
                if (text.includes('差')) options['差'] = true;

                if (options['优'] && options['良'] && options['中'] && options['差']) {
                    break;
                }
            }
        }

        const allFound = options['优'] && options['良'] && options['中'] && options['差'];
        console.log('快速检测结果:', {
            found: Object.keys(options).filter(k => options[k]),
            allFound: allFound
        });

        return allFound;
    }

    // ========== 自动选择功能（关键修复） ==========
    function performAutoSelection() {
        let totalChecked = 0;

        function scanDocument(doc) {
            const allRadios = doc.querySelectorAll('input[type="radio"]:not(:disabled)');
            if (allRadios.length === 0) return 0;

            // 按name分组（同一问题的选项name相同）
            const groups = {};
            allRadios.forEach(radio => {
                if (radio.name) {
                    if (!groups[radio.name]) groups[radio.name] = [];
                    groups[radio.name].push(radio);
                }
            });

            // 🛠️ 修复核心：寻找并勾选每组的"优"选项
            let checked = 0;
            Object.values(groups).forEach(group => {
                if (group.length > 0) {
                    // 第一步：明确寻找"优"选项
                    let excellentOption = null;

                    // 查找value明确包含"优"的
                    excellentOption = group.find(radio =>
                        (radio.value || '').toString().includes('优')
                    );

                    // 第二步：查找value为高分值的（95、100等）
                    if (!excellentOption) {
                        excellentOption = group.find(radio => {
                            const val = (radio.value || '').toString();
                            return val === '95' || val === '100' || val === '5' ||
                                   val === '1' || val === 'A' || val === 'a';
                        });
                    }

                    // 第三步：通过关联文本查找
                    if (!excellentOption) {
                        excellentOption = group.find(radio => {
                            // 查找label
                            const labels = doc.querySelectorAll(`label[for="${radio.id}"]`);
                            for (let label of labels) {
                                if (label.textContent.includes('优')) return true;
                            }
                            // 查找父元素
                            if (radio.parentElement &&
                                radio.parentElement.textContent.includes('优')) {
                                return true;
                            }
                            return false;
                        });
                    }

                    // 第四步：如果上述都没找到，选择每组第一个
                    if (!excellentOption) {
                        excellentOption = group[0];
                    }

                    // 勾选找到的选项
                    if (!excellentOption.checked) {
                        excellentOption.click();
                        checked++;
                    }
                }
            });

            return checked;
        }

        // 扫描主文档
        totalChecked += scanDocument(document);

        // 扫描iframe
        document.querySelectorAll('iframe').forEach(frame => {
            try {
                const frameDoc = frame.contentDocument || frame.contentWindow.document;
                if (frameDoc) {
                    totalChecked += scanDocument(frameDoc);
                }
            } catch(e) {
                // 忽略跨域iframe
            }
        });

        return {
            success: totalChecked > 0,
            count: totalChecked
        };
    }

    // ========== 智能添加按钮 ==========
    function tryAddButton() {
        if (buttonAdded) return;

        scanRequested = false;

        if (quickCheckFourOptions()) {
            console.log('✅ 检测到四选项，添加按钮');
            addButton();
        } else {
            console.log('未找到四选项，继续监听');
        }
    }

    function addButton() {
        if (buttonAdded) return;

        // 移除旧按钮
        const oldBtn = document.getElementById(BUTTON_ID);
        if (oldBtn) oldBtn.remove();

        // 创建按钮
        const btn = document.createElement('button');
        btn.id = BUTTON_ID;
        btn.innerHTML = '一键评优';
        btn.title = '点击自动选择所有"优"';

        // 点击事件
        btn.addEventListener('click', function() {
            const result = performAutoSelection();

            // 简单反馈
            if (result.success) {
                btn.innerHTML = `已选${result.count}项`;
                setTimeout(() => btn.innerHTML = '一键评优', 2500);
            } else {
                btn.innerHTML = '未找到';
                setTimeout(() => btn.innerHTML = '一键评优', 1000);
            }
        });

        document.body.appendChild(btn);
        buttonAdded = true;
    }

    // ========== 性能优化版监听器 ==========
    function setupSmartObserver() {
        console.log('启动智能监听器');

        // 防抖函数：合并多次DOM变化
        function debouncedCheck() {
            if (scanRequested) return;
            scanRequested = true;

            if (scanTimeout) clearTimeout(scanTimeout);

            scanTimeout = setTimeout(() => {
                tryAddButton();
            }, 500);
        }

        // 监听主要DOM变化
        const observer = new MutationObserver((mutations) => {
            const hasRelevantChange = mutations.some(mutation => {
                return mutation.type === 'childList' &&
                       mutation.addedNodes.length > 0;
            });

            if (hasRelevantChange && !buttonAdded) {
                debouncedCheck();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: false,
            attributes: false,
            characterData: false
        });

        // 监听iframe加载
        document.querySelectorAll('iframe').forEach(frame => {
            frame.addEventListener('load', debouncedCheck);
        });

        // 初始检测
        setTimeout(debouncedCheck, 1000);

        // 每5秒再检测一次（备用）
        setInterval(() => {
            if (!buttonAdded) debouncedCheck();
        }, 5000);
    }

    // ========== 主启动逻辑 ==========
    function init() {
        console.log('青果评教脚本启动（修复版）');

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupSmartObserver);
        } else {
            setTimeout(setupSmartObserver, 800);
        }
    }

    // 启动
    init();

})();
