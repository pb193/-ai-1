// 通用工具函数
const Utils = {
    showAlert(message, type = 'info') {
        alert(`${type === 'error' ? '错误：' : ''}${message}`);
    },
    getElement(selector, errorMessage = '元素未找到') {
        const element = document.querySelector(selector);
        if (!element) throw new Error(errorMessage);
        return element;
    },
    getElementAll(selector, errorMessage = '多个元素未找到') {
        const elements = document.querySelectorAll(selector);
        if (!elements.length) throw new Error(errorMessage);
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

// 加载课程分节
async function loadCourseSessions() {
    try {
        const courseId = Utils.getQueryParam('courseId');
        if (!courseId) throw new Error('未提供课程 ID');

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/student/courses/${courseId}/sessions`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();

        if (response.ok && data.sessions) {
            const sessionSelect = Utils.getElement('#sessionSelect');
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
            Utils.showAlert(data.error || '加载课程分节失败', 'error');
        }
    } catch (error) {
        console.error('加载分节错误:', error);
        Utils.showAlert(`加载课程分节失败：${error.message}`, 'error');
    }
}

// 聊天功能
async function sendMessage() {
    try {
        const input = Utils.getElement('#chatInput');
        const sendButton = Utils.getElement('#sendButton');
        const sessionSelect = Utils.getElement('#sessionSelect');
        const message = input.value.trim();
        const sessionId = sessionSelect.value;
        const chatMessages = Utils.getElement('#chatMessages');

        if (!message) {
            Utils.showAlert('请输入消息', 'error');
            return;
        }

        sendButton.disabled = true;
        input.disabled = true;
        sendButton.textContent = '发送中...';

        const userMessage = document.createElement('p');
        userMessage.className = 'user-message';
        userMessage.textContent = message;
        chatMessages.appendChild(userMessage);

        await fetchChatResponse(message, sessionId, chatMessages);

        input.value = '';
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
        console.error('发送消息错误：', error);
        Utils.showAlert(`发送消息失败：${error.message}`, 'error');
    } finally {
        const sendButton = Utils.getElement('#sendButton');
        const input = Utils.getElement('#chatInput');
        sendButton.disabled = false;
        input.disabled = false;
        sendButton.textContent = '发送';
    }
}

async function fetchChatResponse(message, sessionId, chatMessages) {
    try {
        const courseId = Utils.getQueryParam('courseId');
        if (!courseId) throw new Error('未提供课程 ID');

        const token = localStorage.getItem('token');
        const payload = { message };
        if (sessionId) payload.sessionId = sessionId;

        console.log(`Sending chat request to: /api/chat/${courseId}`);
        const response = await fetch(`/api/chat/${courseId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (response.status === 404) {
            Utils.showAlert('聊天服务不可用，请检查课程 ID 或服务器配置', 'error');
            return;
        } else if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('role');
            window.location.href = '/';
        } else if (!response.ok) {
            Utils.showAlert(result.error || '未知错误', 'error');
            return;
        }

        const aiMessage = document.createElement('p');
        aiMessage.className = 'ai-message';
        aiMessage.textContent = result.response;
        chatMessages.appendChild(aiMessage);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
        console.error('获取 AI 回复错误:', error);
        throw error;
    }
}


async function downloadResource(url) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            Utils.showAlert('请先登录以下载资源', 'error');
            window.location.href = '/';
            return;
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            if (response.status === 401) {
                Utils.showAlert('请先登录以下载资源', 'error');
                localStorage.removeItem('token');
                localStorage.removeItem('userId');
                localStorage.removeItem('role');
                window.location.href = '/';
            } else if (response.status === 403) {
                Utils.showAlert('无权限下载此资源', 'error');
            } else if (response.status === 404) {
                Utils.showAlert('资源不存在', 'error');
            } else {
                Utils.showAlert(errorData.error || '下载资源失败', 'error');
            }
            return;
        }

        const blob = await response.blob();
        const filename = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || url.split('/').pop();
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.download = filename || 'resource';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        console.error('下载资源错误:', error);
        Utils.showAlert(`下载资源失败：${error.message}`, 'error');
    }
}

// 加载课程详情
async function loadCourseDetails() {
    try {
        const courseId = Utils.getQueryParam('courseId');
        if (!courseId) {
            Utils.showAlert('未提供课程 ID', 'error');
            return;
        }

        const token = localStorage.getItem('token');
        const response = await fetch(`/api/student/courses/${courseId}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();

        if (response.ok && data.course) {
            const course = data.course;
            Utils.getElement('#course-title').textContent = course.name || '未命名';
            Utils.getElement('#banner-title').textContent = course.name || '未命名';
            Utils.getElement('#banner-deadline').textContent = `截止日期：${course.deadline ? new Date(course.deadline).toLocaleString('zh-CN') : '未设置'}`;
            Utils.getElement('#banner-enrollment').textContent = `报名助课号: ${course.course_id}，已有${course.enrollment || 0}人加入`;

            Utils.getElement('#overview-content').innerHTML = course.overview ? `<p>${course.overview}</p>` : '<p>暂无课程内容</p>';

            const resourcesContent = Utils.getElement('#resources-content');
            if (course.resources && course.resources.length > 0) {
                resourcesContent.innerHTML = course.resources.map(r => `
                    <p>${r.description || '未命名资源'}</p>
                    <button class="resource-link" data-url="${r.url || '#'}">下载资源</button>
                `).join('');

                // 添加下载事件
                resourcesContent.querySelectorAll('.resource-link').forEach(button => {
                    button.addEventListener('click', () => downloadResource(button.getAttribute('data-url')));
                });
            } else {
                resourcesContent.innerHTML = '<p>暂无学习资源</p>';
            }

            // 其余代码保持不变
            const discussionContent = Utils.getElement('#discussion-content');
            if (course.discussion && course.discussion.length > 0) {
                discussionContent.innerHTML = course.discussion.map(d => `<p>${d.text || '无内容'}</p>`).join('');
            } else {
                discussionContent.innerHTML = '<p>暂无讨论</p>';
            }

            const tasksContent = Utils.getElement('#tasks-content');
            if (course.tasks && course.tasks.length > 0) {
                tasksContent.innerHTML = course.tasks.map(t =>
                    `<p>${t.description || '无描述'} 提交日期：${t.deadline ? new Date(t.deadline).toLocaleString('zh-CN') : '未设置'}</p><a href="#" class="task-link">提交任务</a>`
                ).join('');
            } else {
                tasksContent.innerHTML = '<p>暂无任务</p>';
            }
        } else if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('role');
            window.location.href = '/';
        } else {
            Utils.showAlert(data.error || '加载课程详情失败', 'error');
        }
    } catch (error) {
        console.error('加载错误:', error);
        Utils.showAlert(`加载课程详情失败：${error.message}`, 'error');
    }
}


// 初始化
document.addEventListener('DOMContentLoaded', () => {
    checkAuth().then(() => {
        try {
            loadCourseDetails();
            loadCourseSessions();

            const sendButton = Utils.getElement('#sendButton');
            const input = Utils.getElement('#chatInput');
            sendButton.addEventListener('click', sendMessage);
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') sendMessage();
            });
        } catch (error) {
            console.error('初始化错误:', error);
            Utils.showAlert(`初始化失败：${error.message}`, 'error');
        }
    }).catch(error => {
        console.error('认证失败:', error);
        window.location.href = '/'; // 未登录或 token 无效时跳转到登录页
    });
});