'use client'

import { useEffect, useMemo, useState } from 'react'

type Language = 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'it'
type StyleOption = '书法' | '极简' | '潮流' | '梦幻' | '数码感'
type Quota = {
  freeRemaining: number
  paidRemaining: number
  totalRemaining: number
}

function isQuotaExceededError(message: unknown): boolean {
  if (typeof message !== 'string') return false
  return message.includes('超过免费额度')
}

/**
 * 检测输入名字所属语言
 * 返回值为 8 种语言之一，或 '不支持此种语言'
 */
function detectLanguageFromName(name: string): Language | '不支持此种语言' {
  if (!name || name.trim().length === 0) return '不支持此种语言'

  // 尝试使用 Unicode 属性脚本判断（更精确）
  try {
    if (/\p{Script=Han}/u.test(name)) return 'zh'
    if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(name)) return 'ja'
    if (/\p{Script=Hangul}/u.test(name)) return 'ko'
  } catch {
    // 若环境不支持 \p{Script}，退回传统范围判断
    if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(name)) return 'zh'
    if (/[\u3040-\u30FF\u31F0-\u31FF]/.test(name)) return 'ja'
    if (/[\uAC00-\uD7AF]/.test(name)) return 'ko'
  }

  // 小写用于后续判断
  const lower = name.toLowerCase()

  // 德语特征字符（ß 和变音字母）
  if (/[ßẞäöüÄÖÜ]/.test(name)) return 'de'
  // 西班牙语特征（ñ、倒问号/感叹号）
  if (/[ñÑ¡¿]/.test(name)) return 'es'
  // 法语常见字符（ç, œ, æ, 重音等）
  if (/[çÇœŒæÆêéèàùâîôûëïü]/.test(name)) return 'fr'
  // 意大利语常见重音（频繁出现 à è é ì ò ù）
  if (/[àèéìòùÀÈÉÌÒÙ]/.test(name)) return 'it'

  // 若仅为基本拉丁字母与常见连接符，则判定为英文
  if (/^[a-zA-Z\s'.-]+$/.test(name)) return 'en'

  // 其他情况视为不支持
  return '不支持此种语言'
}

function buildFastPrompt(name: string, style: StyleOption): string {
  const styleMap: Record<StyleOption, string> = {
    '书法': 'calligraphy style, flowing brush strokes, elegant ink texture',
    '极简': 'minimalist style, clean lines, balanced whitespace',
    '潮流': 'trendy style, bold dynamic curves, modern visual rhythm',
    '梦幻': 'dreamy style, soft glow, poetic atmosphere',
    '数码感': 'digital style, neon accents, futuristic sleek lines',
  }
  const styleHint = styleMap[style]
  return `Artistic signature of "${name}", ${styleHint}, centered composition, high legibility, refined stroke details, clean background.`
}

export default function Page() {
  const [name, setName] = useState('')
  const [style, setStyle] = useState<StyleOption>('极简')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<string | null>(null)
  const [interpretation, setInterpretation] = useState<string | null>(null)
  const [quota, setQuota] = useState<Quota | null>(null)
  const [showRedeemModal, setShowRedeemModal] = useState(false)
  const [redeemCode, setRedeemCode] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [redeemError, setRedeemError] = useState<string | null>(null)
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null)

  const isDisabled = useMemo(() => loading || !name.trim(), [loading, name])

  useEffect(() => {
    void refreshQuota()
  }, [])

  useEffect(() => {
    if (quota && quota.totalRemaining <= 0) {
      setError(null)
      setShowRedeemModal(true)
    }
  }, [quota])

  useEffect(() => {
    if (!showRedeemModal || !redeemSuccess) return
    const timer = window.setTimeout(() => {
      setShowRedeemModal(false)
      setRedeemSuccess(null)
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [showRedeemModal, redeemSuccess])

  async function refreshQuota() {
    try {
      const res = await fetch('/api/quota/status', { method: 'GET' })
      const data = await res.json().catch(() => ({}))
      if (data?.quota) {
        setQuota(data.quota)
        return
      }
      setQuota({
        freeRemaining: 0,
        paidRemaining: 0,
        totalRemaining: 0,
      })
    } catch {
      setQuota({
        freeRemaining: 0,
        paidRemaining: 0,
        totalRemaining: 0,
      })
    }
  }

  function handleQuotaExceeded(nextQuota?: Quota) {
    if (nextQuota) {
      setQuota(nextQuota)
    }
    setError(null)
    setShowRedeemModal(true)
  }

  async function handleRedeemCode(e: React.FormEvent) {
    e.preventDefault()
    setRedeemError(null)
    setRedeemSuccess(null)

    if (!redeemCode.trim()) {
      setRedeemError('请输入兑换码')
      return
    }

    setRedeeming(true)
    try {
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: redeemCode.trim() }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (data?.quota) setQuota(data.quota)
        setRedeemError(data?.error || '兑换失败，请稍后重试')
        return
      }

      if (data?.quota) setQuota(data.quota)
      setRedeemSuccess('兑换成功，额度已更新。')
      setRedeemCode('')
      setError(null)
    } catch {
      setRedeemError('兑换失败，请稍后重试')
    } finally {
      setRedeeming(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setImageUrl(null)
    setPrompt(null)
    setInterpretation(null)

    const allowedPattern = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}a-zA-ZÀ-ÖØ-öø-ÿĀ-ž\s'.-]+$/u

    if (!allowedPattern.test(name)) {
      setError('仅支持中文、英语、日语、韩语、法语、德语、西班牙语、意大利语，请勿输入特殊字符或其他语言。')
      return
    }

    // 这里要检测的是用户输入的名字的语言，而不是 state.language（用户可选的语言）
    if (detectLanguageFromName(name) === '不支持此种语言') {
      setError('当前语言暂不支持，请选择其他语言。')
      return
    }

    setLoading(true)
    try {
      const fastPrompt = buildFastPrompt(name, style)
      setPrompt(fastPrompt)
      setInterpretation(null)

      const imgRes = await fetch('/api/generateImage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: fastPrompt })
      })

      const imgData = await imgRes.json().catch(() => ({}))
      if (imgRes.status === 402 || imgData?.quotaExceeded || imgData?.quota?.totalRemaining <= 0) {
        handleQuotaExceeded(imgData?.quota)
        return
      }
      if (!imgRes.ok){ 
        console.log('Failed to generate image')
        const nextError = imgData?.error || '抱歉，生成签名服务暂时不可用，请稍后再试。'
        if (isQuotaExceededError(nextError)) {
          handleQuotaExceeded(imgData?.quota)
          return
        }
        throw new Error(nextError)
      }

      setImageUrl(imgData.imageUrl)
      if (imgData?.quota) {
        setQuota(imgData.quota)
      } else {
        await refreshQuota()
      }
    } catch (err: any) {
      await refreshQuota()
      if (isQuotaExceededError(err?.message)) {
        handleQuotaExceeded()
        return
      }
      setError(err?.message || 'Unexpected error')
    } finally {
      setLoading(false)
    }

  }

  function downloadImage() {
    if (!imageUrl) return
    const a = document.createElement('a')
    a.href = imageUrl
    a.download = `${name}-signature.png`
    a.click()
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-2xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Signify</h1>
        <p className="text-sm text-gray-500 mb-6">AI Artistic Signature Generator · 输入你的名字，生成专属艺术签名</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">姓名 / Name</label>
              <input
                className="input"
                placeholder="输入你的名字，例如：何炅 / John Doe"
                value={name}
                onChange={(e) => {
                  const raw = e.target.value
                  const filtered = raw.replace(
                    /[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}a-zA-ZÀ-ÖØ-öø-ÿĀ-ž\s'.-]/gu,
                    ''
                  )
                  setName(filtered)
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">风格 / Style</label>
              <select
                className="input"
                value={style}
                onChange={(e) => setStyle(e.target.value as StyleOption)}
              >
                <option value="书法">书法 / Calligraphy</option>
                <option value="极简">极简 / Minimalist</option>
                <option value="潮流">潮流 / Trendy</option>
                <option value="梦幻">梦幻 / Dreamy</option>
                <option value="数码感">数码感 / Digital</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600">{error}</div>
          )}

          <div className="text-xs text-gray-500 text-center mt-2 mb-2">
            🌏 我们目前只支持中文、英语、日语、韩语、西班牙语、法语、意大利语、德语。<br />
            <span className="italic text-gray-400">We currently support zh / en / jp / ko / es / fr / it / de.</span>
          </div>

          <div className="text-xs text-center text-gray-600">
            {quota
              ? `剩余次数：免费 ${quota.freeRemaining} 次 + 充值 ${quota.paidRemaining} 次 = 共 ${quota.totalRemaining} 次`
              : '剩余次数：加载中...'}
          </div>

          <button type="submit" className="btn-primary w-full" disabled={isDisabled}>
            {loading ? '生成中…' : '生成签名 / Generate Signature'}
          </button>

        </form>

        {(imageUrl || interpretation) && (
          <div className="mt-8 space-y-4">
            {imageUrl && interpretation && (
              <div className="rounded-xl border border-gray-200 p-4 bg-gray-50 text-sm text-gray-700">
                <span className="font-semibold mr-2">签名寓意解读 / Symbolism:</span>
                <span>{interpretation}</span>
              </div>
            )}

            {imageUrl && (
              <div className="flex flex-col items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="signature" className="max-h-[360px] w-auto rounded-xl border border-gray-200" />
                <button onClick={downloadImage} className="btn-primary">下载 / Download</button>
              </div>
            )}
          </div>
        )}

        <p className="mt-8 text-xs text-gray-400 text-center">Created by Signify AI — Artistic Signature Generator</p>
      </div>

      {showRedeemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowRedeemModal(false)}
            aria-label="关闭弹窗"
          />
          <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">免费额度已用完</h2>
            <p className="text-sm text-gray-600 mb-4">
              已经超过免费额度，请联系管理员充值。完成后输入兑换码即可继续生成。
            </p>

            <form onSubmit={handleRedeemCode} className="space-y-3">
              <input
                className="input"
                placeholder="输入兑换码，例如：ABC123XYZ"
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
              />

              {redeemError && <div className="text-sm text-red-600">{redeemError}</div>}
              {redeemSuccess && <div className="text-sm text-green-600">{redeemSuccess}</div>}

              <div className="grid grid-cols-2 gap-3">
                <button type="submit" className="btn-primary w-full" disabled={redeeming}>
                  {redeeming ? '兑换中…' : '确认兑换'}
                </button>
                <button
                  type="button"
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  onClick={() => setShowRedeemModal(false)}
                >
                  关闭
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
