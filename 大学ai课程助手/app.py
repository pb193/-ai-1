import re
from venv import logger
from apscheduler.schedulers.background import BackgroundScheduler
from openai import OpenAI
from flask import Flask, request, jsonify, send_from_directory, render_template
from flask_bcrypt import Bcrypt
import mysql.connector
from mysql.connector import Error
from datetime import datetime, timedelta
import jwt
from functools import wraps
import os
import uuid

# 初始化 Flask 应用
app = Flask(__name__)
bcrypt = Bcrypt(app)
app.config['SECRET_KEY'] = os.urandom(24)  # 用于 JWT 签名的密钥，生产环境应固定并安全存储
# MySQL 配置
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',  # 替换为您的 MySQL 用户名
    'password': 'root',  # 替换为您的 MySQL 密码
    'database': 'course_management'
}

# 文件上传配置
UPLOAD_FOLDER = 'uploads'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ALLOWED_EXTENSIONS = {'docx', 'ppt', 'pptx', 'pdf', 'png', 'jpg', 'jpeg', 'gif'}


# 创建数据库连接
def get_db_connection():
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except Error as e:
        print(f"数据库连接失败: {e}")
        return None


# 权限装饰器
# JWT 权限装饰器
def require_role(role):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            token = request.headers.get('Authorization')
            if not token:
                return jsonify({'error': '缺少 token，请先登录'}), 401
            try:
                # 假设 token 是 "Bearer <token>" 格式
                if token.startswith('Bearer '):
                    token = token.split(' ')[1]
                data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
                user_id = data['user_id']
                conn = get_db_connection()
                if not conn:
                    return jsonify({'error': '数据库连接失败'}), 500
                try:
                    cursor = conn.cursor(dictionary=True)
                    cursor.execute("SELECT role FROM users WHERE id = %s", (user_id,))
                    user = cursor.fetchone()
                    if not user or user['role'] != role:
                        return jsonify({'error': '权限不足'}), 403
                    # 将用户信息附加到请求中，便于后续使用
                    request.user = data
                    return f(*args, **kwargs)
                finally:
                    cursor.close()
                    conn.close()
            except jwt.ExpiredSignatureError:
                return jsonify({'error': 'Token 已过期，请重新登录'}), 401
            except jwt.InvalidTokenError:
                return jsonify({'error': '无效的 Token'}), 401

        return decorated_function

    return decorator


# 检查文件类型
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# 路由 - 页面渲染
@app.route('/')
def home():
    return render_template('html/login.html')


@app.route('/signup')
def signup_page():
    return render_template('html/signup.html')


@app.route('/mains')
def mains_page():
    return render_template('html/mains.html')


@app.route('/maint')
def maint_page():
    return render_template('html/maint.html')


@app.route('/student-course')
def student_course_page():
    return render_template('html/student-course.html')


@app.route('/teacher-course')
def teacher_course_page():
    return render_template('html/teacher-course.html')


@app.route('/student-setting')
def student_setting_page():
    return render_template('html/student-settings.html')


@app.route('/teacher-setting')
def teacher_setting_page():
    return render_template('html/teacher-settings.html')


# 用户管理端点
@app.route('/api/signup', methods=['POST'])
def signup():
    """用户注册"""
    data = request.get_json()
    full_name = data.get('fullName')
    email = data.get('email')
    username = data.get('username')
    password = data.get('password')
    role = data.get('role', 'student')

    # 检查所有字段是否填写
    if not all([full_name, email, username, password]):
        return jsonify({'error': '所有字段均为必填项'}), 400

    # 验证邮箱格式
    if '@' not in email or '.' not in email:
        return jsonify({'error': '请输入有效的邮箱地址'}), 400

    # 验证密码复杂度
    if len(password) < 8:
        return jsonify({'error': '密码长度至少为8位'}), 400
    if not re.search(r'[A-Z]', password):
        return jsonify({'error': '密码必须包含至少一个大写字母'}), 400
    if not re.search(r'[a-z]', password):
        return jsonify({'error': '密码必须包含至少一个小写字母'}), 400
    if not re.search(r'\d', password):
        return jsonify({'error': '密码必须包含至少一个数字'}), 400

    # 验证角色有效性
    if role not in ['student', 'teacher', 'admin']:
        return jsonify({'error': '无效的角色'}), 400

    # 加密密码
    hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')

    # 数据库连接
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO users (full_name, email, username, password, role)
            VALUES (%s, %s, %s, %s, %s)
        """, (full_name, email, username, hashed_password, role))
        conn.commit()
        return jsonify({'message': f'注册成功！欢迎，{username}'}), 201
    except mysql.connector.IntegrityError:
        return jsonify({'error': '邮箱或用户名已存在'}), 400
    finally:
        cursor.close()
        conn.close()


# 修改登录端点，使用 JWT
@app.route('/api/login', methods=['POST'])
def login():
    if not request.is_json:
        return jsonify({'error': '请求必须是 JSON 格式'}), 415

    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': '用户名和密码不能为空'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
        user = cursor.fetchone()
        if not user:
            return jsonify({'error': '用户名不存在'}), 404
        if bcrypt.check_password_hash(user['password'], password):
            # 生成 JWT token
            token = jwt.encode({
                'user_id': user['id'],
                'username': user['username'],
                'role': user['role'],
                'exp': datetime.utcnow() + timedelta(hours=1)  # 1小时有效期
            }, app.config['SECRET_KEY'], algorithm='HS256')
            return jsonify({
                'message': f'欢迎回来，{username}！登录成功',
                'token': token,
                'userId': user['id'],
                'role': user['role']
            }), 200
        return jsonify({'error': '密码错误'}), 401
    finally:
        cursor.close()
        conn.close()


# 登出（客户端处理，清空 token）
@app.route('/api/logout', methods=['POST'])
def logout():
    """用户登出，前端只需清除本地 token"""
    return jsonify({'message': '已成功登出'}), 200


# 课程管理端点
@app.route('/api/courses', methods=['GET'])
def get_courses():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT course_id AS courseId, name, details, deadline, enrollment, created_by 
            FROM courses
        """)
        all_courses = cursor.fetchall()
        current_time = datetime.now()
        ongoing = []
        completed = []
        for course in all_courses:
            if course['deadline']:
                course['deadline'] = course['deadline'].isoformat()
            if course['deadline'] and datetime.fromisoformat(course['deadline']) > current_time:
                ongoing.append(course)
            else:
                completed.append(course)
        return jsonify({'ongoing': ongoing, 'completed': completed})
    finally:
        cursor.close()
        conn.close()


