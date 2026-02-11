# Requirements Document: 财神变身 (Caishen Video Mode)

## Introduction

财神变身是一个新的AI视频生成功能，允许用户上传一张人物照片，系统将调用即梦AI的API，生成一段财神发钱的喜庆视频，并将财神的脸替换成用户上传的人物照片。该功能完全复用现有项目的架构、流程和功能模块（使用次数限制、付费系统、水印系统、历史记录、邀请系统等）。

## Glossary

- **System**: 财神变身功能模块（包括小程序前端和后端服务）
- **User**: 使用小程序的终端用户
- **AI_Service**: 火山引擎（即梦AI）视频生成服务
- **OSS**: 阿里云对象存储服务
- **Video_Template**: 财神发钱的视频模板
- **Face_Swap**: 人脸替换技术，将用户照片中的人脸替换到视频中的财神脸上
- **Watermark**: 水印，免费用户生成的视频需添加水印
- **Generation_History**: 用户的生成历史记录
- **Balance_Service**: 使用次数管理服务
- **Payment_Service**: 微信支付服务
- **Admin_Panel**: 管理后台

## Requirements

### Requirement 1: 用户照片上传

**User Story:** 作为用户，我想上传一张人物照片，以便生成财神变身视频

#### Acceptance Criteria

1. WHEN 用户进入财神变身上传页面 THEN THE System SHALL 显示单个图片上传框
2. WHEN 用户点击上传框 THEN THE System SHALL 调用微信选择图片API，限制只能选择1张照片
3. WHEN 用户选择照片后 THEN THE System SHALL 验证照片是否包含人脸
4. IF 照片不包含人脸 THEN THE System SHALL 显示错误提示"请上传包含人脸的照片"
5. IF 照片包含多个人脸 THEN THE System SHALL 显示错误提示"请上传单人照片"
6. WHEN 照片验证通过 THEN THE System SHALL 显示照片预览和"开始生成"按钮
7. WHEN 用户点击删除按钮 THEN THE System SHALL 清除已上传的照片

### Requirement 2: 使用次数检查

**User Story:** 作为系统，我需要在生成前检查用户的使用次数，以便控制免费和付费用户的使用权限

#### Acceptance Criteria

1. WHEN 用户首次点击上传框 THEN THE System SHALL 检查用户是否已登录
2. IF 用户未登录 THEN THE System SHALL 触发微信登录流程
3. WHEN 用户登录成功 THEN THE System SHALL 调用后端API检查使用次数
4. IF 用户使用次数为0 THEN THE System SHALL 显示套餐选择弹窗
5. WHEN 用户使用次数大于0 THEN THE System SHALL 允许用户继续上传照片
6. WHEN 用户在套餐选择弹窗中完成支付 THEN THE System SHALL 刷新使用次数并允许继续操作

### Requirement 3: 模板选择

**User Story:** 作为用户，我想选择不同的财神视频模板，以便生成不同风格的视频

#### Acceptance Criteria

1. WHEN 用户上传照片后点击"下一步" THEN THE System SHALL 跳转到模板选择页面
2. WHEN 模板选择页面加载 THEN THE System SHALL 从后端API获取财神模板列表
3. WHEN 后端API返回模板列表 THEN THE System SHALL 显示所有可用模板（包括缩略图、名称、描述）
4. WHEN 用户点击某个模板 THEN THE System SHALL 高亮选中该模板并显示选中状态
5. WHEN 用户点击"开始生成"按钮 THEN THE System SHALL 验证是否已选择模板
6. IF 用户未选择模板 THEN THE System SHALL 显示提示"请先选择模板"
7. WHEN 用户选择模板后点击"开始生成" THEN THE System SHALL 跳转到生成中页面

### Requirement 4: 视频生成

**User Story:** 作为系统，我需要调用AI服务生成财神变身视频，以便为用户提供个性化的视频内容

#### Acceptance Criteria

