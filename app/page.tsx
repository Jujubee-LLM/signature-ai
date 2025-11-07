'use client'

import { useMemo, useState } from 'react'

type Language = 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'it'
type StyleOption = '书法' | '极简' | '潮流' | '梦幻' | '数码感'

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

export default function Page() {
  const [name, setName] = useState('')
  const [style, setStyle] = useState<StyleOption>('极简')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<string | null>(null)
  const [interpretation, setInterpretation] = useState<string | null>(null)

  const isDisabled = useMemo(() => loading || !name.trim(), [loading, name])

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
    const detected = detectLanguageFromName(name)
    if (detected === '不支持此种语言') {
      setError('当前语言暂不支持，请选择其他语言。')
      return
    }

    setLoading(true)
    try {
      const promptRes = await fetch('/api/generatePrompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, language: detected, style })
      })
      let imgRes: any = null
      if (!promptRes.ok) {
        imgRes = await fetch('/api/generateImage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: "为" + name + "生成一份默认风格签名" })
        })
        console.log('Failed to generate prompt')
        //throw new Error('抱歉，生成设计服务暂时不可用，请稍后再试。')
      } else {
        // throw new Error('Failed to generate prompt')
        const promptData = await promptRes.json()

        setPrompt(promptData.prompt)
        setInterpretation(promptData.interpretation)

        imgRes = await fetch('/api/generateImage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: promptData.prompt })
        })
      }
      if (!imgRes.ok){ 
        console.log('Failed to generate image')
        throw new Error('抱歉，生成签名服务暂时不可用，请稍后再试。')
      }
      const imgData = await imgRes.json()
      setImageUrl(imgData.imageUrl)
    } catch (err: any) {
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
                placeholder="输入你的名字，例如：志远 / John Doe"
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

          <button type="submit" className="btn-primary w-full" disabled={isDisabled}>
            {loading ? '生成中…' : '生成签名 / Generate Signature'}
          </button>
        </form>

        {(imageUrl || interpretation) && (
          <div className="mt-8 space-y-4">
            {interpretation && (
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
    </main>
  )
}


