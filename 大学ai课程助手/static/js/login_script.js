// 获取表单元素
const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('errorMessage');

// 提交事件
loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        errorMessage.textContent = '用户名和密码不能为空';
        return;
    }

    const requestBody = { username, password };

    try {
        const response = await fetch('http://127.0.0.1:5000/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (response.ok) {
            // 登录成功
            alert(data.message); // 例如 "欢迎回来，xiaoming！登录成功"
            // 存储 token 和其他用户信息
            localStorage.setItem('token', data.token); // 存储 JWT token
            localStorage.setItem('userId', data.userId);
            localStorage.setItem('role', data.role);

            // 根据角色重定向
            switch (data.role) {
                case 'student':
                    window.location.href = '/mains';
                    break;
                case 'teacher':
                    window.location.href = '/maint';
                    break;
                case 'admin':
                    window.location.href = '/admin';
                    break;
                default:
                    window.location.href = '/'; // 默认页面
            }
        } else {
            // 显示后端返回的错误
            errorMessage.textContent = data.error || '登录失败';
        }
    } catch (error) {
        errorMessage.textContent = '网络错误，请稍后重试';
        console.error('Login error:', error);
    }
});

// 密码显示切换
function togglePassword() {
    const passwordInput = document.getElementById('password');
    passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
}