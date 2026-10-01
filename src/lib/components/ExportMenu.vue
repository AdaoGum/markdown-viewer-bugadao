<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Icon from './Icon.vue'
import type { ExportCategory, Exporter } from '../core/types'
import type { Messages } from '../core/i18n'

const props = defineProps<{
  exporters: Exporter[]
  messages: Messages
  /** Id of the exporter currently running, if any. */
  busy?: string | null
}>()

const emit = defineEmits<{ select: [exporter: Exporter] }>()

const CATEGORY_ORDER: ExportCategory[] = ['document', 'web', 'image', 'data', 'action']
const ACTION_ICONS: Record<string, string> = { print: 'print', 'copy-html': 'copy', 'copy-markdown': 'copy' }

const open = ref(false)
const root = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const menu = ref<HTMLElement>()
const menuId = `mv-menu-${Math.random().toString(36).slice(2, 9)}`

const groups = computed(() =>
  CATEGORY_ORDER.map((category) => ({
    category,
    items: props.exporters.filter((exporter) => exporter.category === category),
  })).filter((group) => group.items.length),
)

const labelOf = (exporter: Exporter) => props.messages.formats[exporter.id] ?? exporter.label

function items(): HTMLElement[] {
  return Array.from(menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
}

async function toggle(force?: boolean) {
  open.value = force ?? !open.value
  if (open.value) {
    await nextTick()
    items()[0]?.focus()
  }
}

function close(focusTrigger = false) {
  open.value = false
  if (focusTrigger) trigger.value?.focus()
}

function choose(exporter: Exporter) {
  close(true)
  emit('select', exporter)
}

function onKeydown(event: KeyboardEvent) {
  const list = items()
  const index = list.indexOf(document.activeElement as HTMLElement)
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      list[(index + 1) % list.length]?.focus()
      break
    case 'ArrowUp':
      event.preventDefault()
      list[(index - 1 + list.length) % list.length]?.focus()
      break
    case 'Home':
      event.preventDefault()
      list[0]?.focus()
      break
    case 'End':
      event.preventDefault()
      list[list.length - 1]?.focus()
      break
    case 'Escape':
      event.preventDefault()
      close(true)
      break
    case 'Tab':
      close()
      break
  }
}

function onPointerDown(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) close()
}

watch(open, (value) => {
  if (value) document.addEventListener('pointerdown', onPointerDown, true)
  else document.removeEventListener('pointerdown', onPointerDown, true)
})

onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown, true))

defineExpose({ open: () => toggle(true), close })
</script>

<template>
  <div ref="root" class="mv-export">
    <button
      ref="trigger"
      type="button"
      class="mv-btn mv-btn-primary"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="menuId"
      @click="toggle()"
      @keydown.down.prevent="toggle(true)"
    >
      <span v-if="busy" class="mv-spinner" aria-hidden="true" />
      <Icon v-else name="download" />
      {{ messages.export }}
      <Icon name="chevron" />
    </button>

    <Transition name="mv-fade">
      <div v-if="open" :id="menuId" ref="menu" class="mv-menu" role="menu" @keydown="onKeydown">
        <div v-for="group in groups" :key="group.category" class="mv-menu-group" role="group" :aria-label="messages.categories[group.category]">
          <div class="mv-menu-heading" aria-hidden="true">{{ messages.categories[group.category] }}</div>
          <button
            v-for="exporter in group.items"
            :key="exporter.id"
            type="button"
            class="mv-menu-item"
            role="menuitem"
            tabindex="-1"
            :disabled="!!busy"
            :data-format="exporter.id"
            @click="choose(exporter)"
          >
            <span class="mv-badge">
              <Icon v-if="!exporter.extension" :name="ACTION_ICONS[exporter.id] ?? 'download'" />
              <template v-else>{{ exporter.extension }}</template>
            </span>
            <span class="mv-menu-label">{{ labelOf(exporter) }}</span>
            <span v-if="busy === exporter.id" class="mv-spinner" aria-hidden="true" />
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
