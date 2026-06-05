<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UnitSelectScreen from './components/UnitSelectScreen.vue'
import { units } from './data/units'
import { skills } from './data/skills'
import { createBattleState } from './game/createBattleState'
import { getBattleUnitByInstanceId } from './game/battleQueries'
import {
  continueSkillWithSelectedTarget,
  executeRandomReelSkill,
  executeSpecialSkill,
} from './game/executeSkill'
import {
  canActByStatus,
  getChargedAttackStatusEffect,
  getStatusEffectName,
  isSkillSealedByStatus,
} from './game/statusEffects'
import type { BattleState, BattleUnit } from './types/battle'
import type { BattleSetup } from './types/setup'
import { finishActorTurn } from './game/actionLifecycle'
import { resolveStartTurnEffects } from './game/startTurnEffect.ts'

type Screen = 'unit_select' | 'battle'

const currentScreen = ref<Screen>('unit_select')
const battleSetup = ref<BattleSetup | null>(null)
const battleState = ref<BattleState | null>(null)


let resolvingStartTurnEffects = false

watch(
  () => [
    currentScreen.value,
    battleState.value?.activeUnitInstanceId,
    battleState.value?.pendingTargetSelection,
    battleState.value?.turn,
  ],
  () => {
    if (!battleState.value) return
    if (currentScreen.value !== 'battle') return
    if (resolvingStartTurnEffects) return

    resolvingStartTurnEffects = true

    try {
      resolveStartTurnEffects(battleState.value, skills)
    } finally {
      resolvingStartTurnEffects = false
    }
  },
  {
    immediate: true,
    flush: 'post',
  },
)

const highlightedRoll = ref<{
  actorInstanceId: string
  reelIndex: number
  slotIndex: number
  skillId: string
} | null>(null)

const selectableTargetUnits = computed<BattleUnit[]>(() => {
  if (!battleState.value?.pendingTargetSelection) return []

  return battleState.value.pendingTargetSelection.selectableTargetInstanceIds
    .map((instanceId) => getBattleUnitByInstanceId(battleState.value!, instanceId))
    .filter((unit): unit is BattleUnit => unit !== null)
})

const activeUnit = computed<BattleUnit | null>(() => {
  if (!battleState.value?.activeUnitInstanceId) return null

  return getBattleUnitByInstanceId(
    battleState.value,
    battleState.value.activeUnitInstanceId,
  )
})

const activeUnitCanAct = computed(() => {
  if (!activeUnit.value) return false

  // 麻痺など、ユニット自体が行動不能な状態異常を先に見る
  if (!canActByStatus(activeUnit.value)) {
    return false
  }

  const chargedStatus = getChargedAttackStatusEffect(activeUnit.value)

  // チャージ攻撃状態でなければ通常行動可能
  if (!chargedStatus) {
    return true
  }

  const canMoveWhileCharge =
    chargedStatus.params.canMoveWhileCharge ?? false

  // 残り2T以上で、チャージ中に動けない設定ならボタン操作不可
  if (chargedStatus.remainingTurns > 1 && !canMoveWhileCharge) {
    return false
  }

  // 残り1T以下なら、チャージ攻撃が自動発動する予定なのでボタン操作不可
  if (chargedStatus.remainingTurns <= 1) {
    return false
  }

  // canMoveWhileCharge が true かつ残り2T以上なら通常行動可能
  return true
})

const activeUnitSpecialSkill = computed(() => {
  if (!activeUnit.value) return null

  return skills[activeUnit.value.definition.specialSkillId] ?? null
})

const canUseSpecialSkill = computed(() => {
  if (!battleState.value) return false
  if (!activeUnit.value) return false
  if (!activeUnitCanAct.value) return false
  if (battleState.value.result.status !== 'in_progress') return false
  if (battleState.value.pendingTargetSelection) return false

  const team = activeUnit.value.side === 'ally'
    ? battleState.value.allyTeam
    : battleState.value.enemyTeam

  return team.specialGauge >= 10
})

const reelDisplayUnit = computed<BattleUnit | null>(() => {
  if (!battleState.value) return null

  if (highlightedRoll.value) {
    return getBattleUnitByInstanceId(
      battleState.value,
      highlightedRoll.value.actorInstanceId,
    )
  }

  return activeUnit.value
})

