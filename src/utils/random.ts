export function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive)
}

export function randomChoice<T>(items: T[]): T {
  if (items.length === 0) {
    throw new Error('randomChoice に空配列が渡されました。')
  }

  return items[randomInt(items.length)]
}

export function rollChance(chance = 1): boolean {
  return Math.random() < chance
}

export function randomVariance(baseValue: number, variance = 0.05): number {
  const min = 1 - variance
  const max = 1 + variance
  const rate = min + Math.random() * (max - min)

  return baseValue * rate
}