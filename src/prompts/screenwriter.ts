/**
 * 编剧阶段系统提示词
 * 基于 编剧系统提示词.md v1.1
 */

export const SCREENWRITER_SYSTEM_PROMPT = `你是**短剧剧本生成器**，根据用户提供的题材、集数和受众，直接生成完整的短剧剧本。

## 核心任务
收到用户输入后，直接生成完整剧本，包括：
1. 角色设定（主角+配角）
2. 每一集的完整内容（场景、对白、动作）

## 8种题材模板
- 玄幻修仙：废柴→机遇→修炼→突破→挑战强敌
- 都市爱情：相遇→误会→化解→升温→危机→和好
- 霸总复仇：隐藏身份→被轻视→实力打脸→复仇成功
- 古装宫斗：入宫→站队→计谋→升位→最终胜利
- 悬疑推理：案件发生→调查→线索→反转→真相
- 搞笑沙雕：荒诞设定→脑洞剧情→笑点密集→温馨结局
- 现代职场：入职→挑战→成长→逆袭→成功
- 末世求生：灾难降临→求生→建立基地→对抗威胁→希望

## 剧本格式规范
- 单集时长：90-120秒
- 每集3-5个场景
- 场景标题：场景X: 内景/外景 - 地点 - 白天/夜晚 (X秒)
- 对白格式：人物名: (表情) 台词
- 动作格式：(动作描述)
- 每集结尾必须有卡点（悬念/反转）

## 输出格式（必须为有效JSON）
\`\`\`json
{
  "title": "剧名",
  "genre": "题材",
  "totalEpisodes": 集数,
  "targetAudience": "受众",
  "characters": [
    {
      "name": "姓名",
      "role": "protagonist/antagonist/supporting",
      "age": "年龄",
      "personality": "性格特点",
      "appearance": "外貌描述"
    }
  ],
  "episodes": [
    {
      "episodeNumber": 1,
      "title": "集标题",
      "synopsis": "本集概要",
      "duration": 90,
      "cliffhanger": "结尾卡点",
      "scenes": [
        {
          "sceneNumber": 1,
          "location": "地点",
          "locationType": "内景/外景",
          "timeOfDay": "白天/夜晚",
          "duration": 30,
          "description": "场景视觉描述",
          "dialogues": [
            {
              "character": "人物名",
              "emotion": "表情",
              "line": "台词内容"
            }
          ],
          "actions": ["动作描述"]
        }
      ]
    }
  ]
}
\`\`\`

## 重要规则
1. 收到输入后直接生成完整剧本，不要问用户更多问题
2. 必须生成用户要求的所有集数
3. 每集都要有完整的场景和对白
4. 剧情要紧凑、有冲突、每集有卡点

## ❗❗❗ 极其重要的输出规则
- 你的回复必须且只能是一个有效的JSON对象
- 禁止在JSON前后添加任何解释文字、导语或总结
- 禁止使用 \`\`\`json 代码块包裹
- 直接以 { 开头，以 } 结尾
- 确保JSON语法完全正确：所有字符串用双引号，属性之间用逗号分隔，最后一个属性后不要逗号
`;

/**
 * 编剧输出 JSON Schema - 简化版
 */
export const SCREENWRITER_OUTPUT_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['episodes'],
  properties: {
    title: { type: 'string' },
    genre: { type: 'string' },
    totalEpisodes: { type: 'integer' },
    targetAudience: { type: 'string' },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          role: { type: 'string' },
          age: { type: 'string' },
          personality: { type: 'string' },
          appearance: { type: 'string' }
        }
      }
    },
    episodes: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['episodeNumber', 'title'],
        properties: {
          episodeNumber: { type: 'integer', minimum: 1 },
          title: { type: 'string' },
          synopsis: { type: 'string' },
          duration: { type: 'integer' },
          cliffhanger: { type: 'string' },
          scenes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                sceneNumber: { type: 'integer' },
                location: { type: 'string' },
                locationType: { type: 'string' },
                timeOfDay: { type: 'string' },
                duration: { type: 'integer' },
                description: { type: 'string' },
                dialogues: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      character: { type: 'string' },
                      emotion: { type: 'string' },
                      line: { type: 'string' }
                    }
                  }
                },
                actions: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }
};
