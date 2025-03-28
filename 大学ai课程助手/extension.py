import cv2
import numpy as np
import matplotlib.pyplot as plt

# 读取图像
# MATLAB: a = imread('e:i lena.JPG')
# 注意：Python 中路径分隔符通常用正斜杠或双反斜杠，这里假设是 'e:/lena.JPG'
a = cv2.imread('e:/lena.JPG')  # OpenCV 读取的是 BGR 格式

# 转换为灰度图
# MATLAB: b = rgb2gray(a)
b = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)

# 获取图像尺寸
# MATLAB: [wid,hei] = size(b)
wid, hei = b.shape  # shape 返回 (高度, 宽度)

# 初始化减采样后的图像数组
# MATLAB: quartimg = zeros(wid/2+1, hei/2+1)
# 注意：Python 中索引从 0 开始，且数组大小需要是整数
quartimg = np.zeros((wid//2 + 1, hei//2 + 1), dtype=np.uint8)

# 4倍减采样
# MATLAB 的循环从 1 开始，步长为 2
i1 = 0  # Python 索引从 0 开始
j1 = 0
for i in range(0, wid, 2):  # 从 0 到 wid-1，步长为 2
    for j in range(0, hei, 2):  # 从 0 到 hei-1，步长为 2
        quartimg[i1, j1] = b[i, j]
        j1 = j1 + 1
    i1 = i1 + 1
    j1 = 0  # 重置 j1

# 显示图像
# MATLAB: figure; imshow(uint8(quartimg))
plt.figure()
plt.imshow(quartimg, cmap='gray')  # 使用灰度颜色图
plt.axis('off')  # 关闭坐标轴
plt.show()