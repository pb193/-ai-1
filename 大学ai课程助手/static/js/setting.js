// static/js/setting.js
document.addEventListener('DOMContentLoaded', function() {
    // 检查认证状态
    checkAuth().then(() => {
        // Handle form submission
        const form = document.querySelector('.settings-form');
        if (form) {
            form.addEventListener('submit', async function(e) {
                e.preventDefault();

                const formId = form.id;
                const isTeacher = formId === 'teacherSettingsForm';
                const nameField = document.getElementById(isTeacher ? 'teacherName' : 'studentName');
                const emailField = document.getElementById(isTeacher ? 'teacherEmail' : 'studentEmail');
                const passwordField = document.getElementById(isTeacher ? 'teacherPassword' : 'studentPassword');

                const data = {
                    full_name: nameField.value,
                    email: emailField.value,
                    password: passwordField.value
                };

                try {
                    const token = localStorage.getItem('token');
                    const response = await fetch('/api/update_settings', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(data)
                    });

                    const result = await response.json();

                    if (response.ok) {
                        alert('设置已成功保存！');
                        // 根据角色重定向
                        window.location.href = isTeacher ? '/maint' : '/mains';
                    } else if (response.status === 401) {
                        localStorage.removeItem('token');
                        localStorage.removeItem('userId');
                        localStorage.removeItem('role');
                        window.location.href = '/';
                        alert('未授权，请重新登录');
                    } else {
                        alert(`错误: ${result.error || '保存失败'}`);
                    }
                } catch (error) {
                    console.error('Error:', error);
                    alert('发生网络错误，请稍后重试');
                }
            });
        }
    }).catch(error => {
        console.error('认证失败:', error);
        window.location.href = '/'; // 未登录或 token 无效时跳转到登录页
    });
});

// 检查认证状态
async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
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
            throw new Error(data.error || '认证失败');
        }
        return data; // 返回认证数据（可选）
    } catch (error) {
        throw error;
    }
}