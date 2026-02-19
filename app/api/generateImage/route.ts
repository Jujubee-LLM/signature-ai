import { NextRequest, NextResponse } from 'next/server'
import { consumeGenerationCredit, refundGenerationCredit } from '@/lib/quotaStore'
import { checkRateLimit } from '@/lib/rateLimit'
import { applyUserCookie, getOrCreateUserSession } from '@/lib/userSession'

export const runtime = 'nodejs'

// 从环境变量读取 API Key，建议在 .env.local 或平台环境变量中设置
const QWEN_API_KEY = process.env.QWEN_API_KEY || ''
const endpoint = process.env.QWEN_IMAGE_END_POINT || ''

type Body = {
  prompt?: string
}

export async function POST(req: NextRequest) {
  const session = getOrCreateUserSession(req)
  let consumedFrom: 'free' | 'paid' | undefined

  try {
    const rateLimitResponse = await checkRateLimit(req, session.userId)
    if (rateLimitResponse) {
      applyUserCookie(rateLimitResponse, session)
      return rateLimitResponse
    }

    if (!QWEN_API_KEY) {
      const response = NextResponse.json(
        { error: '生成服务未配置（缺少 QWEN_API_KEY）' },
        { status: 400 }
      )
      applyUserCookie(response, session)
      return response
    }

    const consumption = await consumeGenerationCredit(session.userId)
    if (!consumption.allowed) {
      const response = NextResponse.json(
        {
          error: '已经超过免费额度，请联系管理员充值并输入兑换码继续使用。',
          quotaExceeded: true,
          quota: consumption.quota,
        },
        { status: 402 }
      )
      applyUserCookie(response, session)
      return response
    }
    consumedFrom = consumption.consumedFrom

    const body = (await req.json()) as Body
    const prompt = (body.prompt || '').trim()
    if (!prompt || prompt.startsWith('Text API Error')) {
      if (consumedFrom) {
        await refundGenerationCredit(session.userId, consumedFrom)
      }
      const response = NextResponse.json({ error: 'Missing prompt' }, { status: 400 })
      applyUserCookie(response, session)
      return response
    }

    const imageUrl = await generateImageFromPrompt(prompt)
    const proxiedImageUrl = `/api/imageProxy?src=${encodeURIComponent(imageUrl)}`
    const response = NextResponse.json({ imageUrl: proxiedImageUrl, quota: consumption.quota })
    applyUserCookie(response, session)
    return response
  } catch (err: any) {
    if (consumedFrom) {
      await refundGenerationCredit(session.userId, consumedFrom)
    }
    console.log('generateImageFromPrompt error', err)
    const message = err?.message || 'Invalid request'
    const response = NextResponse.json({ error: message }, { status: 400 })
    applyUserCookie(response, session)
    return response
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

    if (!resp.ok) {
      const respText = await resp.text().catch(() => '<unreadable response body>')
      throw new Error(`Qwen HTTP Error: ${resp.status} ${resp.statusText} - ${respText}`)
    }

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
      return imageUrl
    }
    throw new Error('Image URL not found in upstream response')
  } catch (error: any) {
    console.error('qwen-image API Error:', error)
    throw new Error('抱歉，生成服务暂时不可用，请稍后再试。')
    //return `API Error: ${error?.message || 'Unknown error'}`
  }
}
