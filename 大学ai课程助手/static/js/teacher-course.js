// 通用工具函数
const Utils = {
    showAlert(message, type = 'info') {
        alert(`${type === 'error' ? '错误：' : ''}${message}`);
    },
    getElement(selector, errorMessage = '元素未找到') {
        const element = document.querySelector(selector);
        if (!element) {
            console.error(errorMessage);
            throw new Error(errorMessage);
        }
        return element;
    },
    getElementAll(selector, errorMessage = '多个元素未找到') {
        const elements = document.querySelectorAll(selector);
        if (!elements.length) {
            console.error(errorMessage);
            throw new Error(errorMessage);
        }
        return elements;
    },
    getQueryParam(param) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(param);
    }
};

// 检查认证状态
async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/'; // 未登录跳转到登录页
        throw new Error('未登录');
    }

    try {
        const response = await fetch('/api/check-auth', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();

        if (!response.ok) {
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('role');
            window.location.href = '/';
            throw new Error(data.error || '认证失败');
        }
    } catch (error) {
        throw error;
    }
}

// 标签切换函数
function switchTab(tabName) {
    try {
        const tabs = Utils.getElementAll('.tab');
        const contents = Utils.getElementAll('.tab-content');
        tabs.forEach(tab => tab.classList.remove('active'));
        contents.forEach(content => content.classList.remove('active'));
        const activeTab = Utils.getElement(`.tab[onclick="switchTab('${tabName}')"]`);
        const activeContent = Utils.getElement(`.tab-content.${tabName}`);
        activeTab.classList.add('active');
        activeContent.classList.add('active');
    } catch (error) {
        console.error('标签切换错误：', error);
        Utils.showAlert(`标签切换失败：${error.message}`, 'error');
    }
}

// 动态加载课程详情
async function loadCourseDetails() {
    try {
        const courseId = Utils.getQueryParam('courseId');
        if (!courseId) {
            Utils.showAlert('未提供课程 ID', 'error');
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
            Utils.showAlert('未登录，请重新登录', 'error');
            window.location.href = '/';
            return;
        }

        const response = await fetch(`/api/teacher/courses/${courseId}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const contentType = response.headers.get('Content-Type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('非 JSON 响应:', text);
            throw new Error('服务器返回了意外内容');
        }

        const data = await response.json();

        if (response.ok && data.course) {
            const course = data.course;
            Utils.getElement('#course-title').textContent = course.name || '未命名';
            Utils.getElement('#banner-title').textContent = course.name || '未命名';
            Utils.getElement('#banner-details').textContent = course.details || '暂无详情';
            Utils.getElement('#banner-enrollment').textContent = `报名助课号: ${course.course_id}，已有${course.enrollment || 0}人加入`;
            Utils.getElement('#courseName').value = course.name || '';
            Utils.getElement('#courseDetails').value = course.details || '';
            Utils.getElement('#courseId').value = course.course_id || '';
            renderTabContent('resources', course.resources || [], '#resources-content');
        } else if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('role');
            window.location.href = '/';
        } else {
            Utils.showAlert(data.error || '加载课程详情失败', 'error');
        }
    } catch (error) {
        console.error('加载课程详情错误:', error);
        Utils.showAlert(`加载课程详情失败：${error.message}`, 'error');
    }
}

function renderTabContent(tab, items, containerId) {
    const container = Utils.getElement(containerId);
    container.innerHTML = '';
    if (!items || items.length === 0) {
        container.innerHTML = '<p>暂无内容</p>';
        return;
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'content-item';
        div.dataset.id = item.id;
        div.innerHTML = `
            <span>${item.text || item.file_path || '未命名'}</span>
            <button class="delete-btn">删除</button>
        `;
        div.querySelector('.delete-btn').addEventListener('click', () => deleteItem(tab, item.id));
        container.appendChild(div);
    });
}

// 加载课程分节
async function loadCourseSessions() {
    try {
        const courseId = Utils.getQueryParam('courseId');
        const sessionsContent = Utils.getElement('#sessions-content');
        sessionsContent.innerHTML = '加载中...';

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/teacher/courses/${courseId}/sessions`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();

        if (response.ok && data.sessions) {
            sessionsContent.innerHTML = '';
            if (data.sessions.length === 0) {
                sessionsContent.innerHTML = '<p>暂无分节</p>';
                return;
            }
            data.sessions.forEach(session => {
                const sessionItem = document.createElement('div');
                sessionItem.className = 'content-item';
                sessionItem.dataset.id = session.id;
                sessionItem.innerHTML = `
                    <p>第${session.session_number}节 - ${session.title}</p>
                    <p><strong>重点:</strong> ${session.key_points || '暂无'}</p>
                    <p><strong>难点:</strong> ${session.difficulties || '暂无'}</p>
                    <p><strong>关键词:</strong> ${session.keywords || '暂无'}</p>
                    <div class="item-actions">
                        <button class="edit-btn" onclick="showEditSessionModal(${session.id})">编辑</button>
                        <button class="delete-btn" onclick="deleteSession(${session.id})">删除</button>
                    </div>
                `;
                sessionsContent.appendChild(sessionItem);
            });
        } else if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('role');
            window.location.href = '/';
        } else {
            sessionsContent.innerHTML = `<p>加载分节失败: ${data.error || '未知错误'}</p>`;
        }
    } catch (error) {
        console.error('加载课程分节错误:', error);
        Utils.showAlert(`加载课程分节失败：${error.message}`, 'error');
    }
}

