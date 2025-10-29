import { CozeAPI } from '@coze/api';

// 从环境变量中获取配置
const COZE_API_TOKEN = import.meta.env.VITE_COZE_API_TOKEN as string;
const COZE_BASE_URL = import.meta.env.VITE_COZE_BASE_URL as string;
const COZE_BOT_ID = import.meta.env.VITE_COZE_BOT_ID as string;

// 创建Coze API客户端实例
const cozeClient = new CozeAPI({
  token: COZE_API_TOKEN,
  baseURL: COZE_BASE_URL,
});

/**
 * 调用Coze API生成艺术照
 * @param imageData Base64编码的图片数据或图片URL
 * @param userId 用户ID
 * @returns 生成的艺术照URL
 */
export const generateArtPhoto = async (imageData: string, userId: string = '123456789'): Promise<string> => {
  try {
    // 根据imageData是Base64还是URL来构造不同的参数
    const isBase64 = imageData.startsWith('data:image');
    const imageUrl = isBase64 ? '' : imageData;
    
    const res: any = await cozeClient.chat.create({
      bot_id: COZE_BOT_ID,
      user_id: userId,
      additional_messages: [
        {
          role: "user" as any,
          content: [
            {
              type: "image",
              file_url: imageUrl || undefined,
            } as any,
            {
              type: "text",
              text: "请将这张照片转换为艺术照风格"
            }
          ],
          content_type: "object_string"
        }
      ],
    });

    // 检查API调用是否成功
    if (res?.code !== 0) {
      throw new Error(res?.msg || 'API调用失败');
    }

    // 根据实际API响应结构调整
    // 这里需要根据Coze API的实际响应格式来处理
    // 暂时返回空字符串，需要根据实际响应结构调整
    return '';
  } catch (error) {
    console.error('Coze API调用失败:', error);
    throw new Error('艺术照生成失败，请稍后重试');
  }
};

/**
 * 流式调用Coze API生成艺术照
 * @param imageData Base64编码的图片数据或图片URL
 * @param userId 用户ID
 * @returns 流式响应
 */
export const streamGenerateArtPhoto = async (imageData: string, userId: string = '123456789') => {
  try {
    // 根据imageData是Base64还是URL来构造不同的参数
    const isBase64 = imageData.startsWith('data:image');
    const imageUrl = isBase64 ? '' : imageData;
    
    const res = cozeClient.chat.stream({
      bot_id: COZE_BOT_ID,
      user_id: userId,
      additional_messages: [
        {
          role: "user" as any,
          content: [
            {
              type: "image",
              file_url: imageUrl || undefined,
            } as any,
            {
              type: "text",
              text: "请将这张照片转换为艺术照风格"
            }
          ],
          content_type: "object_string"
        }
      ],
    });

    return res;
  } catch (error) {
    console.error('Coze API流式调用失败:', error);
    throw new Error('艺术照生成失败，请稍后重试');
  }
};

/**
 * 处理流式响应数据，提取艺术照URL
 * @param stream 流式响应
 * @returns 艺术照URL
 */
export const processStreamResponse = async (stream: AsyncIterable<any>): Promise<string> => {
  let artPhotoUrl = '';
  
  try {
    for await (const chunk of stream) {
      // 根据Coze API的流式响应格式处理数据
      switch (chunk.event) {
        case 'conversation.chat.created':
          console.log('对话开始');
          break;
        case 'conversation.chat.in_progress':
          console.log('服务端正在处理对话');
          break;
        case 'conversation.message.delta':
          // 处理增量消息
          console.log('收到增量消息:', chunk.data);
          break;
        case 'conversation.message.completed':
          // 消息回复完成，尝试从中提取艺术照URL
          console.log('消息回复完成:', chunk.data);
          // 从完成的消息中提取图片URL
          if (chunk.data && typeof chunk.data === 'object') {
            // 根据Coze API的文档，message.completed事件包含完整的消息内容
            // 消息内容可能包含content字段，其中可能有图片URL
            if (chunk.data.content) {
              try {
                // 尝试解析content字段（可能是JSON字符串）
                const content = typeof chunk.data.content === 'string' 
                  ? JSON.parse(chunk.data.content) 
                  : chunk.data.content;
                
                // 如果content是数组，遍历查找图片URL
                if (Array.isArray(content)) {
                  for (const item of content) {
                    if (item.type === 'image' && item.image_url) {
                      artPhotoUrl = item.image_url.url || item.image_url;
                      break;
                    }
                  }
                } 
                // 如果content是对象且包含图片URL
                else if (content.type === 'image' && content.image_url) {
                  artPhotoUrl = content.image_url.url || content.image_url;
                }
              } catch (parseError) {
                // 如果解析失败，直接使用content字段
                console.log('无法解析content字段:', chunk.data.content);
              }
            }
          }
          break;
        case 'conversation.chat.completed':
          // 对话完成
          console.log('对话完成');
          break;
        case 'conversation.chat.failed':
          // 对话失败
          throw new Error(chunk.data?.msg || '对话失败');
        case 'error':
          // 流式响应过程中的错误
          throw new Error(chunk.data?.msg || '流式响应错误');
        case 'done':
          // 流式响应正常结束
          console.log('流式响应结束');
          break;
        default:
          console.log('未知事件:', chunk);
      }
    }
    
    return artPhotoUrl;
  } catch (error) {
    console.error('处理流式响应失败:', error);
    throw error;
  }
};

export default cozeClient;