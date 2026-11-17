<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ApiError, api } from '../api'

const props = defineProps<{
  modelValue: boolean
  targetType: 'LISTING' | 'USER'
  targetId: string
  targetName: string
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submitted: []
}>()

const submitting = ref(false)
const error = ref('')
const success = ref(false)
const form = reactive({
  reason: 'INAPPROPRIATE',
  detail: '',
})
const reasons = [
  { value: 'FRAUD', label: '疑似诈骗或虚假信息' },
  { value: 'HARASSMENT', label: '骚扰、辱骂或人身攻击' },
  { value: 'SPAM', label: '广告、刷屏或无关内容' },
  { value: 'INAPPROPRIATE', label: '不适宜内容' },
  { value: 'OTHER', label: '其他问题' },
]

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      error.value = ''
      success.value = false
      form.detail = ''
    }
  },
)

function close() {
  emit('update:modelValue', false)
}

async function submit() {
  submitting.value = true
  error.value = ''
  try {
    await api.post('/reports', {
      targetType: props.targetType,
      targetId: props.targetId,
      reason: form.reason,
      detail: form.detail,
    })
    success.value = true
    emit('submitted')
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '举报提交失败'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div v-if="modelValue" class="modal-backdrop" @click.self="close">
    <div class="modal-card report-modal">
      <div class="modal-head">
        <div>
          <span class="section-kicker">REPORT</span>
          <h2>{{ success ? '举报已提交' : '提交举报' }}</h2>
        </div>
        <button type="button" @click="close">×</button>
      </div>
      <template v-if="success">
        <div class="report-success">
          <span>✓</span>
          <p>管理员会审核这条举报，处理结果会发送到通知中心。</p>
        </div>
        <button class="button button-full" type="button" @click="close">知道了</button>
      </template>
      <form v-else class="form-stack" @submit.prevent="submit">
        <p class="report-target">举报对象：<strong>{{ targetName }}</strong></p>
        <label class="field">
          <span>问题类型</span>
          <select v-model="form.reason">
            <option v-for="reason in reasons" :key="reason.value" :value="reason.value">
              {{ reason.label }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>补充说明</span>
          <textarea
            v-model="form.detail"
            rows="4"
            maxlength="500"
            placeholder="请描述具体情况，方便管理员核实"
          ></textarea>
        </label>
        <p v-if="error" class="form-error">{{ error }}</p>
        <button class="button button-full" type="submit" :disabled="submitting">
          {{ submitting ? '提交中…' : '确认提交' }}
        </button>
      </form>
    </div>
  </div>
</template>