// 渲染标签内容
function renderTabContent(tab, items, containerId) {
    const container = Utils.getElement(containerId);
    container.innerHTML = '';
    if (!items || (Array.isArray(items) && items.length === 0)) {
        container.innerHTML = '<p>暂无内容</p>';
        return;
    }
    if (tab === 'resources' && items) {
        const resources = Array.isArray(items) ? items : [items];
        resources.forEach((item, index) => {
            const id = item.id || Date.now() + index;
            const resourceItem = document.createElement('div');
            resourceItem.className = 'content-item';
            resourceItem.dataset.id = id;
            resourceItem.innerHTML = `
                <p>${item.description || '未命名资源'}</p>
                <div class="item-actions">
                    <button class="edit-btn" onclick="showEditItemModal('${tab}', ${id})">编辑</button>
                    <button class="delete-btn" onclick="deleteItem('${tab}', ${id})">删除</button>
                </div>
            `;
            container.appendChild(resourceItem);
        });
    } else {
        const contentItems = typeof items === 'string' ? [{ text: items, id: Date.now() }] : items;
        contentItems.forEach((item, index) => {
            const id = item.id || Date.now() + index;
            const contentItem = document.createElement('div');
            contentItem.className = 'content-item';
            contentItem.dataset.id = id;
            contentItem.innerHTML = `
                <p>${item.text || item.description || '暂无内容'}</p>
                <div class="item-actions">
                    <button class="edit-btn" onclick="showEditItemModal('${tab}', ${id})">编辑</button>
                    <button class="delete-btn" onclick="deleteItem('${tab}', ${id})">删除</button>
                </div>
            `;
            container.appendChild(contentItem);
        });
    }
}

