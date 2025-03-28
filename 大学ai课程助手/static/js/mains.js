// mains.js

let coursesData = {};

// 页面加载时检查认证状态并获取课程数据
document.addEventListener('DOMContentLoaded', () => {
    checkAuth().then(() => fetchCourses());
});

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
        console.error('认证检查失败:', error);
        window.location.href = '/';
        throw error;
    }
}

// 获取所有课程数据
async function fetchCourses() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/student/courses', {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        console.log('API 返回的数据:', data); // 调试
        if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('role');
            window.location.href = '/';
            return;
        }
        if (data.courses) {
            coursesData = groupCoursesByStatus(data.courses);
            renderCourses();
        }
    } catch (error) {
        console.error('获取课程失败:', error);
    }
}

// 按状态分组课程
function groupCoursesByStatus(courses) {
    return {
        ongoing: courses.filter(c => c.status === 'ongoing'),
        completed: courses.filter(c => c.status === 'completed')
    };
}

// 渲染课程
function renderCourses() {
    const ongoingContainer = document.getElementById('ongoing-courses');
    ongoingContainer.innerHTML = '';
    if (coursesData.ongoing.length > 0) {
        const year = new Date().getFullYear();
        ongoingContainer.innerHTML = `<h2>${year}-${year + 1} 学年</h2>`;
        coursesData.ongoing.forEach(course => {
            ongoingContainer.appendChild(createCourseCard(course));
        });
    } else {
        ongoingContainer.innerHTML = '<p>暂无进行中的课程</p>';
    }

    const completedContainer = document.getElementById('completed-courses');
    completedContainer.innerHTML = '';
    if (coursesData.completed.length === 0) {
        completedContainer.innerHTML = '<p>暂无已完成的课程</p>';
        return;
    }
    const completedByYear = groupCompletedByYear(coursesData.completed);

    Object.entries(completedByYear).forEach(([year, courses], index) => {
        const subTab = document.createElement('button');
        subTab.className = `sub-tab${index === 0 ? ' active' : ''}`;
        subTab.onclick = () => switchSubTab(`year-${year}`);
        subTab.textContent = `${year} 学年`;
        completedContainer.appendChild(subTab);

        const subCards = document.createElement('div');
        subCards.className = `sub-cards year-${year}${index === 0 ? ' active' : ''}`;
        subCards.innerHTML = `<h2>${year} 学年</h2>`;
        courses.forEach(course => {
            subCards.appendChild(createCourseCard(course));
        });
        completedContainer.appendChild(subCards);
    });
}

// 分组已完成课程按学年
function groupCompletedByYear(courses) {
    return courses.reduce((acc, course) => {
        const year = new Date(course.created_at).getFullYear();
        if (!acc[year]) acc[year] = [];
        acc[year].push(course);
        return acc;
    }, {});
}

// 创建课程卡片
function createCourseCard(course) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = course.course_id;
    card.onclick = () => goToCourse(course.course_id); // 不需要 event，因为是卡片整体
    const deadline = course.deadline ? new Date(course.deadline).toLocaleDateString('zh-CN') : '未设置';
    const isCompleted = course.status === 'completed';
    const isEnrolled = course.is_enrolled;
    card.innerHTML = `
        <div class="card-content">
            <h3>${course.name}</h3>
            <p>状态：${course.status} | 截止日期：${deadline} | 已报名：${course.enrollment || 0}人</p>
        </div>
        <span class="card-id">助课号: ${course.course_id}</span>
        <div class="card-actions">
            ${
                isCompleted 
                ? '' 
                : isEnrolled 
                  ? '<button class="enroll-btn" disabled>已报名</button>' 
                  : `<button class="enroll-btn" onclick="enrollCourse('${course.course_id}', event)">报名</button>`
            }
            <button class="view-btn" onclick="goToCourse('${course.course_id}', event)">查看详情</button>
        </div>
    `;
    return card;
}

// 切换主标签
function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.cards').forEach(cards => cards.classList.remove('active'));
    document.querySelector(`button[onclick="switchTab('${tabName}')"]`).classList.add('active');
    document.getElementById(`${tabName}-courses`).classList.add('active');
}

// 切换子标签（已完成课程的学年）
function switchSubTab(subTabName) {
    document.querySelectorAll('.sub-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.sub-cards').forEach(cards => cards.classList.remove('active'));
    document.querySelector(`button[onclick="switchSubTab('${subTabName}')"]`).classList.add('active');
    document.querySelector(`.sub-cards.${subTabName}`).classList.add('active');
}

// 跳转到课程详情页面
function goToCourse(courseId, event) {
    if (event) event.stopPropagation();

    if (!courseId) {
        console.error('courseId 未定义');
        alert('无法跳转：缺少课程ID');
        return;
    }

    const webUrl = `/student-course?courseId=${courseId}`;
    console.log('跳转到:', webUrl); // 调试

    try {
        window.location.href = webUrl;
    } catch (error) {
        console.error('跳转失败:', error);
        window.location.href = webUrl; // 即使出错也尝试网页跳转
    }
}

// 报名课程
async function enrollCourse(courseId, event) {
    event.stopPropagation();
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/student/courses/${courseId}/enroll`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
        if (response.ok) {
            alert('报名成功');
            fetchCourses();
        } else if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('userId');
            localStorage.removeItem('role');
            window.location.href = '/';
        } else {
            alert(`报名失败: ${data.error || '未知错误'}`);
        }
    } catch (error) {
        console.error('报名失败:', error);
        alert('报名时发生错误');
    }
}

// 加入课程（通过助课号加入）
function joinCourse() {
    const modal = document.createElement('div');
    modal.id = 'join-course-modal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close" onclick="closeModal()">×</span>
            <h2>加入课程</h2>
            <form id="join-course-form">
                <div class="form-group">
                    <label for="course-id">请输入课程助课号:</label>
                    <input type="text" id="course-id" name="course_id" required>
                </div>
                <button type="submit">加入</button>
            </form>
        </div>
    `;
    document.querySelector('.container').appendChild(modal);
    modal.style.display = 'block';

    document.getElementById('join-course-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const courseId = formData.get('course_id');
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/student/courses/${courseId}/enroll`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();
            if (response.ok) {
                alert('加入课程成功');
                closeModal();
                fetchCourses();
            } else if (response.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('userId');
                localStorage.removeItem('role');
                window.location.href = '/';
            } else {
                alert(`加入失败: ${data.error || '未知错误'}`);
            }
        } catch (error) {
            console.error('加入课程失败:', error);
            alert('加入课程时发生错误');
        }
    });
}

// 关闭模态框
function closeModal() {
    const modal = document.getElementById('join-course-modal');
    if (modal) modal.remove();
}