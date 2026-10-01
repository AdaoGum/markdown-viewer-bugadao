<script setup lang="ts">
const paths = {
  download: 'M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z',
  split: 'M4 4h16v16H4zM12 4v16',
  edit: 'M4 20h4L18.5 9.5a2.1 2.1 0 00-4-4L4 16v4zM13.5 6.5l4 4',
  chevron: 'M6 9l6 6 6-6',
  print: 'M7 9V3h10v6M7 18H5a2 2 0 01-2-2v-5a2 2 0 012-2h14a2 2 0 012 2v5a2 2 0 01-2 2h-2M7 14h10v7H7z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 8v5m0 3.5v.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
} as const

const props = defineProps<{ name: string }>()
</script>

<template>
  <svg class="mv-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path :d="paths[props.name as keyof typeof paths]" />
  </svg>
</template>
