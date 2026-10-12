import { useState } from 'react'

export function Avatar({ src, name }: { src: string; name: string }) {
  const [err, setErr] = useState(false)
  const initials = (name || '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  if (err) return <div className="avatar-fallback">{initials}</div>
  return <img className="avatar" src={src} alt={name} loading="lazy" onError={() => setErr(true)} />
}
