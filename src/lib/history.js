import localforage from 'localforage'

localforage.config({
  name: 'tse-vibecoding',
  storeName: 'tse_history',
})

const KEY = 'tse-history-v1'
const MAX_POINTS = 600

export async function loadHistory() {
  try {
    const v = await localforage.getItem(KEY)
    return v || {}
  } catch {
    return {}
  }
}

export async function appendSnapshot(raceId, snap) {
  const all = (await loadHistory()) || {}
  const arr = all[raceId] || []
  const last = arr[arr.length - 1]
  // evita duplicar se nada mudou (mesmo hg + mesmos votos)
  if (last && last.hg === snap.hg && last.hash === snap.hash) return all
  arr.push(snap)
  while (arr.length > MAX_POINTS) arr.shift()
  all[raceId] = arr
  await localforage.setItem(KEY, all)
  return all
}

export async function clearHistory() {
  await localforage.removeItem(KEY)
  return {}
}

export function hashVotes(cands) {
  return cands.map((c) => `${c.numero}:${c.vap}`).join('|')
}
