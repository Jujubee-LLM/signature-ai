import { NextRequest, NextResponse } from 'next/server'
import { getQuotaSnapshot } from '@/lib/quotaStore'
import { checkRateLimit } from '@/lib/rateLimit'
import { applyUserCookie, getOrCreateUserSession } from '@/lib/userSession'

type Body = {
  name?: string
  language?: string
  style?: string
}

const QWEN_API_KEY = process.env.QWEN_API_KEY || ''
const endpoint = process.env.QWEN_TURBO_END_POINT || ''

export async function POST(req: NextRequest) {
  const session = getOrCreateUserSession(req)

  try {
    const rateLimitResponse = await checkRateLimit(req, session.userId)
    if (rateLimitResponse) {
      applyUserCookie(rateLimitResponse, session)
      return rateLimitResponse
    }

    const quota = await getQuotaSnapshot(session.userId)
    if (quota.totalRemaining <= 0) {
      const response = NextResponse.json(
        {
          error: '已经超过免费额度，请联系管理员充值并输入兑换码继续使用。',
          quotaExceeded: true,
          quota,
        },
        { status: 402 }
      )
      applyUserCookie(response, session)
      return response
    }

    const body = (await req.json()) as Body
    const name = (body.name || '').trim()
    const language = (body.language || '不支持此种语言').trim()
    const style = (body.style || '极简').trim()

    if (!name) {
      const response = NextResponse.json({ error: 'Missing name' }, { status: 400 })
      applyUserCookie(response, session)
      return response
    }

    const prompt = await generatePromptWithQwen({ name, language, style })
    const obj = JSON.parse(prompt)
    const response = NextResponse.json(obj)
    applyUserCookie(response, session)
    return response
  } catch (err) {
    const response = NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    applyUserCookie(response, session)
    return response
  }
}

async function generatePromptWithQwen({ name, language, style }: { name: string; language: string; style: string }) {
  const styleMap: Record<string, string> = {
    '书法': 'calligraphy, flowing brush strokes, ink texture, refined balance',
    '极简': 'minimalist, clean lines, high contrast, ample whitespace',
    '潮流': 'trendy, bold, dynamic shapes, contemporary typography',
    '梦幻': 'dreamy, soft glow, pastel tones, ethereal atmosphere',
    '数码感': 'digital aesthetic, neon accents, cyberpunk hints, luminous edges',
  }
  const styleHint = styleMap[style] || 'elegant, clean lines'

  const final = `
  你是一位具有艺术感知与跨文化理解能力的视觉设计师。
  请为名字「${name}」用语言：${language}）构思一个艺术签名字体设计概念。

  请**仅输出一个合法的 JSON 对象**，不要添加任何文字、解释或代码格式标识。
  输出对象必须包含以下两个字段：

  {
    "prompt": "...",
    "interpretation": "..."
  }
  ### 任务说明

  1. 若「${language}」不是中文，请先简要说明该名字在所属语言中的含义、象征或语音意象（例如：日文或韩文名字可分析其常见含义、字形或文化联想）。
  2. 根据名字的寓意（如坚毅、优雅、纯净、自由等），构思签名设计的艺术方向，使其体现名字的精神特质。
  3. 结合指定风格「${styleHint}」，在提示中描写以下视觉要素：
    - 整体构图与空间平衡  
    - 笔触与质感（如墨迹、线条流动、力度）  
    - 色彩与情绪氛围  
    - 背景与光影层次  
    - 由名字寓意衍生的情感象征或艺术气质

  ### 输出要求

  - **prompt**：请用**英文**撰写，但必须保留名字「${name}」的原始文字，不得将其翻译或转写为拼音。
  例如：当名字是中文、日文或韩文时，请直接使用这些文字字符。
  提示词需适用于 AI 图像生成模型（如 QWEN-IMAGE-PLUS），字数不超过 70 个英文单词。
  要求描述包含整体构图、笔触、色调和氛围，体现风格「${styleHint}」，并确保签名字体以原文字符呈现。

  - **interpretation**：请用与输入名字语言（${language}）一致的语言撰写一小段文字（约 50–80 字），内容为该签名的艺术解读，包括名字寓意、设计灵感与风格意象。请确保描述与 ${styleHint} 风格一致。
  `

  const body = {
    model: 'qwen-turbo',
    input: {
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: final
            }
          ]
        }
      ]
    },
    parameters: {
      result_format: 'text'  // ✅ 官方推荐格式
    }
  }

  if (!QWEN_API_KEY) {
    const msg = 'Missing QWEN_API_KEY in environment. Set process.env.QWEN_API_KEY.'
    return `Text API Error: ${msg}`
  }

  try {
    try {
      // 会抛出 if invalid
      // eslint-disable-next-line no-new
      new URL(endpoint)
    } catch (urlErr) {
      return `Text API Error: Invalid endpoint URL: ${endpoint}`
    }
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Next.js - qwen-proxy',
        Authorization: `Bearer ${QWEN_API_KEY}`
      },
      body: JSON.stringify(body),
      cache: 'no-store'
    })
    if (!resp.ok) {
      const respText = await resp.text().catch(() => '<unreadable response body>')
      const msg = `Qwen HTTP Error: ${resp.status} ${resp.statusText} - ${respText}`
      return `Text API Error: ${msg}`
    }

    const text = await resp.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {
      // 若返回非 JSON，保持 text
    }

    // ✅ 优先读取新版字段结构
    const textResult =
      // 常见字段兼容各种版本
      json?.output?.text ||
      json?.output?.choices?.[0]?.message?.content?.[0]?.text ||
      // 如果没有 JSON，直接用文本
      (typeof text === 'string' ? text : '')
    
    const fixedPrompt = textResult.replace(/\\n/g, '').replace(/\+/g, '');
    return fixedPrompt.trim() || 'No description generated'
  } catch (error: any) {
    console.error('Qwen-turbo API Error:', error)
    return `抱歉，生成服务暂时不可用，请稍后再试。`
    // // 给出更有用的调试建议
    // const causeMsg = error?.message || String(error)
    // const debugHint = [
    //   `Network/resolve error: ${causeMsg}`,
    //   'Possible causes: network unreachable, DNS failure, endpoint wrong, SSL/HTTPS issue, or server actively refused connection.',
    //   'If running locally: try `curl` the endpoint or disable VPN/proxy to test connectivity.',
    //   'If running in a serverless/VPC environment: ensure outbound network to that endpoint is allowed.'
    // ].join(' ')

    // return `Text API Error: ${causeMsg}. Debug: ${debugHint}`
  }

}