const reelDisplayReelIndex = computed(() => {
  if (!reelDisplayUnit.value) return 0

  if (highlightedRoll.value) {
    return highlightedRoll.value.reelIndex
  }

  return reelDisplayUnit.value.currentReelIndex
})

const reelDisplaySkills = computed(() => {
  if (!reelDisplayUnit.value) return []

  const reel = reelDisplayUnit.value.reels[reelDisplayReelIndex.value]

  if (!reel) return []

  return reel.map((skillId, index) => {
    const skill = skills[skillId]
    const isSealed = skill
      ? isSkillSealedByStatus(reelDisplayUnit.value!, skill)
      : false

    return {
      slotIndex: index,
      slotNumber: index + 1,
      skillId,
      skillName: skill?.name ?? '未定義',
      category: skill?.category ?? 'none',
      isSealed,
    }
  })
})

function handleStartBattle(setup: BattleSetup) {
  battleSetup.value = setup
  battleState.value = createBattleState(setup, units)
  highlightedRoll.value = null
  currentScreen.value = 'battle'

  console.log('戦闘開始データ:', setup)
  console.log('戦闘状態:', battleState.value)
}

function backToUnitSelect() {
  currentScreen.value = 'unit_select'
  battleState.value = null
  highlightedRoll.value = null
}

function useRandomSkill() {
  if (!battleState.value) return
  if (battleState.value.pendingTargetSelection) return
  if (!activeUnitCanAct.value) return

  executeRandomReelSkill(battleState.value, skills)

  if (battleState.value.lastRolledReelSlot) {
    highlightedRoll.value = { ...battleState.value.lastRolledReelSlot }

    window.setTimeout(() => {
      highlightedRoll.value = null
    }, 900)
  }
}

function useSpecialSkill() {
  if (!battleState.value) return
  if (battleState.value.pendingTargetSelection) return
  if (!activeUnitCanAct.value) return

  executeSpecialSkill(battleState.value, skills)

  highlightedRoll.value = null
}

function selectTarget(instanceId: string) {
  if (!battleState.value) return

  continueSkillWithSelectedTarget(battleState.value, instanceId, skills)
}
function testCompleteAction() {
  if (!battleState.value) return
  if (!battleState.value.activeUnitInstanceId) return
  if (battleState.value.result.status !== 'in_progress') return
  if (battleState.value.pendingTargetSelection) return
  if (!activeUnitCanAct.value) return

  const actedUnitId = battleState.value.activeUnitInstanceId

  battleState.value.logs.unshift(`${actedUnitId} は行動を完了した。`)

  finishActorTurn(battleState.value, actedUnitId)
}

function isHighlightedReelSlot(slotIndex: number): boolean {
  if (!highlightedRoll.value) return false
  if (!reelDisplayUnit.value) return false

  return (
    highlightedRoll.value.actorInstanceId === reelDisplayUnit.value.instanceId &&
    highlightedRoll.value.reelIndex === reelDisplayReelIndex.value &&
    highlightedRoll.value.slotIndex === slotIndex
  )
}

function hasActed(unitInstanceId: string): boolean {
  if (!battleState.value) return false

  return battleState.value.actedUnitInstanceIds.includes(unitInstanceId)
}

function getReelSkillClass(reelSkill: {
  slotIndex: number
  isSealed: boolean
}): string {
  if (isHighlightedReelSlot(reelSkill.slotIndex)) {
    return 'scale-105 border-yellow-300 bg-yellow-400 text-slate-950 shadow-lg shadow-yellow-500/30'
  }

  if (reelSkill.isSealed) {
    return 'border-red-500 bg-red-950 text-red-200 ring-1 ring-red-500'
  }

  return 'border-slate-700 bg-slate-900 text-slate-100'
}

function restartBattleWithSameTeams() {
  if (!battleSetup.value) return

  battleState.value = createBattleState(battleSetup.value, units)
  highlightedRoll.value = null
  currentScreen.value = 'battle'
}

function getSkillName(skillId: string): string {
  return skills[skillId]?.name ?? skillId
}

</script>