@app.route('/api/courses', methods=['POST'])
@require_role('teacher')
def create_course():
    data = request.get_json()
    course_name = data.get('courseName')
    if not course_name:
        return jsonify({'error': '课程名称是必填项'}), 400

    # 从 JWT token 中获取 user_id
    user_id = request.user['user_id']  # 通过 @require_role 装饰器附加到 request.user 中
    course_id = f"NEW{uuid.uuid4().hex[:6]}"
    details = data.get('courseDetails', '暂无详情')
    deadline = data.get('deadline')

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO courses (course_id, name, details, deadline, created_by)
            VALUES (%s, %s, %s, %s, %s)
        """, (course_id, course_name, details, deadline, user_id))
        conn.commit()
        return jsonify({'message': '课程已创建', 'courseId': course_id}), 201
    finally:
        cursor.close()
        conn.close()



# 示例：更新用户设置
@app.route('/api/update_settings', methods=['POST'])
def update_settings():
    token = request.headers.get('Authorization')
    if not token:
        return jsonify({'error': '请先登录'}), 401
    try:
        if token.startswith('Bearer '):
            token = token.split(' ')[1]
        data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        user_id = data['user_id']
    except:
        return jsonify({'error': '无效的 Token 或已过期'}), 401

    data = request.get_json()
    full_name = data.get('full_name')
    email = data.get('email')
    password = data.get('password')

    if not all([full_name, email, password]):
        return jsonify({'error': '所有字段均为必填'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor()
        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        update_query = """
            UPDATE users 
            SET full_name = %s, email = %s, password = %s 
            WHERE id = %s
        """
        cursor.execute(update_query, (full_name, email, hashed_password, user_id))

        cursor.execute("SELECT id FROM users WHERE email = %s AND id != %s", (email, user_id))
        if cursor.fetchone():
            conn.rollback()
            return jsonify({'error': '该邮箱已被使用'}), 400

        conn.commit()
        return jsonify({'message': '设置已更新'}), 200
    except Error as e:
        print(f"数据库错误: {e}")
        return jsonify({'error': '服务器错误'}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/api/teacher/courses', methods=['GET'])
@require_role('teacher')
def get_teacher_courses():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT course_id, name, details, deadline, enrollment, created_at, status
            FROM courses
            WHERE created_by = %s
        """
        cursor.execute(query, (request.user['user_id'],))
        courses = cursor.fetchall()
        for course in courses:
            if course['deadline']:
                course['deadline'] = course['deadline'].isoformat()
            course['created_at'] = course['created_at'].isoformat()
        return jsonify({'courses': courses}), 200
    except Error as e:
        return jsonify({'error': f'查询课程失败: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()

# 创建课程
@app.route('/api/teacher/courses', methods=['POST'])
@require_role('teacher')
def create_teacher_course():
    data = request.get_json()
    course_id = data.get('course_id')
    name = data.get('name')
    status = data.get('status', 'ongoing')  # 默认状态为 'ongoing'

    if not course_id or not name:
        return jsonify({'error': '课程号和课程名称为必填项'}), 400

    # 从 JWT token 中获取 user_id
    user_id = request.user['user_id']  # 通过 @require_role 装饰器附加到 request.user 中

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor()
        query = """
            INSERT INTO courses (course_id, name, status, created_by)
            VALUES (%s, %s, %s, %s)
        """
        cursor.execute(query, (course_id, name, status, user_id))
        conn.commit()
        return jsonify({'success': True}), 201
    except Error as e:
        return jsonify({'error': f'创建课程失败: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()
    data = request.get_json()
    course_id = data.get('course_id')
    name = data.get('name')
    status = data.get('status', 'ongoing')  # 默认状态为 'ongoing'

    if not course_id or not name:
        return jsonify({'error': '课程号和课程名称为必填项'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor()
        query = """
            INSERT INTO courses (course_id, name, status, created_by)
            VALUES (%s, %s, %s, %s)
        """
        cursor.execute(query, (course_id, name, status, session['user_id']))
        conn.commit()
        return jsonify({'success': True}), 201
    except Error as e:
        return jsonify({'error': f'创建课程失败: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()


# 删除课程返回课程详情
@app.route('/api/teacher/courses/<course_id>', methods=['GET', 'DELETE', 'PUT'])
@require_role('teacher')
def teacher_course(course_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        user_id = request.user['user_id']

        if request.method == 'GET':
            # 查询课程基本信息
            cursor.execute(
                "SELECT course_id, name, details FROM courses WHERE course_id = %s AND created_by = %s",
                (course_id, user_id)
            )
            course = cursor.fetchone()
            if not course:
                return jsonify({'error': '课程不存在或无权限访问'}), 404

            # 动态统计报名人数
            cursor.execute(
                "SELECT COUNT(*) as enrollment FROM enrollments WHERE course_id = %s",
                (course_id,)
            )
            enrollment = cursor.fetchone()['enrollment']

            # 查询内容，包括 id 字段
            cursor.execute(
                "SELECT id, tab, text, file_path FROM content WHERE course_id = %s",
                (course_id,)
            )
            contents = cursor.fetchall()

            course_data = {
                'course_id': course['course_id'],
                'name': course['name'],
                'details': course['details'],
                'enrollment': enrollment,
                'overview': next((c['text'] for c in contents if c['tab'] == 'overview'), None),
                'resources': [{'id': c['id'], 'description': c['text'], 'file_path': c['file_path']} for c in contents if c['tab'] == 'resources'],
                'discussion': [{'id': c['id'], 'text': c['text']} for c in contents if c['tab'] == 'discussion'],
                'tasks': [{'id': c['id'], 'description': c['text']} for c in contents if c['tab'] == 'tasks']
            }
            return jsonify({'course': course_data}), 200

        elif request.method == 'DELETE':
            cursor.execute(
                "SELECT COUNT(*) FROM courses WHERE course_id = %s AND created_by = %s",
                (course_id, user_id)
            )
            if cursor.fetchone()['COUNT(*)'] == 0:
                return jsonify({'error': '课程不存在或无权限删除'}), 404

            cursor.execute("DELETE FROM content WHERE course_id = %s", (course_id,))
            cursor.execute("DELETE FROM courses WHERE course_id = %s", (course_id,))
            conn.commit()
            return jsonify({'success': True}), 200

        elif request.method == 'PUT':
            data = request.get_json()
            course_name = data.get('courseName')
            course_details = data.get('courseDetails')

            if not course_name:
                return jsonify({'error': '课程名称是必填项'}), 400

            cursor.execute(
                "SELECT COUNT(*) FROM courses WHERE course_id = %s AND created_by = %s",
                (course_id, user_id)
            )
            if cursor.fetchone()['COUNT(*)'] == 0:
                return jsonify({'error': '课程不存在或无权限更新'}), 404

            cursor.execute(
                """
                UPDATE courses 
                SET name = %s, details = %s
                WHERE course_id = %s
                """,
                (course_name, course_details, course_id)
            )
            conn.commit()
            return jsonify({'message': '课程信息已保存'}), 200
    except mysql.connector.Error as e:
        conn.rollback()
        return jsonify({'error': f'数据库操作失败: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/student/courses', methods=['GET'])
@require_role('student')
def get_student_courses():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        # 查询所有非草稿课程，并判断学生是否已报名
        query = """
            SELECT 
                c.course_id, 
                c.name, 
                c.details, 
                c.deadline, 
                c.enrollment, 
                c.created_at, 
                c.status,
                CASE 
                    WHEN e.student_id IS NOT NULL THEN TRUE 
                    ELSE FALSE 
                END AS is_enrolled
            FROM courses c
            LEFT JOIN enrollments e ON c.course_id = e.course_id AND e.student_id = %s
            WHERE c.status IN ('ongoing', 'completed')
        """
        cursor.execute(query, (request.user['user_id'],))
        courses = cursor.fetchall()

        # 格式化时间字段
        for course in courses:
            if course['deadline']:
                course['deadline'] = course['deadline'].isoformat()
            course['created_at'] = course['created_at'].isoformat()

        return jsonify({'courses': courses}), 200
    except Error as e:
        return jsonify({'error': f'查询课程失败: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()


# 学生报名课程
@app.route('/api/student/courses/<course_id>/enroll', methods=['POST'])
@require_role('student')
def enroll_course(course_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor()
        # 检查课程是否存在且未完成
        cursor.execute("SELECT status FROM courses WHERE course_id = %s", (course_id,))
        course = cursor.fetchone()
        if not course:
            return jsonify({'error': '课程不存在'}), 404
        if course[0] == 'completed':
            return jsonify({'error': '无法报名已完成的课程'}), 400

        # 检查是否已报名（假设有一个 enrollment 表记录学生报名）
        cursor.execute("""
            SELECT COUNT(*) FROM enrollments WHERE course_id = %s AND student_id = %s
        """, (course_id, request.user['user_id']))
        if cursor.fetchone()[0] > 0:
            return jsonify({'error': '您已报名此课程'}), 400

        # 记录报名
        cursor.execute("""
            INSERT INTO enrollments (course_id, student_id)
            VALUES (%s, %s)
        """, (course_id, request.user['user_id']))

        # 更新课程的报名人数
        cursor.execute("""
            UPDATE courses SET enrollment = enrollment + 1 WHERE course_id = %s
        """, (course_id,))

        conn.commit()
        return jsonify({'success': True}), 200
    except Error as e:
        return jsonify({'error': f'报名失败: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()


# 查询课程的学生名单
@app.route('/api/teacher/courses/<course_id>/students', methods=['GET'])
@require_role('teacher')
def get_course_students(course_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        # 检查课程是否属于当前教师
        cursor.execute(
            "SELECT COUNT(*) as count FROM courses WHERE course_id = %s AND created_by = %s",
            (course_id, request.user['user_id'])
        )
        result = cursor.fetchone()
        if not result or result['count'] == 0:
            return jsonify({'error': '课程不存在或无权限查看'}), 404

        # 获取已报名学生
        query = """
            SELECT u.id, u.full_name, u.username
            FROM users u
            JOIN enrollments e ON u.id = e.student_id
            WHERE e.course_id = %s
        """
        cursor.execute(query, (course_id,))
        students = cursor.fetchall()

        return jsonify({'students': students}), 200
    except Error as e:
        return jsonify({'error': f'查询学生失败: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()


# 删除学生报名
@app.route('/api/teacher/courses/<course_id>/students/<student_id>', methods=['DELETE'])
@require_role('teacher')
def delete_course_student(course_id, student_id):
    conn = get_db_connection()
    if not conn:
        logger.error("数据库连接失败")
        return jsonify({'error': '数据库连接失败'}), 500

    cursor = None
    try:
        user_id = request.user['user_id']
        cursor = conn.cursor()
        logger.debug(f"删除学生: course_id={course_id}, student_id={student_id}, user_id={user_id}")

        # 检查课程是否存在且属于当前教师
        cursor.execute(
            "SELECT COUNT(*) FROM courses WHERE course_id = %s AND created_by = %s",
            (course_id, user_id)
        )
        if cursor.fetchone()[0] == 0:
            logger.info(f"课程 {course_id} 不存在或用户 {user_id} 无权限")
            return jsonify({'error': '课程不存在或无权限操作'}), 404

        # 检查学生是否已报名
        cursor.execute(
            "SELECT COUNT(*) FROM enrollments WHERE course_id = %s AND student_id = %s",
            (course_id, student_id)
        )
        if cursor.fetchone()[0] == 0:
            logger.info(f"学生 {student_id} 未报名课程 {course_id}")
            return jsonify({'error': '该学生未报名此课程'}), 404

        # 删除报名记录并更新人数
        cursor.execute(
            "DELETE FROM enrollments WHERE course_id = %s AND student_id = %s",
            (course_id, student_id)
        )
        cursor.execute(
            "UPDATE courses SET enrollment = GREATEST(0, enrollment - 1) WHERE course_id = %s",
            (course_id,)
        )
        conn.commit()
        logger.info(f"学生 {student_id} 已从课程 {course_id} 中移除")
        return jsonify({'success': True}), 200

    except Error as e:
        logger.error(f"数据库错误: {str(e)}")
        return jsonify({'error': f'移除学生失败: {str(e)}'}), 500
    except Exception as e:
        logger.error(f"未预期的错误: {str(e)}", exc_info=True)
        return jsonify({'error': f'服务器内部错误: {str(e)}'}), 500
    finally:
        if cursor:
            cursor.close()
        conn.close()


@app.route('/api/student/courses/<course_id>', methods=['GET'])
@require_role('student')
def get_course_details(course_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        # 查询课程基本信息
        query = """
            SELECT course_id, name, details, deadline, created_at, status
            FROM courses WHERE course_id = %s
        """
        cursor.execute(query, (course_id,))
        course = cursor.fetchone()
        if not course:
            return jsonify({'error': '课程不存在'}), 404

        # 动态统计报名人数
        cursor.execute(
            "SELECT COUNT(*) as enrollment FROM enrollments WHERE course_id = %s",
            (course_id,)
        )
        enrollment = cursor.fetchone()['enrollment']

        # 查询课程内容
        content_query = "SELECT id, tab, text, file_path FROM content WHERE course_id = %s"
        cursor.execute(content_query, (course_id,))
        contents = cursor.fetchall()

        course_data = {
            'course_id': course['course_id'],
            'name': course['name'],
            'details': course['details'],
            'deadline': course['deadline'].isoformat() if course['deadline'] else None,
            'enrollment': enrollment,  # 使用动态统计的值
            'created_at': course['created_at'].isoformat(),
            'status': course['status'],
            'overview': next((c['text'] for c in contents if c['tab'] == 'overview'), None),
            'resources': [
                {
                    'description': c['text'],
                    'url': f"/api/resources/download/{c['id']}" if c['file_path'] else '#'
                } for c in contents if c['tab'] == 'resources'
            ],
            'discussion': [{'text': c['text']} for c in contents if c['tab'] == 'discussion'],
            'tasks': [
                {
                    'description': c['text'],
                    'deadline': course['deadline'].isoformat() if course['deadline'] else None
                } for c in contents if c['tab'] == 'tasks'
            ]
        }
        return jsonify({'course': course_data}), 200
    except Error as e:
        return jsonify({'error': f'查询课程失败: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()


client = OpenAI(
    api_key="",  # 替换为你的实际密钥
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)

# 聊天路由
@app.route('/api/chat/<course_id>', methods=['POST'])
@require_role('student')
def chat(course_id):
    # 获取消息和分节 ID，进行初步检查
    data = request.get_json()
    message = data.get('message')
    session_id = data.get('sessionId')

    if not message:
        logger.warning("消息为空")
        return jsonify({'error': '消息不能为空'}), 400
    if len(message) > 200:
        logger.warning(f"消息长度超过限制: {len(message)}")
        return jsonify({'error': '消息长度不能超过200字符'}), 400

    # 数据库连接
    conn = get_db_connection()
    if not conn:
        logger.error("数据库连接失败")
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor(dictionary=True)

        # 检查课程和分节是否存在
        cursor.execute("SELECT COUNT(*) as count FROM courses WHERE course_id = %s", (course_id,))
        if cursor.fetchone()['count'] == 0:
            logger.warning(f"课程不存在: {course_id}")
            return jsonify({'error': '课程不存在'}), 404

        if session_id:
            cursor.execute(
                "SELECT title, key_points, difficulties FROM course_sessions WHERE id = %s AND course_id = %s",
                (session_id, course_id))
            session_data = cursor.fetchone()
            if not session_data:
                logger.warning(f"分节不存在: session_id={session_id}, course_id={course_id}")
                return jsonify({'error': '分节不存在'}), 404
        else:
            session_data = None

        # 保存学生问题到 chat_messages 表
        query = """
            INSERT INTO chat_messages (course_id, message, is_ai_response, user_id, session_id)
            VALUES (%s, %s, %s, %s, %s)
        """
        cursor.execute(query, (course_id, message, False, request.user['user_id'], session_id if session_id else None))
        conn.commit()

        # 获取课程详情作为上下文
        course_query = """
            SELECT name, details, deadline, enrollment,
                   (SELECT text FROM content WHERE course_id = %s AND tab = 'overview') AS overview,
                   (SELECT text FROM content WHERE course_id = %s AND tab = 'resources') AS resources,
                   (SELECT text FROM content WHERE course_id = %s AND tab = 'discussion') AS discussion,
                   (SELECT text FROM content WHERE course_id = %s AND tab = 'tasks') AS tasks
            FROM courses
            WHERE course_id = %s
        """
        cursor.execute(course_query, (course_id, course_id, course_id, course_id, course_id))
        course = cursor.fetchone()

        # 构造系统提示
        system_prompt = f"""
        你是一个课程助手，帮助学生解答关于课程 {course_id} 的问题。以下是课程详情：
        - 课程名称: {course['name']}
        - 详情: {course['details'] or '暂无'}
        - 截止日期: {course['deadline'] or '未设置'}
        - 报名人数: {course['enrollment'] or 0}
        - 课程内容: {course['overview'] or '暂无'}
        - 学习资源: {course['resources'] or '暂无'}
        - 班级讨论: {course['discussion'] or '暂无'}
        - 课程任务: {course['tasks'] or '暂无'}
        """
        if session_data:
            system_prompt += f"""
            当前问题与分节相关：
            - 分节标题: {session_data['title']}
            - 重点: {session_data['key_points'] or '暂无'}
            - 难点: {session_data['difficulties'] or '暂无'}
            请优先根据分节内容回答。
            """

        # 获取 AI 回复（假设 client 已定义）
        completion = client.chat.completions.create(
            model="qwen-plus",
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': message}
            ]
        )
        response = completion.choices[0].message.content

        # 保存 AI 回复
        cursor.execute(query, (course_id, response, True, None, session_id if session_id else None))
        conn.commit()

        logger.info(f"聊天记录保存成功: course_id={course_id}, session_id={session_id}")
        return jsonify({'response': response}), 200

    except mysql.connector.Error as db_error:
        conn.rollback()
        logger.error(f"数据库错误: {str(db_error)}")
        return jsonify({'error': f'数据库错误: {str(db_error)}'}), 500
    except Exception as e:
        conn.rollback()
        logger.error(f"AI 服务错误: {str(e)}", exc_info=True)
        return jsonify({'error': f'AI 服务错误: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()



# 总结接口：AI 分析学生问题
@app.route('/api/chat/<course_id>/summarize', methods=['POST'])
@require_role('teacher')
def summarize_chat(course_id):
    user_id = request.user['user_id']

    conn = get_db_connection()
    if not conn:
        logger.error("数据库连接失败")
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor(dictionary=True)

        if not request.is_json:
            logger.warning(f"无效的 Content-Type: {request.content_type}, 请求体: {request.data}")
            return jsonify({'error': 'Content-Type 必须是 application/json'}), 400

        data = request.get_json(silent=True)
        if data is None:  # 仅当 data 为 None 时表示 JSON 解析失败
            logger.warning(f"无效的 JSON 请求体: {request.data}")
            return jsonify({'error': '请求体为空或不是有效的 JSON'}), 400

        session_id = data.get('sessionId')

        cursor.execute(
            "SELECT COUNT(*) as count FROM courses WHERE course_id = %s AND created_by = %s",
            (course_id, user_id)
        )
        if cursor.fetchone()['count'] == 0:
            logger.warning(f"课程不存在或无权限: course_id={course_id}")
            return jsonify({'error': '课程不存在或无权限'}), 404

        if session_id:
            cursor.execute(
                "SELECT title FROM course_sessions WHERE id = %s AND course_id = %s",
                (session_id, course_id)
            )
            session_data = cursor.fetchone()
            if not session_data:
                logger.warning(f"分节不存在: session_id={session_id}, course_id={course_id}")
                return jsonify({'error': '分节不存在'}), 404

            query = """
                SELECT message
                FROM chat_messages
                WHERE course_id = %s AND is_ai_response = FALSE AND session_id = %s
                ORDER BY created_at ASC
            """
            cursor.execute(query, (course_id, session_id))
            title = session_data['title']
        else:
            query = """
                SELECT message
                FROM chat_messages
                WHERE course_id = %s AND is_ai_response = FALSE
                ORDER BY created_at ASC
            """
            cursor.execute(query, (course_id,))
            title = "全课程"

        questions = cursor.fetchall()

        if not questions:
            logger.info(f"暂无学生问题可总结: course_id={course_id}, session_id={session_id}")
            return jsonify({'summary': f'{title}暂无学生问题可总结'}), 200

        question_list = "\n".join([q['message'] for q in questions])

        summary_prompt = f"""
        你是一个教育分析助手，请分析以下学生关于课程 {course_id} 的问题，总结出他们的常见疑问或知识薄弱点：
        分节/范围: {title}
        问题列表:
        {question_list}
        请提供简洁的总结，突出关键问题。
        """

        completion = client.chat.completions.create(
            model="qwen-plus",
            messages=[
                {'role': 'system', 'content': summary_prompt},
                {'role': 'user', 'content': '请总结学生的问题'}
            ]
        )
        summary = completion.choices[0].message.content

        insert_query = """
            INSERT INTO chat_summaries (course_id, summary, session_id)
            VALUES (%s, %s, %s)
        """
        cursor.execute(insert_query, (course_id, summary, session_id if session_id else None))
        conn.commit()

        logger.info(f"生成总结成功: course_id={course_id}, session_id={session_id}")
        return jsonify({'summary': summary}), 200

    except mysql.connector.Error as e:
        conn.rollback()
        logger.error(f"数据库错误: {str(e)}")
        return jsonify({'error': f'数据库错误: {str(e)}'}), 500
    except Exception as e:
        conn.rollback()
        logger.error(f"总结失败: {str(e)}", exc_info=True)
        return jsonify({'error': f'总结失败: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()


# 获取总结接口：老师查看总结
@app.route('/api/chat/<course_id>/summaries', methods=['GET'])
@require_role('teacher')  # 使用已定义的权限装饰器，确保仅教师可访问
def get_chat_summaries(course_id):
    # 权限已由 @require_role('teacher') 装饰器验证，无需再次检查 session

    conn = get_db_connection()
    if not conn:
        logger.error("数据库连接失败")
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        # 修改查询以联合 chat_summaries 和 course_sessions 表
        query = """
            SELECT 
                cs.id, 
                cs.summary, 
                cs.created_at, 
                cs.session_id, 
                IFNULL(s.session_number, '全课程') AS session_number,
                IFNULL(s.title, '全课程总结') AS session_title
            FROM chat_summaries cs
            LEFT JOIN course_sessions s ON cs.session_id = s.id AND cs.course_id = s.course_id
            WHERE cs.course_id = %s
            ORDER BY cs.created_at DESC
        """
        cursor.execute(query, (course_id,))
        summaries = cursor.fetchall()

        # 格式化时间字段
        for summary in summaries:
            summary['created_at'] = summary['created_at'].isoformat()

        logger.debug(f"加载总结记录: course_id={course_id}, count={len(summaries)}")
        return jsonify({'summaries': summaries}), 200

    except mysql.connector.Error as e:
        logger.error(f"数据库错误: {str(e)}")
        return jsonify({'error': f'获取总结失败: {str(e)}'}), 500
    except Exception as e:
        logger.error(f"未预期的错误: {str(e)}", exc_info=True)
        return jsonify({'error': f'获取总结失败: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()

# 获取历史记录
@app.route('/api/chat/<course_id>/history', methods=['GET'])
def get_chat_history(course_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            'SELECT * FROM chat_summaries WHERE course_id = %s ORDER BY created_at DESC',
            (course_id,)
        )
        history = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify({'history': history}), 200
    except Exception as e:
        return jsonify({'error': f'获取历史记录失败: {str(e)}'}), 500


# 删除记录（物理删除）
@app.route('/api/chat/summary/<int:id>', methods=['DELETE'])
def delete_chat_summary(id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            'DELETE FROM chat_summaries WHERE id = %s',
            (id,)
        )
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({'message': '删除成功'}), 200
    except Exception as e:
        return jsonify({'error': f'删除失败: {str(e)}'}), 500


# 新增：獲取課程分節
@app.route('/api/student/courses/<course_id>/sessions', methods=['GET'])
@require_role('student')
def get_course_sessions(course_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': '數據庫連接失敗'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        # 檢查課程是否存在
        cursor.execute("SELECT COUNT(*) FROM courses WHERE course_id = %s", (course_id,))
        if cursor.fetchone()['COUNT(*)'] == 0:
            return jsonify({'error': '課程不存在'}), 404

        # 查詢分節
        cursor.execute("""
            SELECT id, session_number, title
            FROM course_sessions
            WHERE course_id = %s
            ORDER BY session_number ASC
        """, (course_id,))
        sessions = cursor.fetchall()

        return jsonify({'sessions': sessions}), 200
    except Error as e:
        return jsonify({'error': f'查詢課程分節失敗: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/teacher/courses/<course_id>/sessions', methods=['POST'])
@require_role('teacher')
def add_course_session(course_id):
    data = request.get_json()
    session_number = data.get('sessionNumber')
    session_title = data.get('sessionTitle')
    key_points = data.get('keyPoints')
    difficulties = data.get('difficulties')
    keywords = data.get('keywords')

    if not all([session_number, session_title, key_points, difficulties, keywords]):
        return jsonify({'error': '所有字段均为必填'}), 400

    # 从 JWT token 中获取 user_id
    user_id = request.user['user_id']  # 通过 @require_role 装饰器附加到 request.user 中

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO course_sessions (course_id, session_number, title, key_points, difficulties, keywords, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (course_id, session_number, session_title, key_points, difficulties, keywords, user_id))
        conn.commit()
        return jsonify({'message': '分节已添加'}), 201
    except mysql.connector.IntegrityError as e:
        conn.rollback()
        return jsonify({'error': f'分节编号重复或数据无效: {str(e)}'}), 400
    except Error as e:
        conn.rollback()
        return jsonify({'error': f'添加分节失败: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/teacher/courses/<course_id>/sessions/<int:session_id>', methods=['GET', 'PUT', 'DELETE'])
@require_role('teacher')
def manage_course_session(course_id, session_id):
    logger.debug(
        f"处理分节请求: method={request.method}, course_id={course_id}, session_id={session_id}, user_id={request.user.get('user_id')}"
    )

    conn = get_db_connection()
    if not conn:
        logger.error("数据库连接失败")
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        user_id = request.user['user_id']  # 从 JWT token 中获取 user_id

        if request.method == 'GET':
            # 现有 GET 方法逻辑
            cursor.execute("""
                SELECT id, session_number, title, key_points, difficulties, keywords
                FROM course_sessions
                WHERE id = %s AND course_id = %s AND created_by = %s
            """, (session_id, course_id, user_id))
            session_data = cursor.fetchone()
            if not session_data:
                logger.warning(f"分节不存在或无权限: session_id={session_id}, course_id={course_id}")
                return jsonify({'error': '分节不存在或无权限'}), 404
            logger.debug(f"分节详情: {session_data}")
            return jsonify({'session': session_data}), 200

        elif request.method == 'PUT':
            # 现有 PUT 方法逻辑
            data = request.get_json()
            session_number = data.get('sessionNumber')
            session_title = data.get('sessionTitle')
            key_points = data.get('keyPoints')
            difficulties = data.get('difficulties')
            keywords = data.get('keywords')

            if not all([session_number, session_title, key_points, difficulties, keywords]):
                logger.warning("缺少必填字段")
                return jsonify({'error': '所有字段均为必填'}), 400

            cursor.execute("""
                UPDATE course_sessions
                SET session_number = %s, title = %s, key_points = %s, difficulties = %s, keywords = %s
                WHERE id = %s AND course_id = %s AND created_by = %s
            """, (session_number, session_title, key_points, difficulties, keywords, session_id, course_id, user_id))
            if cursor.rowcount == 0:
                logger.warning(f"分节不存在或无权限: session_id={session_id}, course_id={course_id}")
                return jsonify({'error': '分节不存在或无权限'}), 404
            conn.commit()
            logger.debug("分节更新成功")
            return jsonify({'message': '分节已更新'}), 200

        elif request.method == 'DELETE':
            # DELETE 方法逻辑（已存在）
            # 检查分节是否存在且用户有权限
            cursor.execute("""
                SELECT COUNT(*) as count
                FROM course_sessions
                WHERE id = %s AND course_id = %s AND created_by = %s
            """, (session_id, course_id, user_id))
            result = cursor.fetchone()
            if result['count'] == 0:
                logger.warning(f"分节不存在或无权限: session_id={session_id}, course_id={course_id}")
                return jsonify({'error': '分节不存在或无权限删除'}), 404

            # 执行删除操作
            cursor.execute("""
                DELETE FROM course_sessions
                WHERE id = %s AND course_id = %s AND created_by = %s
            """, (session_id, course_id, user_id))
            conn.commit()
            logger.info(f"分节删除成功: session_id={session_id}, course_id={course_id}")
            return jsonify({'message': '分节已删除'}), 200

    except mysql.connector.IntegrityError as e:
        conn.rollback()
        logger.error(f"数据库完整性错误: {str(e)}")
        return jsonify({'error': f'操作失败: {str(e)}'}), 400
    except Error as e:
        conn.rollback()
        logger.error(f"数据库错误: {str(e)}")
        return jsonify({'error': f'操作失败: {str(e)}'}), 500
    except Exception as e:
        conn.rollback()
        logger.error(f"未预期的错误: {str(e)}", exc_info=True)
        return jsonify({'error': f'服务器内部错误: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()


# 将原有的 GET 和 PUT 路由替换为这个新路由，原有代码如下：
# @app.route('/api/teacher/courses/<course_id>/sessions/<int:session_id>', methods=['GET'])
# @app.route('/api/teacher/courses/<course_id>/sessions/<int:session_id>', methods=['PUT'])


@app.route('/api/teacher/courses/<course_id>/sessions', methods=['GET'])
@require_role('teacher')
def get_teacher_course_sessions(course_id):
    logger.debug(f"获取课程分节: course_id={course_id}, user_id={request.user.get('user_id')}")

    conn = get_db_connection()
    if not conn:
        logger.error("数据库连接失败")
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        user_id = request.user['user_id']  # 从 JWT token 中获取 user_id
        cursor.execute("""
            SELECT id, session_number, title, key_points, difficulties, keywords
            FROM course_sessions
            WHERE course_id = %s AND created_by = %s
            ORDER BY session_number ASC
        """, (course_id, user_id))
        sessions = cursor.fetchall()
        logger.debug(f"找到 {len(sessions)} 个分节")
        return jsonify({'sessions': sessions}), 200
    except Error as e:
        logger.error(f"查询分节失败: {str(e)}")
        return jsonify({'error': f'查询分节失败: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()


@app.route('/api/upload/<course_id>', methods=['POST'])
def upload_resource(course_id):
    token = request.headers.get('Authorization')
    if not token or not token.startswith('Bearer '):
        return jsonify({'error': '缺少 token'}), 401

    try:
        token = token.split(' ')[1]
        data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        user_id = data['user_id']
        role = data['role']
    except jwt.ExpiredSignatureError:
        return jsonify({'error': 'Token 已过期'}), 401
    except jwt.InvalidTokenError:
        return jsonify({'error': '无效的 Token'}), 401

    if role != 'teacher':
        return jsonify({'error': '无权限上传资源'}), 403

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT COUNT(*) as count FROM courses WHERE course_id = %s AND created_by = %s", (course_id, user_id))
        if cursor.fetchone()['count'] == 0:
            return jsonify({'error': '无权限上传到此课程'}), 403

        if 'resourceFiles' not in request.files:
            return jsonify({'error': '未提供文件'}), 400

        files = request.files.getlist('resourceFiles')
        for file in files:
            if file.filename == '':
                continue
            filename = secure_filename(file.filename)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(file_path)

            # 保存到数据库，使用 text 列代替 description
            cursor.execute("""
                INSERT INTO content (course_id, tab, file_path, text, uploaded_by)
                VALUES (%s, 'resources', %s, %s, %s)
            """, (course_id, file_path, f"资源: {filename}", user_id))
        conn.commit()

        return jsonify({'message': '文件上传成功'}), 200
    except mysql.connector.Error as e:
        conn.rollback()
        return jsonify({'error': f'数据库操作失败: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()

# 确保导入和配置正确
from werkzeug.utils import secure_filename


@app.route('/api/check-auth', methods=['GET'])
def check_auth():
    token = request.headers.get('Authorization')
    if not token:
        logger.warning("用户未登录")
        return jsonify({'error': '未登录'}), 401

    try:
        if token.startswith('Bearer '):
            token = token.split(' ')[1]
        data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        user_id = data['user_id']
        role = data['role']
        logger.debug(f"用户已登录: user_id={user_id}, role={role}")
        return jsonify({'message': '已登录', 'role': role}), 200
    except jwt.ExpiredSignatureError:
        logger.warning("Token 已过期")
        return jsonify({'error': 'Token 已过期，请重新登录'}), 401
    except jwt.InvalidTokenError:
        logger.warning("无效的 Token")
        return jsonify({'error': '无效的 Token'}), 401


@app.route('/api/content/resources/<course_id>/<content_id>', methods=['DELETE'])
def delete_resource(course_id, content_id):
    # 提取和验证 token
    token = request.headers.get('Authorization')
    if not token or not token.startswith('Bearer '):
        logger.warning(f"缺少 token: course_id={course_id}, content_id={content_id}")
        return jsonify({'error': '缺少 token'}), 401

    try:
        token = token.split(' ')[1]
        data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        user_id = data['user_id']
        role = data['role']
        logger.info(f"用户认证成功: user_id={user_id}, role={role}")
    except jwt.ExpiredSignatureError:
        logger.warning("Token 已过期")
        return jsonify({'error': 'Token 已过期'}), 401
    except jwt.InvalidTokenError:
        logger.warning("无效的 Token")
        return jsonify({'error': '无效的 Token'}), 401

    # 仅教师有权限删除
    if role != 'teacher':
        logger.warning(f"无权限删除资源: user_id={user_id}, role={role}")
        return jsonify({'error': '无权限删除资源'}), 403

    # 连接数据库
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        # 检查资源是否存在
        cursor.execute("""
            SELECT id, file_path, course_id
            FROM content
            WHERE id = %s AND course_id = %s AND tab = 'resources'
        """, (content_id, course_id))
        resource = cursor.fetchone()

        if not resource:
            logger.warning(f"资源不存在: course_id={course_id}, content_id={content_id}")
            return jsonify({'error': '资源不存在'}), 404

        # 检查用户是否有权限（必须是课程创建者）
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM courses
            WHERE course_id = %s AND created_by = %s
        """, (course_id, user_id))
        if cursor.fetchone()['count'] == 0:
            logger.warning(f"无权限删除此资源: course_id={course_id}, user_id={user_id}")
            return jsonify({'error': '无权限删除此资源'}), 403

        # 删除资源记录
        cursor.execute("DELETE FROM content WHERE id = %s", (content_id,))
        conn.commit()
        logger.info(f"资源记录已删除: content_id={content_id}")

        # 删除物理文件（如果存在）
        file_path = resource['file_path']
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
                logger.info(f"物理文件已删除: file_path={file_path}")
            except OSError as e:
                logger.error(f"删除物理文件失败: file_path={file_path}, 错误: {str(e)}")

        return jsonify({'message': '资源已删除'}), 200

    except mysql.connector.Error as e:
        conn.rollback()
        logger.error(f"数据库操作失败: {str(e)}")
        return jsonify({'error': f'数据库操作失败: {str(e)}'}), 500
    except Exception as e:
        logger.error(f"删除资源失败: {str(e)}", exc_info=True)
        return jsonify({'error': f'删除资源失败: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()

# 全局错误处理器，确保始终返回 JSON
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': '请求的资源未找到'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': '服务器内部错误'}), 500

@app.route('/api/resources/download/<int:content_id>', methods=['GET'])
def download_resource(content_id):
    """
    下载课程资源的端点
    需要登录验证，仅允许学生或教师下载
    """
    token = request.headers.get('Authorization')
    if not token:
        logger.warning("未登录用户尝试下载资源")
        return jsonify({'error': '请先登录'}), 401

    try:
        if token.startswith('Bearer '):
            token = token.split(' ')[1]
        data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        user_id = data['user_id']
        role = data['role']
    except jwt.ExpiredSignatureError:
        logger.warning("Token 已过期")
        return jsonify({'error': 'Token 已过期，请重新登录'}), 401
    except jwt.InvalidTokenError:
        logger.warning("无效的 Token")
        return jsonify({'error': '无效的 Token'}), 401

    conn = get_db_connection()
    if not conn:
        logger.error("数据库连接失败")
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor(dictionary=True)
        # 查询资源信息
        cursor.execute("""
            SELECT file_path, course_id
            FROM content
            WHERE id = %s AND tab = 'resources'
        """, (content_id,))
        resource = cursor.fetchone()

        if not resource:
            logger.warning(f"资源不存在: content_id={content_id}")
            return jsonify({'error': '资源不存在'}), 404

        # 检查用户是否有权限（学生已报名或教师创建）
        course_id = resource['course_id']

        if role == 'teacher':
            cursor.execute("""
                SELECT COUNT(*) as count
                FROM courses
                WHERE course_id = %s AND created_by = %s
            """, (course_id, user_id))
            if cursor.fetchone()['count'] == 0:
                logger.warning(f"教师无权限下载: course_id={course_id}, user_id={user_id}")
                return jsonify({'error': '无权限下载此资源'}), 403
        elif role == 'student':
            cursor.execute("""
                SELECT COUNT(*) as count
                FROM enrollments
                WHERE course_id = %s AND student_id = %s
            """, (course_id, user_id))
            if cursor.fetchone()['count'] == 0:
                logger.warning(f"学生未报名课程: course_id={course_id}, user_id={user_id}")
                return jsonify({'error': '未报名此课程，无权限下载'}), 403
        else:
            return jsonify({'error': '无效的用户角色'}), 403

        # 获取文件路径并发送文件
        file_path = resource['file_path']
        if not file_path or not os.path.exists(file_path):
            logger.error(f"文件不存在: file_path={file_path}")
            return jsonify({'error': '文件不存在'}), 404

        # 使用 send_from_directory 发送文件
        directory = os.path.dirname(file_path)
        filename = os.path.basename(file_path)
        logger.info(f"资源下载成功: content_id={content_id}, file={filename}")
        return send_from_directory(directory, filename, as_attachment=True)

    except mysql.connector.Error as e:
        logger.error(f"数据库错误: {str(e)}")
        return jsonify({'error': f'数据库操作失败: {str(e)}'}), 500
    except Exception as e:
        logger.error(f"下载失败: {str(e)}", exc_info=True)
        return jsonify({'error': f'下载失败: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/teacher/courses/<course_id>/complete', methods=['PUT'])
@require_role('teacher')
def complete_course(course_id):
    """
    将指定课程标记为已完成
    需要教师权限，仅限课程创建者操作
    """
    user_id = request.user['user_id']  # 从 JWT token 中获取 user_id

    conn = get_db_connection()
    if not conn:
        logger.error("数据库连接失败")
        return jsonify({'error': '数据库连接失败'}), 500

    try:
        cursor = conn.cursor(dictionary=True)

        # 检查课程是否存在且用户有权限
        cursor.execute(
            "SELECT status, created_by FROM courses WHERE course_id = %s AND created_by = %s",
            (course_id, user_id)
        )
        course = cursor.fetchone()
        if not course:
            logger.info(f"课程 {course_id} 不存在或用户 {user_id} 无权限")
            return jsonify({'error': '课程不存在或无权限操作'}), 404

        # 检查课程是否已经完成
        if course['status'] == 'completed':
            logger.info(f"课程 {course_id} 已是完成状态")
            return jsonify({'error': '课程已是完成状态'}), 400

        # 更新课程状态为 'completed'
        cursor.execute(
            "UPDATE courses SET status = 'completed' WHERE course_id = %s",
            (course_id,)
        )
        conn.commit()
        logger.info(f"课程 {course_id} 已标记为已完成")
        return jsonify({'message': '课程已标记为已完成'}), 200

    except mysql.connector.Error as e:
        conn.rollback()
        logger.error(f"数据库错误: {str(e)}")
        return jsonify({'error': f'数据库操作失败: {str(e)}'}), 500
    except Exception as e:
        conn.rollback()
        logger.error(f"未预期的错误: {str(e)}", exc_info=True)
        return jsonify({'error': f'服务器内部错误: {str(e)}'}), 500
    finally:
        cursor.close()
        conn.close()



#定时清理
def clean_old_messages():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM chat_messages WHERE created_at < NOW() - INTERVAL 30 DAY")
        conn.commit()
        print(f"Deleted {cursor.rowcount} old messages")
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"清理旧消息失败: {e}")


# 设置定时任务，每天凌晨执行
scheduler = BackgroundScheduler()
scheduler.add_job(clean_old_messages, 'cron', hour=0, minute=0)
scheduler.start()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
