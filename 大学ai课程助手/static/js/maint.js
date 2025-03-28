// 存储课程数据
let coursesData = { ongoing: [], completed: [] };

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
        const response = await fetch('/api/teacher/courses', {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('userId');
                localStorage.removeItem('role');
                window.location.href = '/';
                return;
            }
            const data = await response.json();
            throw new Error(data.error || '获取课程数据失败');
        }
        const data = await response.json();
        if (data.courses) {
            coursesData.ongoing = data.courses.filter(course => course.status === 'ongoing' || course.status === 'draft');
            coursesData.completed = data.courses.filter(course => course.status === 'completed');
            renderCourses();
        } else {
            console.error('返回数据中缺少 courses 字段:', data);
            alert('获取课程数据失败，请稍后重试');
        }
    } catch (error) {
        console.error('获取课程失败:', error);
        alert(`获取课程失败: ${error.message}`);
    }
}

// 渲染所有课程
function renderCourses() {
    renderOngoingCourses();
    renderCompletedCourses();
}

// 渲染进行中的课程（包括草稿）
function renderOngoingCourses() {
    const ongoingContainer = document.getElementById('ongoing-courses');
    ongoingContainer.innerHTML = '';
    if (coursesData.ongoing.length === 0) {
        ongoingContainer.innerHTML = '<p>暂无进行中的课程</p>';
        return;
    }
    const currentYear = new Date().getFullYear();
    ongoingContainer.innerHTML = `<h2>${currentYear}-${currentYear + 1} 学年</h2>`;
    coursesData.ongoing.forEach(course => ongoingContainer.appendChild(createCourseCard(course)));
}

// 渲染已完成的课程
function renderCompletedCourses() {
    const completedContainer = document.getElementById('completed-courses');
    completedContainer.innerHTML = '';
    if (coursesData.completed.length === 0) {
        completedContainer.innerHTML = '<p>暂无已完成的课程</p>';
        return;
    }
    const completedByYear = groupByYear(coursesData.completed);
    Object.entries(completedByYear).forEach(([year, courses], index) => {
        const subTab = document.createElement('button');
        subTab.className = `sub-tab${index === 0 ? ' active' : ''}`;
        subTab.onclick = () => switchSubTab(`year-${year}`);
        subTab.textContent = `${year} 学年`;
        completedContainer.appendChild(subTab);

        const subCards = document.createElement('div');
        subCards.className = `sub-cards year-${year}${index === 0 ? ' active' : ''}`;
        subCards.innerHTML = `<h2>${year} 学年</h2>`;
        courses.forEach(course => subCards.appendChild(createCourseCard(course)));
        completedContainer.appendChild(subCards);
    });
}

// 按年份分组
function groupByYear(courses) {
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
    card.onclick = () => window.location.href = `/teacher-course?courseId=${course.course_id}`; // 修改为教师端跳转
    const deadline = course.deadline ? new Date(course.deadline).toLocaleDateString('zh-CN') : '未设置';
    card.innerHTML = `
        <div class="card-content">
            <h3>${course.name}</h3>
            <p>状态：${course.status} | 截止日期：${deadline} | 已报名：${course.enrollment}人</p>
        </div>
        <span class="card-id">助课号: ${course.course_id}</span>
        <div class="card-actions">
            <button class="edit-btn" onclick="editCourse('${course.course_id}', event)">编辑</button>
            <button class="delete-btn" onclick="deleteCourse('${course.course_id}', event)">删除</button>
            ${course.status === 'ongoing' || course.status === 'draft' 
                ? `<button class="complete-course-btn" onclick="completeCourse('${course.course_id}', event)">结课</button>` 
                : ''}
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

// 切换子标签
function switchSubTab(subTabName) {
    document.querySelectorAll('.sub-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.sub-cards').forEach(cards => cards.classList.remove('active'));
    document.querySelector(`button[onclick="switchSubTab('${subTabName}')"]`).classList.add('active');
    document.querySelector(`.sub-cards.${subTabName}`).classList.add('active');
}

// 跳转到课程详情（学生端使用，教师端已通过 card.onclick 实现）
function goToCourse(courseId) {
    const appUrl = `yourapp://student-course/${courseId}`; // 替换为你的真实 app URL scheme
    const webFallback = `/student-course-detail?courseId=${courseId}`; // 学生端详情页，带 courseId 参数

    try {
        console.log(`尝试跳转到 app: ${appUrl}`);
        window.location.href = appUrl;

        // 如果 app 未响应，1秒后回退到网页
        setTimeout(() => {
            console.log(`App 未响应，回退到: ${webFallback}`);
            window.location.href = webFallback;
        }, 1000);
    } catch (error) {
        console.error('跳转失败:', error);
        window.location.href = webFallback;
    }
}