// async function generatePromptWithGemini({ name, language, style }: { name: string; language: string; style: string }) {
//   const baseInstruction = `You are a creative designer generating a concise, vivid, English visual prompt for an AI image model to draw an artistic signature. The signature should be readable and elegant.`
//   const styleMap: Record<string, string> = {
//     '书法': 'calligraphy, flowing brush strokes, ink texture, refined balance',
//     '极简': 'minimalist, clean lines, high contrast, ample whitespace',
//     '潮流': 'trendy, bold, dynamic shapes, contemporary typography',
//     '梦幻': 'dreamy, soft glow, pastel tones, ethereal atmosphere',
//     '数码感': 'digital aesthetic, neon accents, cyberpunk hints, luminous edges',
//   }
//   const styleHint = styleMap[style] || 'elegant, clean lines'

//   // Mocked output structure; replace with live Gemini call when API key is configured.
//   // For local dev without a key, this gives a stable UX.
//   const englishNameNote = `Name: ${name} (language: ${language})`
//   const final = `${baseInstruction}\n${englishNameNote}\nDesired style: ${styleHint}.\nOutput a single line prompt describing composition, stroke quality, color palette, background, and lighting. Keep under 60 words.`

//   // If GOOGLE_GEMINI_API_KEY present, attempt real call (optional lazy path)
//   const apiKey = process.env.GOOGLE_GEMINI_API_KEY
//   if (!apiKey) {
//     return `Elegant signature logo of the name \"${name}\" in ${styleHint}; balanced composition, crisp vector lines, subtle texture, soft off-white background, gentle studio lighting, high-resolution, centered framing.`
//   }

//   try {
//     // Dynamic import to avoid bundling if unused
//     const { GoogleGenerativeAI } = await import('@google/generative-ai')
//     const genAI = new GoogleGenerativeAI(apiKey)
//     const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })
//     const result = await model.generateContent(final)
//     const text = result.response.text().trim()
//     return text || `Elegant signature logo of the name \"${name}\" in ${styleHint}; balanced composition, crisp vector lines.`
//   } catch {
//     return `Elegant signature logo of the name \"${name}\" in ${styleHint}; balanced composition, crisp vector lines, subtle texture, soft off-white background, gentle studio lighting.`
//   }
// }