// 删除项
async function deleteItem(tab, id) {
    try {
        const item = Utils.getElement(`.content-item[data-id="${id}"]`);
        if (confirm(`确定要删除此${tab === 'overview' ? '内容' : tab === 'resources' ? '资源' : '任务'}吗？`)) {
            const token = localStorage.getItem('token');
            const courseId = Utils.getQueryParam('courseId');

            if (!token) {
                Utils.showAlert('未登录，请重新登录', 'error');
                window.location.href = '/';
                return;
            }

            console.log(`Deleting item: tab=${tab}, courseId=${courseId}, id=${id}`);

            const deleteButton = item.querySelector('.delete-btn');
            if (deleteButton) {
                deleteButton.disabled = true;
                deleteButton.textContent = '删除中...';
            }

            const response = await fetch(`/api/content/${tab}/${courseId}/${id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            const contentType = response.headers.get('Content-Type');
            let result;

            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('非 JSON 响应:', text);
                throw new Error('服务器返回了意外内容');
            }

            result = await response.json();

            if (response.ok) {
                item.remove();
                Utils.showAlert(result.message || '删除成功');
                loadCourseDetails(); // 刷新资源列表
            } else if (response.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('userId');
                localStorage.removeItem('role');
                window.location.href = '/';
            } else if (response.status === 404) {
                Utils.showAlert('资源不存在，可能已被删除或ID错误', 'error');
                item.remove(); // 如果资源不存在，前端也移除该项
                loadCourseDetails(); // 刷新列表
            } else if (response.status === 403) {
                Utils.showAlert('无权限删除此资源', 'error');
            } else {
                Utils.showAlert(result.error || `删除失败 (状态码: ${response.status})`, 'error');
            }
        }
    } catch (error) {
        console.error('删除项错误：', error);
        Utils.showAlert(`删除失败：${error.message}`, 'error');
    } finally {
        const deleteButton = document.querySelector(`.content-item[data-id="${id}"] .delete-btn`);
        if (deleteButton) {
            deleteButton.disabled = false;
            deleteButton.textContent = '删除';
        }
    }
}

// 显示添加内容模态框
function showAddItemModal(tab) {
    try {
        const modal = Utils.getElement('#contentModal');
        const modalTitle = Utils.getElement('#modalTitle');
        const contentForm = Utils.getElement('#contentForm');
        modalTitle.textContent = `添加${tab === 'overview' ? '内容' : tab === 'resources' ? '资源' : '任务'}`;
        contentForm.dataset.tab = tab;
        delete contentForm.dataset.id;
        Utils.getElement('#contentText').value = '';
        modal.style.display = 'block';
    } catch (error) {
        console.error('显示添加内容模态框错误：', error);
        Utils.showAlert(`显示模态框失败：${error.message}`, 'error');
    }
}

// 显示编辑内容模态框
function showEditItemModal(tab, id) {
    try {
        const modal = Utils.getElement('#contentModal');
        const modalTitle = Utils.getElement('#modalTitle');
        const contentForm = Utils.getElement('#contentForm');
        const contentText = Utils.getElement('#contentText');
        const item = Utils.getElement(`.content-item[data-id="${id}"] p`);
        modalTitle.textContent = `编辑${tab === 'overview' ? '内容' : tab === 'resources' ? '资源' : '任务'}`;
        contentText.value = item.textContent;
        contentForm.dataset.tab = tab;
        contentForm.dataset.id = id;
        modal.style.display = 'block';
    } catch (error) {
        console.error('显示编辑内容模态框错误：', error);
        Utils.showAlert(`显示编辑模态框失败：${error.message}`, 'error');
    }
}

// 显示添加分节模态框
function showAddSessionModal() {
    try {
        const modal = Utils.getElement('#sessionModal');
        const modalTitle = Utils.getElement('#sessionModalTitle');
        const sessionForm = Utils.getElement('#sessionForm');
        modalTitle.textContent = '添加课程分节';
        sessionForm.dataset.id = '';
        Utils.getElement('#sessionNumber').value = '';
        Utils.getElement('#sessionTitle').value = '';
        Utils.getElement('#keyPoints').value = '';
        Utils.getElement('#difficulties').value = '';
        Utils.getElement('#keywords').value = '';
        modal.style.display = 'block';
    } catch (error) {
        console.error('显示添加分节模态框错误：', error);
        Utils.showAlert(`显示模态框失败：${error.message}`, 'error');
    }
}

// 显示编辑分节模态框
async function showEditSessionModal(id) {
    try {
        const modal = Utils.getElement('#sessionModal');
        const modalTitle = Utils.getElement('#sessionModalTitle');
        const sessionForm = Utils.getElement('#sessionForm');
        const courseId = Utils.getQueryParam('courseId');

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/teacher/courses/${courseId}/sessions/${id}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();

        if (response.ok && data.session) {
            modalTitle.textContent = '编辑课程分节';
            sessionForm.dataset.id = id;
            Utils.getElement('#sessionNumber').value = data.session.session_number;
            Utils.getElement('#sessionTitle').value = data.session.title;
            Utils.getElement('#keyPoints').value = data.session.key_points || '';
            Utils.getElement('#difficulties').value = data.session.difficulties || '';
            Utils.getElement('#keywords').value = data.session.keywords || '';
            modal.style.display = 'block';
        } else if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('role');
            window.location.href = '/';
        } else {
            Utils.showAlert(data.error || '加载分节详情失败', 'error');
        }
    } catch (error) {
        console.error('显示编辑分节模态框错误：', error);
        Utils.showAlert(`显示模态框失败：${error.message}`, 'error');
    }
}

// 关闭模态框
function closeModal() {
    try {
        Utils.getElement('#contentModal').style.display = 'none';
        Utils.getElement('#bannerModal').style.display = 'none';
        Utils.getElement('#sessionModal').style.display = 'none';
    } catch (error) {
        console.error('关闭模态框错误：', error);
        Utils.showAlert(`关闭模态框失败：${error.message}`, 'error');
    }
}

// 保存内容
async function handleContentFormSubmit(event) {
    event.preventDefault();
    try {
        const contentForm = Utils.getElement('#contentForm');
        const tab = contentForm.dataset.tab;
        const id = contentForm.dataset.id;
        const contentText = Utils.getElement('#contentText').value;
        const courseId = Utils.getQueryParam('courseId');

        const token = localStorage.getItem('token');
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/content/${tab}/${courseId}/${id}` : `/api/content/${tab}/${courseId}`;
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ contentText })
        });
        const result = await response.json();

        if (response.ok) {
            loadCourseDetails();
            closeModal();
            Utils.showAlert('内容已保存');
        } else if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('role');
            window.location.href = '/';
        } else {
            Utils.showAlert(result.error || '保存内容失败', 'error');
        }
    } catch (error) {
        console.error('保存内容错误：', error);
        Utils.showAlert(`保存内容失败：${error.message}`, 'error');
    }
}