1. WHEN 用户点击"开始生成" THEN THE System SHALL 上传用户照片到OSS
2. WHEN 照片上传成功 THEN THE System SHALL 调用后端生成API，传递照片URL、模板ID和用户ID
3. WHEN 后端收到生成请求 THEN THE System SHALL 验证用户使用次数是否充足
4. IF 使用次数不足 THEN THE System SHALL 返回错误"余额不足"
5. WHEN 使用次数充足 THEN THE System SHALL 扣减用户使用次数（优先扣减免费次数，再扣减付费次数）
6. WHEN 扣减成功 THEN THE System SHALL 调用火山引擎视频生成API
7. WHEN 火山引擎API返回任务ID THEN THE System SHALL 保存生成记录到数据库（包括用户ID、任务ID、照片URL、模板ID、状态、模式）
8. WHEN 生成记录保存成功 THEN THE System SHALL 返回任务ID给前端

### Requirement 5: 生成进度轮询

**User Story:** 作为用户，我想看到视频生成的实时进度，以便了解生成状态

#### Acceptance Criteria

1. WHEN 生成中页面加载 THEN THE System SHALL 显示初始进度（0%）和状态文本"任务已创建"
2. WHEN 页面加载完成 THEN THE System SHALL 每2秒调用一次后端任务状态API
3. WHEN 后端返回任务进度 THEN THE System SHALL 更新进度条和状态文本
4. WHEN 任务状态为"processing" THEN THE System SHALL 继续轮询
5. WHEN 任务状态为"completed" THEN THE System SHALL 停止轮询并跳转到结果页面
6. WHEN 任务状态为"failed" THEN THE System SHALL 停止轮询并显示错误信息
7. WHEN 用户离开页面 THEN THE System SHALL 停止轮询

### Requirement 6: 视频结果展示

**User Story:** 作为用户，我想查看生成的财神变身视频，以便保存、分享或重新生成

#### Acceptance Criteria

1. WHEN 结果页面加载 THEN THE System SHALL 显示生成的视频（使用video组件）
2. WHEN 视频加载完成 THEN THE System SHALL 自动播放视频
3. WHEN 用户点击视频 THEN THE System SHALL 暂停或播放视频
4. WHEN 用户点击"保存视频"按钮 THEN THE System SHALL 检查用户付费状态
5. IF 用户从未付费 THEN THE System SHALL 显示套餐选择弹窗
6. IF 用户已付费 THEN THE System SHALL 下载视频并保存到相册
7. WHEN 用户点击"分享"按钮 THEN THE System SHALL 显示分享弹窗（包括分享给好友、分享到朋友圈）
8. WHEN 用户点击"重新生成"按钮 THEN THE System SHALL 返回上传页面

### Requirement 7: 水印处理

**User Story:** 作为系统，我需要为免费用户的视频添加水印，以便区分免费和付费用户

#### Acceptance Criteria

1. WHEN 后端生成视频完成 THEN THE System SHALL 检查用户付费状态
2. IF 用户从未付费 THEN THE System SHALL 调用水印服务为视频添加水印
3. WHEN 水印添加成功 THEN THE System SHALL 上传带水印的视频到OSS
4. IF 用户已付费 THEN THE System SHALL 直接上传原始视频到OSS（无水印）
5. WHEN 视频上传完成 THEN THE System SHALL 更新生成记录中的视频URL

### Requirement 8: 生成历史记录

**User Story:** 作为用户，我想查看我的生成历史，以便重新查看或分享之前生成的视频

#### Acceptance Criteria

1. WHEN 用户进入历史记录页面 THEN THE System SHALL 调用后端API获取用户的生成历史（mode='caishen'）
2. WHEN 后端返回历史记录 THEN THE System SHALL 显示历史记录列表（包括缩略图、生成时间、模板名称）
3. WHEN 用户点击某条历史记录 THEN THE System SHALL 跳转到结果页面并显示该视频
4. WHEN 用户下拉刷新 THEN THE System SHALL 重新加载历史记录
5. WHEN 用户滚动到底部 THEN THE System SHALL 加载更多历史记录（分页加载）

### Requirement 9: 付费功能集成

**User Story:** 作为用户，我想购买套餐以获得更多使用次数和无水印视频，以便更好地使用财神变身功能

#### Acceptance Criteria

1. WHEN 用户使用次数为0时点击生成 THEN THE System SHALL 显示套餐选择弹窗
2. WHEN 套餐选择弹窗显示 THEN THE System SHALL 展示所有可用套餐（基础包、尊享包）
3. WHEN 用户选择某个套餐 THEN THE System SHALL 调用微信支付API发起支付
4. WHEN 支付成功 THEN THE System SHALL 调用后端支付回调API
5. WHEN 后端收到支付回调 THEN THE System SHALL 增加用户使用次数并更新付费状态
6. WHEN 付费状态更新成功 THEN THE System SHALL 通知前端刷新使用次数
7. WHEN 前端收到刷新通知 THEN THE System SHALL 关闭套餐弹窗并允许用户继续生成

