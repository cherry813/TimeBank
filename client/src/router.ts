import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('./views/HomeView.vue'),
    },
    {
      path: '/market',
      name: 'market',
      component: () => import('./views/MarketView.vue'),
    },
    {
      path: '/listings/:id',
      name: 'listing',
      component: () => import('./views/ListingDetailView.vue'),
    },
    {
      path: '/listings/:id/edit',
      name: 'listing-edit',
      meta: { requiresAuth: true },
      component: () => import('./views/EditListingView.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('./views/LoginView.vue'),
    },
    {
      path: '/presentation',
      name: 'presentation',
      component: () => import('./views/PresentationView.vue'),
    },
    {
      path: '/publish',
      name: 'publish',
      meta: { requiresAuth: true },
      component: () => import('./views/PublishView.vue'),
    },
    {
      path: '/orders',
      name: 'orders',
      meta: { requiresAuth: true },
      component: () => import('./views/OrdersView.vue'),
    },
    {
      path: '/chat',
      name: 'chat',
      meta: { requiresAuth: true },
      component: () => import('./views/ChatView.vue'),
    },
    {
      path: '/profile',
      name: 'profile',
      meta: { requiresAuth: true },
      component: () => import('./views/ProfileView.vue'),
    },
    {
      path: '/favorites',
      name: 'favorites',
      meta: { requiresAuth: true },
      component: () => import('./views/FavoritesView.vue'),
    },
    {
      path: '/users/:id',
      name: 'user-profile',
      component: () => import('./views/UserProfileView.vue'),
    },
    {
      path: '/notifications',
      name: 'notifications',
      meta: { requiresAuth: true },
      component: () => import('./views/NotificationsView.vue'),
    },
    {
      path: '/admin',
      name: 'admin-dashboard',
      meta: { requiresAuth: true, requiresAdmin: true },
      component: () => import('./views/AdminDashboardView.vue'),
    },
    {
      path: '/admin/disputes',
      name: 'admin-disputes',
      meta: { requiresAuth: true, requiresAdmin: true },
      component: () => import('./views/AdminDisputesView.vue'),
    },
    {
      path: '/admin/reports',
      name: 'admin-reports',
      meta: { requiresAuth: true, requiresAdmin: true },
      component: () => import('./views/AdminReportsView.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router