// 编辑课程 - 显示学生管理模态框
function editCourse(courseId, event) {
    event.stopPropagation();

    const modal = document.createElement('div');
    modal.id = 'edit-course-modal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close" onclick="closeModal()">×</span>
            <h2>管理学生 - 助课号: ${courseId}</h2>
            <div class="student-list">
                <p>加载中...</p>
            </div>
        </div>
    `;
    document.querySelector('.container').appendChild(modal);
    modal.style.display = 'block';

    const token = localStorage.getItem('token');
    fetch(`/api/teacher/courses/${courseId}/students`, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => {
        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('userId');
                localStorage.removeItem('role');
                window.location.href = '/';
                throw new Error('请先登录');
            }
            if (response.status === 403) throw new Error('权限不足');
            if (response.status === 404) throw new Error('课程不存在');
            return response.json().then(data => { throw new Error(data.error || '未知错误'); });
        }
        return response.json();
    })
    .then(data => {
        const studentList = modal.querySelector('.student-list');
        if (!data.students) {
            throw new Error('返回数据中缺少 students 字段');
        }
        studentList.innerHTML = data.students.length > 0
            ? data.students.map(student => `
                <div class="student-item">
                    <span class="student-name">${student.full_name} (${student.username})</span>
                    <button class="delete-student-btn" onclick="deleteStudent('${courseId}', '${student.id}', event)">移除</button>
                </div>
            `).join('')
            : '<p>暂无学生报名此课程</p>';
    })
    .catch(error => {
        console.error('获取学生数据失败:', error);
        modal.querySelector('.student-list').innerHTML = `<p class="error-message">加载失败: ${error.message}</p>`;
    });
}

// 删除课程
async function deleteCourse(courseId, event) {
    event.stopPropagation();
    if (confirm('确定要删除此课程吗？此操作不可撤销。')) {
        const deleteButton = event.target;
        deleteButton.disabled = true;
        deleteButton.textContent = '删除中...';
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/teacher/courses/${courseId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();
            if (response.ok) {
                alert('课程删除成功');
                fetchCourses();
            } else if (response.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('userId');
                localStorage.removeItem('role');
                window.location.href = '/';
            } else {
                alert(`删除失败: ${data.error || '未知错误'}`);
            }
        } catch (error) {
            console.error('删除课程失败:', error);
            alert('删除课程时发生错误，请稍后重试');
        } finally {
            deleteButton.disabled = false;
            deleteButton.textContent = '删除';
        }
    }
}

// 创建课程
function createCourse() {
    const existingModal = document.getElementById('create-course-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'create-course-modal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close" onclick="closeModal()">×</span>
            <h2>创建新课程</h2>
            <form id="create-course-form">
                <div class="form-group">
                    <label for="course-id">课程助课号（如 NEWxxxxxx）:</label>
                    <input type="text" id="course-id" name="course_id" required>
                </div>
                <div class="form-group">
                    <label for="course-name">课程名称:</label>
                    <input type="text" id="course-name" name="name" required>
                </div>
                <button type="submit">创建课程</button>
            </form>
        </div>
    `;
    document.querySelector('.container').appendChild(modal);
    modal.style.display = 'block';

    document.getElementById('create-course-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);
        const courseData = {
            course_id: formData.get('course_id'),
            name: formData.get('name'),
            status: 'ongoing' // 默认创建为进行中
        };

        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/teacher/courses', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(courseData)
            });
            const data = await response.json();
            if (response.ok) {
                alert('课程创建成功');
                closeModal();
                fetchCourses();
            } else if (response.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('userId');
                localStorage.removeItem('role');
                window.location.href = '/';
            } else {
                alert(`创建失败: ${data.error || '未知错误'}`);
            }
        } catch (error) {
            console.error('创建课程失败:', error);
            alert('创建课程时发生错误');
        }
    });
}

// 删除学生
async function deleteStudent(courseId, studentId, event) {
    event.stopPropagation();
    if (confirm('确定要移除此学生吗？')) {
        const deleteButton = event.target;
        deleteButton.disabled = true;
        deleteButton.textContent = '删除中...';
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/teacher/courses/${courseId}/students/${studentId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            const contentType = response.headers.get('Content-Type');
            let data;
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                throw new Error('服务器返回了非 JSON 响应');
            }

            if (response.ok) {
                alert('学生移除成功');
                closeModal();
                editCourse(courseId, { stopPropagation: () => {} });
            } else if (response.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('userId');
                localStorage.removeItem('role');
                window.location.href = '/';
            } else {
                alert(`移除失败: ${data.error || '未知错误'}`);
            }
        } catch (error) {
            console.error('移除学生失败:', error);
            alert(`移除学生失败: ${error.message}`);
        } finally {
            deleteButton.disabled = false;
            deleteButton.textContent = '删除';
        }
    }
}

// 结课函数
async function completeCourse(courseId, event) {
    event.stopPropagation();
    if (confirm('确定要将此课程标记为已完成吗？此操作不可撤销。')) {
        const completeButton = event.target;
        completeButton.disabled = true;
        completeButton.textContent = '结课中...';
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/teacher/courses/${courseId}/complete`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status: 'completed' })
            });
            const data = await response.json();
            if (response.ok) {
                alert('课程已标记为已完成');
                fetchCourses(); // 刷新课程列表
            } else if (response.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('userId');
                localStorage.removeItem('role');
                window.location.href = '/';
            } else {
                alert(`结课失败: ${data.error || '未知错误'}`);
            }
        } catch (error) {
            console.error('结课错误:', error);
            alert('结课时发生错误，请稍后重试');
        } finally {
            completeButton.disabled = false;
            completeButton.textContent = '结课';
        }
    }
}

// 关闭模态框
function closeModal() {
    const modals = document.querySelectorAll('.modal'); // 获取所有模态框
    modals.forEach(modal => modal.remove()); // 移除所有模态框
}