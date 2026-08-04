<script setup lang="ts">
import { computed, reactive } from 'vue'
import { attributeOrder, type Attribute, type Position, type UnitId } from '../types/common'
import type { UnitDefinition } from '../types/unit'
import type { BattleSetup } from '../types/setup'

const props = defineProps<{
  units: UnitDefinition[]
  initialSetup?: BattleSetup | null
}>()

const emit = defineEmits<{
  startBattle: [setup: BattleSetup]
}>()

const positions: { key: Position; label: string }[] = [
  { key: 'leader', label: 'リーダー' },
  { key: 'left', label: '左' },
  { key: 'right', label: '右' },
]

const attributeOrderIndex =
  new Map<Attribute, number>(
    attributeOrder.map((attribute, index) => {
      return [attribute, index]
    }),
  )

const sortedUnits = computed<UnitDefinition[]>(() => {
  return [...props.units].sort((unitA, unitB) => {
    const orderA =
      attributeOrderIndex.get(unitA.attribute) ??
      Number.MAX_SAFE_INTEGER

    const orderB =
      attributeOrderIndex.get(unitB.attribute) ??
      Number.MAX_SAFE_INTEGER

    return orderA - orderB
  })
})

const unitAttributeTextColors: Partial<
  Record<Attribute, string>
> = {
  fire: '#f87171',
  wind: '#4ade80',
  water: '#67e8f9',
  earth: '#fbbf24',
}

function createDefaultSetup(): BattleSetup {
  return {
    ally: {
      leader: props.units[0]?.id ?? '',
      left: props.units[1]?.id ?? props.units[0]?.id ?? '',
      right: props.units[2]?.id ?? props.units[0]?.id ?? '',
    },
    enemy: {
      leader: props.units[2]?.id ?? props.units[0]?.id ?? '',
      left: props.units[1]?.id ?? props.units[0]?.id ?? '',
      right: props.units[0]?.id ?? '',
    },
    reelProbabilityBiasEnabled: true,
  }
}

function cloneSetup(setup: BattleSetup): BattleSetup {
  return {
    ally: { ...setup.ally },
    enemy: { ...setup.enemy },
    reelProbabilityBiasEnabled: setup.reelProbabilityBiasEnabled ?? true,
  }
}

const selected = reactive<BattleSetup>(
  props.initialSetup
    ? cloneSetup(props.initialSetup)
    : createDefaultSetup(),
)

const canStartBattle = computed(() => {
  return (
    selected.ally.leader &&
    selected.ally.left &&
    selected.ally.right &&
    selected.enemy.leader &&
    selected.enemy.left &&
    selected.enemy.right
  )
})

function getUnitName(unitId: UnitId): string {
  return props.units.find((unit) => unit.id === unitId)?.name ?? '未選択'
}

function startBattle() {
  if (!canStartBattle.value) return

  emit('startBattle', {
    ally: {
      ...selected.ally,
    },
    enemy: {
      ...selected.enemy,
    },
    reelProbabilityBiasEnabled:
      selected.reelProbabilityBiasEnabled,
  })
}

function getUnitAttributeTextColor(
  unit: UnitDefinition,
): string {
  return (
    unitAttributeTextColors[unit.attribute] ??
    '#ffffff'
  )
}

function getSelectedUnitTextColor(
  unitId: UnitId,
): string {
  const unit = props.units.find((unit) => {
    return unit.id === unitId
  })

  if (!unit) {
    return '#ffffff'
  }

  return getUnitAttributeTextColor(unit)
}


</script>