// 保存分节
async function handleSessionFormSubmit(event) {
    event.preventDefault();
    try {
        const sessionForm = Utils.getElement('#sessionForm');
        const id = sessionForm.dataset.id;
        const courseId = Utils.getQueryParam('courseId');
        const sessionNumber = Utils.getElement('#sessionNumber').value;
        const sessionTitle = Utils.getElement('#sessionTitle').value;
        const keyPoints = Utils.getElement('#keyPoints').value;
        const difficulties = Utils.getElement('#difficulties').value;
        const keywords = Utils.getElement('#keywords').value;

        const token = localStorage.getItem('token');
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/teacher/courses/${courseId}/sessions/${id}` : `/api/teacher/courses/${courseId}/sessions`;
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ sessionNumber, sessionTitle, keyPoints, difficulties, keywords })
        });

        const result = await response.json();

        if (response.ok) {
            loadCourseSessions();
            closeModal();
            Utils.showAlert('分节已保存');
        } else if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('role');
            window.location.href = '/';
        } else {
            Utils.showAlert(result.error || '保存分节失败', 'error');
        }
    } catch (error) {
        console.error('保存分节错误：', error);
        Utils.showAlert(`保存分节失败：${error.message}`, 'error');
    }
}

// 删除分节
async function deleteSession(id) {
    try {
        if (confirm('确定要删除此分节吗？')) {
            const courseId = Utils.getQueryParam('courseId');
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/teacher/courses/${courseId}/sessions/${id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            const contentType = response.headers.get('Content-Type');
            let result;
            if (contentType && contentType.includes('application/json')) {
                result = await response.json();
            } else {
                throw new Error('服务器返回了非 JSON 格式的响应');
            }

            if (response.ok) {
                loadCourseSessions();
                Utils.showAlert('分节已删除');
            } else if (response.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('userId');
                localStorage.removeItem('role');
                window.location.href = '/';
            } else {
                Utils.showAlert(result.error || '删除分节失败', 'error');
            }
        }
    } catch (error) {
        console.error('删除分节错误：', error);
        Utils.showAlert(`删除分节失败：${error.message}`, 'error');
    }
}

// 处理文件上传
async function handleUploadFormSubmit(event) {
    event.preventDefault();
    try {
        const files = Utils.getElement('#resourceFile').files;
        const courseId = Utils.getQueryParam('courseId');

        if (!files || files.length === 0) {
            Utils.showAlert('未选择文件', 'error');
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
            Utils.showAlert('未登录，请重新登录', 'error');
            window.location.href = '/';
            return;
        }

        const formData = new FormData();
        Array.from(files).forEach(file => formData.append('resourceFiles', file));
        const response = await fetch(`/api/upload/${courseId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`上传失败: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        const resourceList = document.getElementById('resource-list');
        (result.resources || []).forEach(resource => {
            const item = document.createElement('div');
            item.className = 'content-item';
            item.dataset.id = resource.id;
            item.innerHTML = `
                <span>${resource.text || resource.file_path}</span>
                <button class="delete-btn">删除</button>
            `;
            item.querySelector('.delete-btn').addEventListener('click', () => deleteItem('resources', resource.id));
            resourceList.appendChild(item);
        });

        Utils.getElement('#uploadForm').reset();
        Utils.showAlert('文件已上传');
    } catch (error) {
        console.error('文件上传错误：', error);
        Utils.showAlert(`文件上传失败：${error.message}`, 'error');
    }
}

// 显示编辑课程信息模态框
function showEditBannerModal() {
    try {
        Utils.getElement('#bannerModal').style.display = 'block';
    } catch (error) {
        console.error('显示编辑课程信息模态框错误：', error);
        Utils.showAlert(`显示模态框失败：${error.message}`, 'error');
    }
}

// 保存课程信息
async function handleBannerFormSubmit(event) {
    event.preventDefault();
    try {
        const courseName = Utils.getElement('#courseName').value;
        const courseDetails = Utils.getElement('#courseDetails').value;
        const courseId = Utils.getElement('#courseId').value;

        if (!courseName || !courseId) {
            Utils.showAlert('课程名称和 ID 为必填项', 'error');
            return;
        }

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/teacher/courses/${courseId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ courseName, courseDetails })
        });
        const result = await response.json();

        if (response.ok) {
            loadCourseDetails();
            closeModal();
            Utils.showAlert('课程信息已保存');
        } else if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('role');
            window.location.href = '/';
        } else {
            Utils.showAlert(result.error || '更新课程信息失败', 'error');
        }
    } catch (error) {
        console.error('保存课程信息错误：', error);
        Utils.showAlert(`保存课程信息失败：${error.message}`, 'error');
    }
}

// AI 分析学生提问
async function analyzeQuestions(sessionId = null) {
    try {
        const courseId = Utils.getQueryParam('courseId');
        const analyzeButton = Utils.getElement('.analyze-btn');
        const analysisResult = Utils.getElement('#analysisResult');

        if (!courseId) {
            Utils.showAlert('未提供课程 ID', 'error');
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
            Utils.showAlert('未登录，请重新登录', 'error');
            window.location.href = '/';
            return;
        }

        analyzeButton.disabled = true;
        analyzeButton.textContent = '分析中...';
        analysisResult.textContent = '正在生成总结，请稍候...';

        // 构造请求体
        const requestBody = {};
        if (sessionId) {
            requestBody.sessionId = sessionId;
        }

        const response = await fetch(`/api/chat/${courseId}/summarize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestBody) // 确保发送有效的 JSON
        });

        const contentType = response.headers.get('Content-Type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('非 JSON 响应:', text);
            throw new Error('服务器返回了意外内容');
        }

        const result = await response.json();

        if (response.ok) {
            analysisResult.textContent = result.summary;
            Utils.showAlert('学生问题分析已生成');
            await loadAnalysisHistory();
        } else if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('role');
            window.location.href = '/';
        } else {
            analysisResult.textContent = `分析失败：${result.error || '未知错误'}`;
            Utils.showAlert(result.error || '分析学生提问失败', 'error');
        }
    } catch (error) {
        console.error('分析学生提问错误：', error);
        Utils.getElement('#analysisResult').textContent = `分析失败：${error.message}`;
        Utils.showAlert(`分析学生提问失败：${error.message}`, 'error');
    } finally {
        const analyzeButton = Utils.getElement('.analyze-btn');
        analyzeButton.disabled = false;
        analyzeButton.textContent = '分析学生提问';
    }
}
// 加载历史分析记录
async function loadAnalysisHistory() {
    try {
        const courseId = Utils.getQueryParam('courseId');
        const historyList = Utils.getElement('#historyList');

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/chat/${courseId}/summaries`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();

        if (response.ok && result.summaries) {
            historyList.innerHTML = '';
            if (result.summaries.length === 0) {
                historyList.innerHTML = '<p>暂无历史记录</p>';
                return;
            }
            result.summaries.forEach(item => {
                const historyItem = document.createElement('div');
                historyItem.className = 'history-item';
                historyItem.dataset.id = item.id;
                historyItem.innerHTML = `
                    <p>${item.summary}</p>
                    <div class="timestamp">生成时间: ${new Date(item.created_at).toLocaleString()}</div>
                    <div class="actions">
                        <button class="delete-btn" onclick="deleteAnalysis(${item.id})">删除</button>
                    </div>
                `;
                historyList.appendChild(historyItem);
            });
        } else if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('role');
            window.location.href = '/';
        } else {
            historyList.innerHTML = `<p>加载历史记录失败: ${result.error || '未知错误'}</p>`;
        }
    } catch (error) {
        console.error('加载历史记录错误:', error);
        Utils.showAlert(`加载历史记录失败: ${error.message}`, 'error');
    }
}

// 删除 AI 分析记录
async function deleteAnalysis(id) {
    try {
        if (!confirm('确定要删除这条分析记录吗？')) return;

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/chat/summary/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();

        if (response.ok) {
            loadAnalysisHistory();
            Utils.showAlert('分析记录已删除');
        } else if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('role');
            window.location.href = '/';
        } else {
            Utils.showAlert(result.error || '删除失败', 'error');
        }
    } catch (error) {
        console.error('删除分析记录错误:', error);
        Utils.showAlert(`删除失败: ${error.message}`, 'error');
    }
}

// 加载用于分析的分节
async function loadSessionsForAnalysis() {
    try {
        const courseId = Utils.getQueryParam('courseId');
        const sessionSelect = Utils.getElement('#sessionSelectForAnalysis');

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/teacher/courses/${courseId}/sessions`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();

        if (response.ok && data.sessions) {
            sessionSelect.innerHTML = '<option value="">全课程分析</option>'; // 默认选项
            data.sessions.forEach(session => {
                const option = document.createElement('option');
                option.value = session.id;
                option.textContent = `第${session.session_number}节 - ${session.title}`;
                sessionSelect.appendChild(option);
            });
        } else if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('role');
            window.location.href = '/';
        } else {
            Utils.showAlert(data.error || '加载分节失败', 'error');
        }
    } catch (error) {
        console.error('加载分节错误:', error);
        Utils.showAlert(`加载分节失败：${error.message}`, 'error');
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    checkAuth().then(() => {
        try {
            loadCourseDetails();
            loadCourseSessions();
            loadAnalysisHistory();
            loadSessionsForAnalysis();
            Utils.getElement('#contentForm').addEventListener('submit', handleContentFormSubmit);
            Utils.getElement('#uploadForm').addEventListener('submit', handleUploadFormSubmit);
            Utils.getElement('#bannerForm').addEventListener('submit', handleBannerFormSubmit);
            Utils.getElement('#sessionForm').addEventListener('submit', handleSessionFormSubmit);
        } catch (error) {
            console.error('初始化错误:', error);
            Utils.showAlert(`初始化失败：${error.message}`, 'error');
        }
    }).catch(error => {
        console.error('认证失败:', error);
        window.location.href = '/'; // 未登录或 token 无效时跳转到登录页
    });
});