### Requirement 10: 邀请系统集成

**User Story:** 作为用户，我想邀请好友使用财神变身功能，以便获得额外的使用次数

#### Acceptance Criteria

1. WHEN 用户点击"邀请好友"按钮 THEN THE System SHALL 跳转到邀请页面
2. WHEN 邀请页面加载 THEN THE System SHALL 显示用户的邀请码和邀请链接
3. WHEN 用户点击"分享邀请"按钮 THEN THE System SHALL 调用微信分享API分享邀请链接
4. WHEN 新用户通过邀请链接注册 THEN THE System SHALL 记录邀请关系
5. WHEN 新用户首次生成成功 THEN THE System SHALL 为邀请人增加使用次数
6. WHEN 邀请人使用次数增加 THEN THE System SHALL 发送通知给邀请人

### Requirement 11: Admin管理后台

**User Story:** 作为管理员，我想在后台管理财神模板和查看生成统计，以便优化功能和监控使用情况

#### Acceptance Criteria

1. WHEN 管理员登录后台 THEN THE System SHALL 显示财神模板管理菜单
2. WHEN 管理员进入模板管理页面 THEN THE System SHALL 显示所有财神模板列表
3. WHEN 管理员点击"添加模板"按钮 THEN THE System SHALL 显示模板添加表单
4. WHEN 管理员填写模板信息并提交 THEN THE System SHALL 保存模板到数据库
5. WHEN 管理员点击"编辑"按钮 THEN THE System SHALL 显示模板编辑表单
6. WHEN 管理员点击"删除"按钮 THEN THE System SHALL 删除模板（需确认）
7. WHEN 管理员进入生成统计页面 THEN THE System SHALL 显示财神模式的生成统计（总生成数、成功率、用户数）

### Requirement 12: 错误处理

**User Story:** 作为系统，我需要优雅地处理各种错误情况，以便为用户提供良好的体验

#### Acceptance Criteria

1. WHEN AI服务调用失败 THEN THE System SHALL 记录错误日志并返回友好的错误提示
2. WHEN AI服务调用失败 THEN THE System SHALL 恢复用户已扣减的使用次数
3. WHEN 网络请求超时 THEN THE System SHALL 显示"网络超时，请重试"提示
4. WHEN OSS上传失败 THEN THE System SHALL 重试最多3次
5. IF OSS上传3次后仍失败 THEN THE System SHALL 返回错误并恢复使用次数
6. WHEN 数据库操作失败 THEN THE System SHALL 回滚事务并返回错误
7. WHEN 用户余额不足 THEN THE System SHALL 显示充值引导弹窗

### Requirement 13: 性能要求

**User Story:** 作为系统，我需要保证良好的性能，以便为用户提供流畅的体验

#### Acceptance Criteria

1. WHEN 用户上传照片 THEN THE System SHALL 在3秒内完成上传
2. WHEN 用户点击生成 THEN THE System SHALL 在2秒内返回任务ID
3. WHEN 视频生成完成 THEN THE System SHALL 在30秒内完成视频处理和上传
4. WHEN 用户查看历史记录 THEN THE System SHALL 在2秒内返回第一页数据
5. WHEN 用户播放视频 THEN THE System SHALL 在3秒内开始播放

### Requirement 14: 数据持久化

**User Story:** 作为系统，我需要持久化所有生成记录和用户数据，以便提供历史查询和数据分析

#### Acceptance Criteria

1. WHEN 用户开始生成 THEN THE System SHALL 在generation_history表中创建记录（status='pending'）
2. WHEN 生成完成 THEN THE System SHALL 更新记录状态为'completed'并保存视频URL
3. WHEN 生成失败 THEN THE System SHALL 更新记录状态为'failed'并保存错误信息
4. WHEN 用户使用次数变化 THEN THE System SHALL 在usage_logs表中记录变化
5. WHEN 用户付费 THEN THE System SHALL 在user_payments表中记录付费信息
6. WHEN 用户邀请好友 THEN THE System SHALL 在user_invites表中记录邀请关系
