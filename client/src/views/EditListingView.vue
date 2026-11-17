<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, api } from '../api'
import { authState } from '../store'
import type { Listing } from '../types'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const saving = ref(false)
const uploading = ref(false)
const error = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const images = ref<string[]>([])
const colors = ['#5D7CF6', '#35A88F', '#E78CA8', '#D39A55', '#8C6AC9', '#4B9BCE']
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
const form = reactive({
  kind: 'OFFER' as 'OFFER' | 'REQUEST',
  title: '',
  category: '学业辅导',
  description: '',
  tagsText: '',
  location: '',
  availability: '',
  coverColor: colors[0],
  status: 'ACTIVE' as 'ACTIVE' | 'PAUSED' | 'CLOSED',
})

async function load() {
  loading.value = true
  try {
    const listing = await api.get<Listing>(`/listings/${route.params.id}`)
    if (listing.ownerId !== authState.user?.id) throw new Error('只能编辑自己发布的技能帖')
    Object.assign(form, {
      kind: listing.kind,
      title: listing.title,
      category: listing.category,
      description: listing.description,
      tagsText: listing.tags.join(', '),
      location: listing.location,
      availability: listing.availability,
      coverColor: listing.coverColor,
      status: listing.status,
    })
    images.value = [...listing.images]
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : String(cause)
  } finally {
    loading.value = false
  }
}

async function uploadImages(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (!files.length) return
  if (images.value.length + files.length > 6) {
    error.value = '最多保留 6 张作品图片'
    input.value = ''
    return
  }
  uploading.value = true
  error.value = ''
  try {
    const body = new FormData()
    files.forEach((file) => body.append('images', file))
    const data = await api.upload<{ images: Array<{ url: string }> }>('/uploads/images', body)
    images.value.push(...data.images.map((image) => image.url))
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '图片上传失败'
  } finally {
    uploading.value = false
    input.value = ''
  }
}

function moveImage(index: number, direction: number) {
  const target = index + direction
  if (target < 0 || target >= images.value.length) return
  const [image] = images.value.splice(index, 1)
  images.value.splice(target, 0, image)
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    await api.patch<Listing>(`/listings/${route.params.id}`, {
      kind: form.kind,
      title: form.title,
      category: form.category,
      description: form.description,
      tags: form.tagsText
        .split(/[,，、\s]+/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 5),
      images: images.value,
      location: form.location,
      availability: form.availability,
      coverColor: form.coverColor,
      status: form.status,
    })
    router.push(`/listings/${route.params.id}`)
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="publish-page page-container narrow-container">
    <header class="page-heading">
      <div>
        <span class="section-kicker">EDIT LISTING</span>
        <h1>编辑技能帖</h1>
        <p>调整作品顺序、服务说明和展示状态，已有订单不会受到影响。</p>
      </div>
      <RouterLink :to="`/listings/${route.params.id}`" class="text-link">查看详情 →</RouterLink>
    </header>

    <div v-if="loading" class="skeleton-card edit-skeleton"></div>
    <template v-else-if="!error || form.title">
      <form class="publish-form" @submit.prevent="save">
        <section class="form-section">
          <div class="form-section-title">
            <span>01</span>
            <div><h2>基础信息</h2><p>修改后会立即更新技能广场中的内容。</p></div>
          </div>
          <div class="form-stack">
            <div class="kind-switch">
              <button type="button" :class="{ active: form.kind === 'OFFER' }" @click="form.kind = 'OFFER'">
                <span class="kind-icon">↗</span>
                <span><strong>提供技能</strong><small>我能帮助别人</small></span>
              </button>
              <button type="button" :class="{ active: form.kind === 'REQUEST' }" @click="form.kind = 'REQUEST'">
                <span class="kind-icon">↙</span>
                <span><strong>发布需求</strong><small>我正在寻找帮助</small></span>
              </button>
            </div>
            <label class="field">
              <span>标题</span>
              <input v-model="form.title" required minlength="4" maxlength="60" />
            </label>
            <div class="form-two-col">
              <label class="field">
                <span>分类</span>
                <select v-model="form.category">
                  <option v-for="category in categories" :key="category">{{ category }}</option>
                </select>
              </label>
              <label class="field">
                <span>展示状态</span>
                <select v-model="form.status">
                  <option value="ACTIVE">展示中</option>
                  <option value="PAUSED">暂停展示</option>
                  <option value="CLOSED">永久关闭</option>
                </select>
              </label>
            </div>
            <label class="field">
              <span>详细描述</span>
              <textarea v-model="form.description" required minlength="15" maxlength="1000" rows="6"></textarea>
            </label>
            <div class="form-two-col">
              <label class="field">
                <span>标签</span>
                <input v-model="form.tagsText" maxlength="80" />
              </label>
              <label class="field">
                <span>可服务时间</span>
                <input v-model="form.availability" maxlength="80" />
              </label>
            </div>
            <label class="field">
              <span>服务地点</span>
              <input v-model="form.location" maxlength="60" />
            </label>
          </div>
        </section>

        <section class="form-section">
          <div class="form-section-title">
            <span>02</span>
            <div><h2>作品图片与顺序</h2><p>第一张图片是封面，使用箭头调整展示顺序。</p></div>
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
            <div v-for="(image, index) in images" :key="image" class="upload-preview">
              <img :src="image" alt="" />
              <span>{{ index === 0 ? '封面' : `第 ${index + 1} 张` }}</span>
              <button type="button" class="preview-remove" @click="images.splice(index, 1)">×</button>
              <div class="image-order-actions">
                <button type="button" :disabled="index === 0" @click="moveImage(index, -1)">←</button>
                <button type="button" :disabled="index === images.length - 1" @click="moveImage(index, 1)">→</button>
              </div>
            </div>
            <button
              v-if="images.length < 6"
              class="upload-trigger"
              type="button"
              :disabled="uploading"
              @click="fileInput?.click()"
            >
              <strong>{{ uploading ? '…' : '＋' }}</strong>
              <span>{{ uploading ? '上传中' : '添加图片' }}</span>
            </button>
          </div>
        </section>

        <section class="form-section">
          <div class="form-section-title">
            <span>03</span>
            <div><h2>兜底封面颜色</h2><p>没有图片时使用颜色和分类图标展示。</p></div>
          </div>
          <div class="color-picker">
            <button
              v-for="color in colors"
              :key="color"
              type="button"
              :class="{ active: form.coverColor === color }"
              :style="{ '--swatch': color }"
              @click="form.coverColor = color"
            ></button>
          </div>
        </section>

        <div class="publish-submit">
          <p class="form-error">{{ error }}</p>
          <button class="button" :disabled="saving" type="submit">
            {{ saving ? '保存中…' : '保存修改' }}
          </button>
        </div>
      </form>
    </template>
    <div v-else class="empty-state">
      <h2>{{ error }}</h2>
      <RouterLink to="/profile" class="button">返回个人中心</RouterLink>
    </div>
  </div>
</template>

