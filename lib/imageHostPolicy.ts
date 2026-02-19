function normalizeHost(value: string): string {
  return value.trim().toLowerCase()
}

function parseHostFromUrl(urlValue: string | undefined): string {
  if (!urlValue) return ''
  try {
    return normalizeHost(new URL(urlValue).hostname)
  } catch {
    return ''
  }
}

function parseConfiguredPatterns(): string[] {
  const defaults = ['*.aliyuncs.com']
  const manual = (process.env.IMAGE_PROXY_ALLOWED_HOSTS || '')
    .split(',')
    .map((x) => normalizeHost(x))
    .filter(Boolean)

  const endpointHosts = [
    parseHostFromUrl(process.env.QWEN_IMAGE_END_POINT),
    parseHostFromUrl(process.env.QWEN_TURBO_END_POINT),
  ].filter(Boolean)

  return Array.from(new Set([...defaults, ...manual, ...endpointHosts]))
}

function matchPattern(host: string, pattern: string): boolean {
  if (!pattern) return false
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1) // keep leading '.'
    return host.endsWith(suffix)
  }
  return host === pattern
}

export function isAllowedImageHost(hostname: string): boolean {
  const host = normalizeHost(hostname)
  if (!host) return false

  const patterns = parseConfiguredPatterns()
  if (patterns.length === 0) return false

  return patterns.some((pattern) => matchPattern(host, pattern))
}

export function getImageHostPolicyHint(): string {
  const patterns = parseConfiguredPatterns()
  return patterns.length > 0 ? patterns.join(', ') : '(empty)'
}