<template>
  <main class="min-h-screen bg-slate-950 text-white p-6">
    <div class="mx-auto max-w-6xl">
      <header class="mb-8">
        <h1 class="text-3xl font-bold text-blue-400">
          ユニット選択
        </h1>
        <p class="mt-2 text-slate-300">
          味方チームと敵チームに、それぞれ3体のユニットを配置してください。
        </p>
      </header>

      <div class="grid grid-cols-2 gap-6">
        <section class="rounded-2xl border border-blue-800 bg-slate-900 p-5">
          <h2 class="mb-4 text-2xl font-bold text-blue-300">
            味方チーム
          </h2>

          <div class="space-y-4">
            <div v-for="position in positions" :key="position.key"
              class="rounded-xl border border-slate-700 bg-slate-950 p-4">
              <label class="mb-2 block font-bold text-slate-200">
                {{ position.label }}
              </label>

              <select v-model="selected.ally[position.key]"
                class="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2" :style="{
                  color: getSelectedUnitTextColor(
                    selected.ally[position.key],
                  ),
                }">
                <option v-for="unit in sortedUnits" :key="unit.id" :value="unit.id" :style="{
                  color: getUnitAttributeTextColor(unit),
                  backgroundColor: '#1e293b',
                }">
                  {{ unit.name }}
                </option>
              </select>

              <p class="mt-2 text-sm text-slate-400">
                選択中: {{ getUnitName(selected.ally[position.key]) }}
              </p>
            </div>
          </div>
        </section>

        <section class="rounded-2xl border border-red-800 bg-slate-900 p-5">
          <h2 class="mb-4 text-2xl font-bold text-red-300">
            敵チーム
          </h2>

          <div class="space-y-4">
            <div v-for="position in positions" :key="position.key"
              class="rounded-xl border border-slate-700 bg-slate-950 p-4">
              <label class="mb-2 block font-bold text-slate-200">
                {{ position.label }}
              </label>

              <select v-model="selected.enemy[position.key]"
                class="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2" :style="{
                  color: getSelectedUnitTextColor(
                    selected.enemy[position.key],
                  ),
                }">
                <option v-for="unit in sortedUnits" :key="unit.id" :value="unit.id" :style="{
                  color: getUnitAttributeTextColor(unit),
                  backgroundColor: '#1e293b',
                }">
                  {{ unit.name }}
                </option>
              </select>

              <p class="mt-2 text-sm text-slate-400">
                選択中: {{ getUnitName(selected.enemy[position.key]) }}
              </p>
            </div>
          </div>
        </section>
      </div>

      <section class="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <h2 class="mb-3 text-xl font-bold">
          選択内容
        </h2>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <h3 class="font-bold text-blue-300">
              味方
            </h3>
            <ul class="mt-2 space-y-1 text-slate-300">
              <li>リーダー: {{ getUnitName(selected.ally.leader) }}</li>
              <li>左: {{ getUnitName(selected.ally.left) }}</li>
              <li>右: {{ getUnitName(selected.ally.right) }}</li>
            </ul>
          </div>

          <div>
            <h3 class="font-bold text-red-300">
              敵
            </h3>
            <ul class="mt-2 space-y-1 text-slate-300">
              <li>リーダー: {{ getUnitName(selected.enemy.leader) }}</li>
              <li>左: {{ getUnitName(selected.enemy.left) }}</li>
              <li>右: {{ getUnitName(selected.enemy.right) }}</li>
            </ul>
          </div>
        </div>

        <div class="mt-6 flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-950 p-4">
          <div class="text-left">
            <p class="font-bold text-slate-100">
              リール確率の偏りを反映する
            </p>

            <p class="mt-1 text-sm text-slate-400">
              前半3枠の合計確率を36%、後半3枠の合計確率を64%にします。
            </p>
          </div>

          <label class="relative inline-flex cursor-pointer items-center">
            <input v-model="selected.reelProbabilityBiasEnabled" type="checkbox" class="peer sr-only">

            <span class="h-7 w-12 rounded-full bg-slate-600 transition-colors
             after:absolute after:left-1 after:top-1 after:h-5 after:w-5
             after:rounded-full after:bg-white after:transition-transform
             peer-checked:bg-blue-600
             peer-checked:after:translate-x-5
             peer-focus-visible:ring-2
             peer-focus-visible:ring-blue-400
             peer-focus-visible:ring-offset-2
             peer-focus-visible:ring-offset-slate-950" />
          </label>
        </div>
        <button
          class="mt-6 rounded-xl bg-blue-600 px-6 py-3 font-bold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-600"
          :disabled="!canStartBattle" @click="startBattle">
          戦闘開始
        </button>
      </section>
    </div>
  </main>
</template>