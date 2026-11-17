<script setup lang="ts">
import { avatarColor, initials } from '../utils'

withDefaults(
  defineProps<{
    name: string
    size?: number
    src?: string
  }>(),
  {
    size: 40,
    src: '',
  },
)
</script>

<template>
  <span
    class="avatar"
    :style="{
      '--avatar-size': `${size}px`,
      '--avatar-color': avatarColor(name),
    }"
    :title="name"
  >
    <img v-if="src" :src="src" :alt="name" />
    <span v-else>{{ initials(name) }}</span>
  </span>
</template>

