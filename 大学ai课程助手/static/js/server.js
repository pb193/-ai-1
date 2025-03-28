const express = require('express');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// MySQL 数据库连接配置
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'course_management'
};

// 创建数据库连接池
const pool = mysql.createPool(dbConfig);

// JWT 密钥（应存储在环境变量中）
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'; // 在 .env 文件中设置

// 中间件：验证 JWT token
const authenticateUser = async (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) {
        return res.status(401).json({ error: '缺少 token，请先登录' });
    }

    try {
        const tokenValue = token.startsWith('Bearer ') ? token.slice(7) : token;
        const decoded = jwt.verify(tokenValue, JWT_SECRET);
        req.userId = decoded.user_id; // 从 token 中获取 user_id
        req.role = decoded.role; // 从 token 中获取角色（可选）
        next();
    } catch (error) {
        console.error('JWT 验证失败:', error);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token 已过期，请重新登录' });
        }
        return res.status(401).json({ error: '无效的 Token' });
    }
};

// 获取课程详情
app.get('/api/student/courses/:courseId', authenticateUser, async (req, res) => {
    const { courseId } = req.params;
    const userId = req.userId;

    try {
        const connection = await pool.getConnection();

        // 检查用户是否报名该课程
        const [enrollmentRows] = await connection.execute(
            'SELECT COUNT(*) as count FROM enrollments WHERE course_id = ? AND student_id = ?',
            [courseId, userId]
        );
        if (enrollmentRows[0].count === 0) {
            connection.release();
            return res.status(403).json({ error: '未报名此课程，无权限访问' });
        }

        // 获取课程基本信息
        const [courseRows] = await connection.execute(
            'SELECT course_id, name, details, deadline, enrollment FROM courses WHERE course_id = ?',
            [courseId]
        );
        if (!courseRows.length) {
            connection.release();
            return res.status(404).json({ error: '课程不存在' });
        }
        const course = courseRows[0];

        // 获取各 tab 内容
        const [contentRows] = await connection.execute(
            'SELECT tab, text, file_path FROM content WHERE course_id = ?',
            [courseId]
        );

        // 组织内容数据
        const content = {
            overview: null,
            resources: null,
            discussion: null,
            tasks: null
        };
        contentRows.forEach(row => {
            if (row.tab === 'resources') {
                content.resources = { description: row.text, url: row.file_path || '#' };
            } else if (row.tab === 'tasks') {
                content.tasks = { description: row.text, deadline: course.deadline };
            } else {
                content[row.tab] = row.text;
            }
        });

        // 构造响应
        const response = {
            course: {
                course_id: course.course_id,
                name: course.name,
                deadline: course.deadline,
                enrollment: course.enrollment,
                overview: content.overview || '暂无课程内容',
                resources: content.resources || null,
                discussion: content.discussion || '暂无讨论',
                tasks: content.tasks || null
            }
        };

        connection.release();
        res.json(response);
    } catch (error) {
        console.error('获取课程详情错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 发送聊天消息并获取 AI 回复
app.post('/api/chat/:courseId', authenticateUser, async (req, res) => {
    const { courseId } = req.params;
    const { message } = req.body;
    const userId = req.userId;

    if (!message) {
        return res.status(400).json({ error: '消息内容不能为空' });
    }

    try {
        const connection = await pool.getConnection();

        // 检查课程是否存在
        const [courseRows] = await connection.execute(
            'SELECT 1 FROM courses WHERE course_id = ?',
            [courseId]
        );
        if (!courseRows.length) {
            connection.release();
            return res.status(404).json({ error: '课程不存在' });
        }

        // 检查用户是否报名该课程
        const [enrollmentRows] = await connection.execute(
            'SELECT COUNT(*) as count FROM enrollments WHERE course_id = ? AND student_id = ?',
            [courseId, userId]
        );
        if (enrollmentRows[0].count === 0) {
            connection.release();
            return res.status(403).json({ error: '未报名此课程，无权限聊天' });
        }

        // 保存用户消息
        await connection.execute(
            'INSERT INTO chat_messages (course_id, message, user_id, is_ai_response) VALUES (?, ?, ?, FALSE)',
            [courseId, message, userId]
        );

        // 模拟 AI 回复（实际可替换为真实 AI 服务）
        const aiResponse = `AI 回复: 关于 "${message}"，这是一个很好的问题！请参考课程内容或资源部分了解更多。`;

        // 保存 AI 回复
        await connection.execute(
            'INSERT INTO chat_messages (course_id, message, is_ai_response) VALUES (?, ?, TRUE)',
            [courseId, aiResponse]
        );

        connection.release();
        res.json({ response: aiResponse });
    } catch (error) {
        console.error('聊天错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 启动服务器
app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
});