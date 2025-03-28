// 密码显示切换
function togglePassword() {
    const password = document.getElementById("password");
    const icon = document.querySelector(".fa-eye");

    if (password.type === "password") {
        password.type = "text";
        icon.classList.remove("fa-eye");
        icon.classList.add("fa-eye-slash");
    } else {
        password.type = "password";
        icon.classList.remove("fa-eye-slash");
        icon.classList.add("fa-eye");
    }
}

// 注册表单提交
document.getElementById("signupForm").addEventListener("submit", async function(e) {
    e.preventDefault();

    const fullName = document.getElementById("fullName").value.trim();
    const email = document.getElementById("email").value.trim();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    // 客户端验证
    if (!fullName || !email || !username || !password) {
        alert("所有字段均为必填项！");
        return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
        alert("请输入有效的邮箱地址！");
        return;
    }

    if (password.length < 6) {
        alert("密码长度必须至少6位！");
        return;
    }

    const signupData = {
        full_name: fullName, // 与后端字段名保持一致
        email: email,
        username: username,
        password: password
    };

    try {
        const response = await fetch('/api/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(signupData)
        });

        const result = await response.json();

        if (response.ok) {
            alert(result.message || '注册成功！');
            // 如果后端返回 token，则存储并直接登录
            if (result.token) {
                localStorage.setItem('token', result.token);
                localStorage.setItem('userId', result.userId);
                localStorage.setItem('role', result.role || 'student'); // 默认角色为 student
                // 根据角色重定向
                switch (result.role) {
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
                        window.location.href = '/mains'; // 默认学生页面
                }
            } else {
                // 如果没有返回 token，跳转到登录页
                window.location.href = '/';
            }
        } else {
            alert(result.error || '注册失败');
        }
    } catch (error) {
        console.error('注册错误:', error);
        alert('发生网络错误，请稍后重试');
    }
});