import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { authState, refreshMe } from './store'
import './styles.css'

refreshMe()

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !authState.token) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresAdmin && authState.user?.role !== 'ADMIN') return '/'
  if (to.path === '/login' && authState.token) return '/'
  window.scrollTo({ top: 0 })
})

createApp(App).use(router).mount('#app')

