<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ApiError, api } from '../api'
import type { Listing } from '../types'

const router = useRouter()
const loading = ref(false)
const uploading = ref(false)
const error = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const uploadedImages = ref<string[]>([])
const categories = [
  '学业辅导',
  '编程开发',
  '数码维修',
  '摄影摄像',
  '美妆造型',
  '语言交流',
  '运动健身',
  '生活服务',
  '其他',
]
const colors = ['#5D7CF6', '#35A88F', '#E78CA8', '#D39A55', '#8C6AC9', '#4B9BCE']
const form = reactive({
  kind: 'OFFER' as 'OFFER' | 'REQUEST',
  title: '',
  category: '学业辅导',
  description: '',
  tagsText: '',
  location: '',
  availability: '',
  coverColor: colors[0],
})

async function uploadImages(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (!files.length) return
  if (uploadedImages.value.length + files.length > 6) {
    error.value = '最多上传 6 张作品图片'
    input.value = ''
    return
  }

  uploading.value = true
  error.value = ''
  try {
    const formData = new FormData()
    files.forEach((file) => formData.append('images', file))
    const data = await api.upload<{ images: Array<{ url: string }> }>(
      '/uploads/images',
      formData,
    )
    uploadedImages.value.push(...data.images.map((image) => image.url))
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '图片上传失败'
  } finally {
    uploading.value = false
    input.value = ''
  }
}

function removeImage(index: number) {
  uploadedImages.value.splice(index, 1)
}

function moveImage(index: number, direction: number) {
  const target = index + direction
  if (target < 0 || target >= uploadedImages.value.length) return
  const [image] = uploadedImages.value.splice(index, 1)
  uploadedImages.value.splice(target, 0, image)
}

async function publish() {
  loading.value = true
  error.value = ''
  try {
    const listing = await api.post<Listing>('/listings', {
      kind: form.kind,
      title: form.title,
      category: form.category,
      description: form.description,
      tags: form.tagsText
        .split(/[,，、\s]+/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 5),
      images: uploadedImages.value,
      location: form.location,
      availability: form.availability,
      coverColor: form.coverColor,
    })
    router.push(`/listings/${listing.id}`)
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '发布失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="publish-page page-container narrow-container">
    <header class="page-heading">
      <div>
        <span class="section-kicker">PUBLISH</span>
        <h1>把技能放进时间集市</h1>
        <p>清楚的描述更容易遇到合适的人。每小时统一结算 1 枚时间币。</p>
      </div>
    </header>

    <form class="publish-form" @submit.prevent="publish">
      <section class="form-section">
        <div class="form-section-title">
          <span>01</span>
          <div><h2>这次想发布什么？</h2><p>选择你能提供的技能，或正在寻找的帮助。</p></div>
        </div>
        <div class="kind-switch">
          <button
            type="button"
            :class="{ active: form.kind === 'OFFER' }"
            @click="form.kind = 'OFFER'"
          >
            <span class="kind-icon">↗</span>
            <span><strong>提供技能</strong><small>我有擅长的，可以帮助别人</small></span>
          </button>
          <button
            type="button"
            :class="{ active: form.kind === 'REQUEST' }"
            @click="form.kind = 'REQUEST'"
          >
            <span class="kind-icon">↙</span>
            <span><strong>发布需求</strong><small>我需要帮助，希望用时间币交换</small></span>
          </button>
        </div>
      </section>

      <section class="form-section">
        <div class="form-section-title">
          <span>02</span>
          <div><h2>说清楚你的技能</h2><p>具体一点，让同学知道你能帮到什么程度。</p></div>
        </div>
        <div class="form-stack">
          <label class="field">
            <span>标题 <small>{{ form.title.length }}/60</small></span>
            <input
              v-model="form.title"
              required
              minlength="4"
              maxlength="60"
              placeholder="例如：高数一对一答疑，从极限到多元积分"
            />
          </label>
          <div class="form-two-col">
            <label class="field">
              <span>技能分类</span>
              <select v-model="form.category" required>
                <option v-for="category in categories" :key="category">{{ category }}</option>
              </select>
            </label>
            <label class="field">
              <span>服务地点</span>
              <input v-model="form.location" maxlength="60" placeholder="线上 / 图书馆 / 宿舍区" />
            </label>
          </div>
          <label class="field">
            <span>详细描述 <small>{{ form.description.length }}/1000</small></span>
            <textarea
              v-model="form.description"
              required
              minlength="15"
              maxlength="1000"
              rows="6"
              placeholder="你具体提供什么？适合哪些同学？需要对方提前准备什么？"
            ></textarea>
          </label>
          <label class="field">
            <span>标签 <small>用逗号分隔，最多 5 个</small></span>
            <input v-model="form.tagsText" maxlength="80" placeholder="高数, 期末复习, 一对一" />
          </label>
          <label class="field">
            <span>可服务时间</span>
            <input v-model="form.availability" maxlength="80" placeholder="如：周三、周末下午" />
          </label>
        </div>
      </section>

      <section class="form-section">
        <div class="form-section-title">
          <span>03</span>
          <div><h2>展示你的作品</h2><p>上传 1 至 6 张 JPG、PNG 或 WebP 图片，单张不超过 5MB。</p></div>
        </div>
        <input
          ref="fileInput"
          class="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          @change="uploadImages"
        />
        <div class="upload-grid">
          <div v-for="(image, index) in uploadedImages" :key="image" class="upload-preview">
            <img :src="image" :alt="`作品图片 ${index + 1}`" />
            <span v-if="index === 0">封面</span>
            <button type="button" @click="removeImage(index)">×</button>
            <div class="image-order-actions">
              <button type="button" :disabled="index === 0" @click="moveImage(index, -1)">←</button>
              <button type="button" :disabled="index === uploadedImages.length - 1" @click="moveImage(index, 1)">→</button>
            </div>
          </div>
          <button
            v-if="uploadedImages.length < 6"
            class="upload-trigger"
            type="button"
            :disabled="uploading"
            @click="fileInput?.click()"
          >
            <strong>{{ uploading ? '上传中…' : '＋' }}</strong>
            <span>{{ uploading ? '请稍候' : '添加作品图片' }}</span>
          </button>
        </div>
        <p class="upload-hint">图片会展示在技能卡片和详情页，第一张自动作为封面。</p>
      </section>

      <section class="form-section">
        <div class="form-section-title">
          <span>04</span>
          <div><h2>设置兜底封面</h2><p>没有上传图片时，颜色和分类图标会成为技能帖封面。</p></div>
        </div>
        <div class="color-picker">
          <button
            v-for="color in colors"
            :key="color"
            type="button"
            :class="{ active: form.coverColor === color }"
            :style="{ '--swatch': color }"
            @click="form.coverColor = color"
            :aria-label="`选择颜色 ${color}`"
          ></button>
        </div>
      </section>

      <div class="publish-submit">
        <div class="coin-rule">
          <span>◉</span>
          <p><strong>结算规则</strong><br />每小时 1 枚时间币，订单创建时冻结，确认完成后到账。</p>
        </div>
        <div class="submit-actions">
          <p v-if="error" class="form-error">{{ error }}</p>
          <button class="button" type="submit" :disabled="loading">
            {{ loading ? '正在发布…' : '确认发布' }}
          </button>
        </div>
      </div>
    </form>
  </div>
</template>