<template>
  <UnitSelectScreen v-if="currentScreen === 'unit_select'" :units="units" :initial-setup="battleSetup"
    @start-battle="handleStartBattle" />

  <main v-else class="min-h-screen bg-slate-950 p-6 text-white">
    <div class="mx-auto max-w-6xl">
      <header class="mb-6">
        <h1 class="text-3xl font-bold text-red-400">
          戦闘画面
        </h1>

        <p class="mt-2 text-slate-300">
          選択されたユニットから戦闘状態を作成しました。
        </p>
      </header>


      <section v-if="battleState" class="grid grid-cols-2 gap-6">

        <!-- 味方チーム -->
        <div class="rounded-2xl border border-blue-800 bg-slate-900 p-5">
          <div class="mb-4 flex items-center justify-between gap-4">
            <h2 class="text-2xl font-bold text-blue-300">
              味方チーム
            </h2>

            <div class="rounded-lg bg-blue-950 px-3 py-1 text-sm text-blue-200">
              必殺技ゲージ: {{ battleState.allyTeam.specialGauge }} / 10
            </div>
          </div>

          <div v-if="battleState.allyTeam.teamBonuses?.length > 0"
            class="mb-4 rounded-xl border border-blue-700 bg-blue-950 p-3 text-sm text-blue-100">
            <p class="font-bold">
              発動中のチームボーナス
            </p>

            <ul class="mt-1 list-disc pl-5">
              <li v-for="bonus in battleState.allyTeam.teamBonuses" :key="`${bonus.kind}-${bonus.key}`">
                {{ bonus.label }}
              </li>
            </ul>
          </div>

          <div class="space-y-3">
            <div v-for="unit in battleState.allyTeam.units" :key="unit.instanceId"
              class="rounded-xl border border-slate-700 bg-slate-950 p-4" :class="{
                'border-yellow-400 ring-2 ring-yellow-400':
                  unit.instanceId === battleState.activeUnitInstanceId,
                'opacity-50':
                  unit.currentHp <= 0,
              }">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-lg font-bold">
                      {{ unit.definition.name }}
                    </h3>

                    <span v-if="hasActed(unit.instanceId)"
                      class="rounded bg-slate-700 px-2 py-0.5 text-xs font-bold text-slate-300">
                      行動済み
                    </span>
                  </div>

                  <p class="text-sm text-slate-400">
                    {{ unit.instanceId }}
                  </p>

                  <div v-if="unit.statusEffects.length > 0" class="mt-2 flex flex-wrap gap-2">
                    <span v-for="statusEffect in unit.statusEffects" :key="statusEffect.id"
                      class="rounded-full bg-purple-950 px-2 py-0.5 text-xs font-bold text-purple-200">
                      {{ getStatusEffectName(statusEffect.id) }}-{{ getSkillName(statusEffect.sourceSkillId) }}（{{
                        statusEffect.remainingTurns }}T）
                    </span>
                  </div>
                </div>

                <span v-if="unit.instanceId === battleState.activeUnitInstanceId"
                  class="rounded bg-yellow-500 px-2 py-1 text-xs font-bold text-slate-950">
                  行動中
                </span>
              </div>

              <div class="mt-3 space-y-1 text-slate-300">
                <p>
                  配置: {{ unit.position }}
                </p>

                <p>
                  HP: {{ unit.currentHp }} / {{ unit.maxHp }}
                </p>

                <p>
                  攻撃: {{ unit.attack }} /
                  素早さ: {{ unit.speed }}
                </p>

                <p class="text-slate-400">
                  属性: {{ unit.definition.attribute }} /
                  種族: {{ unit.definition.species }} /
                  性別: {{ unit.definition.gender }}
                </p>

                <p class="text-slate-500">
                  現在リール: {{ unit.currentReelIndex + 1 }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- 敵チーム -->
        <div class="rounded-2xl border border-red-800 bg-slate-900 p-5">
          <div class="mb-4 flex items-center justify-between gap-4">
            <h2 class="text-2xl font-bold text-red-300">
              敵チーム
            </h2>

            <div class="rounded-lg bg-red-950 px-3 py-1 text-sm text-red-200">
              必殺技ゲージ: {{ battleState.enemyTeam.specialGauge }} / 10
            </div>
          </div>

          <div v-if="battleState.enemyTeam.teamBonuses?.length > 0"
            class="mb-4 rounded-xl border border-red-700 bg-red-950 p-3 text-sm text-red-100">
            <p class="font-bold">
              発動中のチームボーナス
            </p>

            <ul class="mt-1 list-disc pl-5">
              <li v-for="bonus in battleState.enemyTeam.teamBonuses" :key="`${bonus.kind}-${bonus.key}`">
                {{ bonus.label }}
              </li>
            </ul>
          </div>

          <div class="space-y-3">
            <div v-for="unit in battleState.enemyTeam.units" :key="unit.instanceId"
              class="rounded-xl border border-slate-700 bg-slate-950 p-4" :class="{
                'border-yellow-400 ring-2 ring-yellow-400':
                  unit.instanceId === battleState.activeUnitInstanceId,
                'opacity-50':
                  unit.currentHp <= 0,
              }">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-lg font-bold">
                      {{ unit.definition.name }}
                    </h3>

                    <span v-if="hasActed(unit.instanceId)"
                      class="rounded bg-slate-700 px-2 py-0.5 text-xs font-bold text-slate-300">
                      行動済み
                    </span>
                  </div>

                  <p class="text-sm text-slate-400">
                    {{ unit.instanceId }}
                  </p>

                  <div v-if="unit.statusEffects.length > 0" class="mt-2 flex flex-wrap gap-2">
                    <span v-for="statusEffect in unit.statusEffects" :key="statusEffect.id"
                      class="rounded-full bg-purple-950 px-2 py-0.5 text-xs font-bold text-purple-200">
                      {{ getStatusEffectName(statusEffect.id) }}-{{ getSkillName(statusEffect.sourceSkillId) }}（{{
                        statusEffect.remainingTurns }}T）
                    </span>
                  </div>
                </div>

                <span v-if="unit.instanceId === battleState.activeUnitInstanceId"
                  class="rounded bg-yellow-500 px-2 py-1 text-xs font-bold text-slate-950">
                  行動中
                </span>
              </div>

              <div class="mt-3 space-y-1 text-slate-300">
                <p>
                  配置: {{ unit.position }}
                </p>

                <p>
                  HP: {{ unit.currentHp }} / {{ unit.maxHp }}
                </p>

                <p>
                  攻撃: {{ unit.attack }} /
                  素早さ: {{ unit.speed }}
                </p>

                <p class="text-slate-400">
                  属性: {{ unit.definition.attribute }} /
                  種族: {{ unit.definition.species }} /
                  性別: {{ unit.definition.gender }}
                </p>

                <p class="text-slate-500">
                  現在リール: {{ unit.currentReelIndex + 1 }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- ターン情報 -->
        <section class="rounded-2xl border border-slate-700 bg-slate-900 p-5 md:col-span-2">
          <h2 class="mb-3 text-xl font-bold">
            ターン情報
          </h2>

          <p class="text-slate-300">
            現在ターン: {{ battleState.turn }}
          </p>

          <p class="mt-2 text-slate-300">
            現在の行動ユニット:
            <span class="font-bold text-yellow-300">
              {{ battleState.activeUnitInstanceId ?? 'なし' }}
            </span>
          </p>

          <p v-if="activeUnit" class="mt-2 text-slate-300">
            必殺技:
            <span class="font-bold text-purple-300">
              {{ activeUnitSpecialSkill?.name ?? '未定義' }}
            </span>
          </p>

          <p v-if="activeUnit && !activeUnitCanAct"
            class="mt-3 rounded-xl border border-purple-600 bg-purple-950 p-3 font-bold text-purple-100">
            {{ activeUnit.definition.name }} は状態異常により行動できません。
          </p>

          <!-- 現在リール表示 -->
          <div v-if="reelDisplayUnit" class="mt-6 rounded-xl border border-slate-700 bg-slate-950 p-4">
            <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 class="text-lg font-bold text-slate-100">
                  現在の技リール
                </h3>

                <p class="mt-1 text-sm text-slate-400">
                  {{ reelDisplayUnit.definition.name }} /
                  {{ reelDisplayReelIndex + 1 }} 番目のリール
                </p>
              </div>

              <div v-if="highlightedRoll" class="rounded-lg bg-yellow-500 px-3 py-1 text-sm font-bold text-slate-950">
                技が選ばれました
              </div>
            </div>


            <div class="overflow-x-auto">
              <div class="grid min-w-180 grid-cols-6 gap-3">
                <div v-for="reelSkill in reelDisplaySkills" :key="`${reelSkill.slotNumber}-${reelSkill.skillId}`"
                  class="relative flex min-h-20 items-center justify-center rounded-xl border p-3 text-center text-sm font-bold transition-all duration-300"
                  :class="getReelSkillClass(reelSkill)">
                  {{ reelSkill.skillName }}

                  <span v-if="reelSkill.isSealed"
                    class="absolute right-1 top-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    封印
                  </span>
                </div>
              </div>
            </div>

          </div>

          <!-- 対象選択UI -->
          <div v-if="battleState.pendingTargetSelection"
            class="mt-6 rounded-xl border border-yellow-500 bg-yellow-950 p-4">
            <h3 class="text-lg font-bold text-yellow-200">
              対象を選択してください
            </h3>

            <p class="mt-1 text-sm text-yellow-100">
              使用技: {{ battleState.pendingTargetSelection.skill.name }}
            </p>

            <div class="mt-4 flex flex-wrap gap-3">
              <button v-for="target in selectableTargetUnits" :key="target.instanceId"
                class="rounded-xl bg-yellow-500 px-4 py-3 font-bold text-slate-950 hover:bg-yellow-400"
                @click="selectTarget(target.instanceId)">
                {{ target.definition.name }}
                <span class="ml-1 text-xs">
                  HP {{ target.currentHp }} / {{ target.maxHp }}
                </span>
              </button>
            </div>
          </div>

          <!-- 操作ボタン -->
          <div class="mt-6 flex flex-wrap gap-3">
            <button v-if="battleState.result.status === 'in_progress'"
              class="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-600"
              :disabled="!!battleState.pendingTargetSelection || !activeUnitCanAct" @click="useRandomSkill">
              技を使う
            </button>

            <button v-if="battleState.result.status === 'in_progress'"
              class="rounded-xl bg-purple-600 px-5 py-3 font-bold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:bg-slate-600"
              :disabled="!canUseSpecialSkill" @click="useSpecialSkill">
              必殺技を使う
            </button>

            <button v-if="battleState.result.status === 'in_progress'"
              class="rounded-xl bg-yellow-500 px-5 py-3 font-bold text-slate-950 hover:bg-yellow-400 disabled:cursor-not-allowed disabled:bg-slate-600"
              :disabled="!!battleState.pendingTargetSelection || !activeUnitCanAct" @click="testCompleteAction">
              仮に行動完了
            </button>
          </div>

          <div v-if="battleState.result.status !== 'in_progress'"
            class="mt-6 rounded-xl border border-green-600 bg-green-950 p-4">
            <p v-if="battleState.result.status === 'ally_win'" class="font-bold text-green-200">
              味方チームの勝利！
            </p>

            <p v-else-if="battleState.result.status === 'enemy_win'" class="font-bold text-green-200">
              敵チームの勝利！
            </p>

            <p v-else class="font-bold text-green-200">
              引き分け！
            </p>

            <div class="mt-4 flex flex-wrap gap-3">
              <button class="rounded-xl bg-green-600 px-5 py-3 font-bold text-white hover:bg-green-500"
                @click="restartBattleWithSameTeams">
                同じチームで再度バトル開始
              </button>

              <button class="rounded-xl bg-slate-700 px-5 py-3 font-bold text-white hover:bg-slate-600"
                @click="backToUnitSelect">
                ユニット選択画面に戻る
              </button>
            </div>
          </div>
        </section>

        <!-- 戦闘ログ -->
        <section class="col-span-2 rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h2 class="text-xl font-bold text-slate-100">
              戦闘ログ
            </h2>

            <span class="rounded bg-slate-800 px-2 py-1 text-xs font-bold text-slate-400">
              {{ battleState.logs.length }} 件
            </span>
          </div>

          <div class="max-h-80 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-4">
            <ul class="space-y-1 text-slate-300">
              <li v-for="(log, index) in battleState.logs" :key="`${index}-${log}`" class="leading-relaxed">
                {{ log }}
              </li>
            </ul>
          </div>
        </section>
      </section>

      <button v-if="battleState?.result.status === 'in_progress'"
        class="mt-6 rounded-xl bg-slate-700 px-5 py-3 font-bold hover:bg-slate-600" @click="backToUnitSelect">
        ユニット選択に戻る
      </button>
    </div>
  </main>
</template>