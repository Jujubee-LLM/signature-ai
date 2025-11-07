import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// 从环境变量读取 API Key，建议在 .env.local 或平台环境变量中设置
const QWEN_API_KEY = process.env.QWEN_API_KEY || ''
const endpoint = process.env.QWEN_IMAGE_END_POINT || ''

type Body = {
  prompt?: string
}

export async function POST(req: NextRequest) {
  try {
    if (!QWEN_API_KEY) {
      return NextResponse.json({ error: 'Server misconfiguration: missing API key' }, { status: 500 })
    }

    const body = (await req.json()) as Body
    const prompt = (body.prompt || '').trim()
    if (!prompt || prompt.startsWith('Text API Error')) return NextResponse.json({ error: 'Missing prompt' }, { status: 400 })
    const imageUrl = await generateImageFromPrompt(prompt)
    return NextResponse.json({ imageUrl })
  } catch (err: any) {
    console.log('generateImageFromPrompt error', err)
    const message = err?.message || 'Invalid request'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/**
 * 向通义千问 Qwen Image API 发起请求
 */
async function generateImageFromPrompt(prompt: string): Promise<string> {
  // ✅ 按照官网标准格式组织 input
  const body = {
    model: 'qwen-image-plus',
    input: {
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ]
    },
    parameters: {
      size: '1664*928',
      n: 1
    }
  }
  try {
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

    const text = await resp.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {
      // 若返回非 JSON，保持 text
    }
    const imageUrl =
      json?.output?.choices?.[0]?.message?.content?.find((x: any) => !!x.image)?.image;
    if (typeof imageUrl === 'string' && imageUrl.length > 0) {
      const imageRes = await fetch(imageUrl)
      const arrayBuffer = await imageRes.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      return `data:image/png;base64,${base64}`;
    }
    return ''
  } catch (error: any) {
    console.error('qwen-image API Error:', error)
    return `抱歉，生成服务暂时不可用，请稍后再试。`
    //return `API Error: ${error?.message || 'Unknown error'}`
  }
}
