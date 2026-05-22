<script setup lang="ts">
const route = useRoute()
const { isCollapsed, isMobileOpen, toggle, closeMobile } = useSidebar()
const { user } = useAuth()

const navItems = [
  { label: 'Dashboard', icon: 'fa-gauge-high', to: '/dashboard' },
  { label: 'Clientes', icon: 'fa-users', to: '/admin' },
  { label: 'Financeiro', icon: 'fa-wallet', to: '/financeiro' },
]

function isActive(to: string) {
  return route.path === to
}

const userInitial = computed(() => user.value?.email?.charAt(0).toUpperCase() || '?')

// Fecha o off-canvas mobile sempre que mudar de rota
watch(() => route.path, () => closeMobile())
</script>

<template>
  <!-- Backdrop (mobile only) -->
  <div
    v-if="isMobileOpen"
    @click="closeMobile"
    class="md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity"
    aria-hidden="true"
  />

  <aside
    class="fixed left-0 top-0 h-screen z-40 flex flex-col bg-slate-900 border-r border-slate-800 transition-[transform,width] duration-300 ease-in-out"
    :class="[
      isCollapsed ? 'md:w-16' : 'md:w-60',
      'w-60',
      isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
    ]"
  >
    <!-- Brand + collapse toggle -->
    <div
      class="flex items-center border-b border-slate-800 overflow-hidden"
      :class="isCollapsed ? 'md:px-2 md:justify-center px-3.5 justify-between gap-2 py-4' : 'px-3.5 py-4 justify-between gap-2'"
    >
      <Transition name="sidebar-label">
        <div v-if="!isCollapsed || isMobileOpen" class="overflow-hidden">
          <img
            src="/logo.wrn.png"
            alt="Agzap"
            class="h-10 w-auto object-contain"
          />
        </div>
      </Transition>
      <!-- Desktop collapse button -->
      <button
        @click="toggle"
        class="hidden md:flex shrink-0 w-7 h-7 items-center justify-center rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors duration-150"
        :title="isCollapsed ? 'Expandir menu' : 'Colapsar menu'"
        :aria-label="isCollapsed ? 'Expandir menu' : 'Colapsar menu'"
        type="button"
      >
        <i
          class="fa-solid text-xs transition-transform duration-300"
          :class="isCollapsed ? 'fa-angles-right' : 'fa-angles-left'"
          aria-hidden="true"
        />
      </button>
      <!-- Mobile close button -->
      <button
        @click="closeMobile"
        class="md:hidden shrink-0 w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors duration-150"
        aria-label="Fechar menu"
        type="button"
      >
        <i class="fa-solid fa-xmark text-sm" aria-hidden="true" />
      </button>
    </div>

    <!-- Nav items -->
    <nav class="flex-1 py-4 px-2 flex flex-col gap-1 overflow-hidden">
      <NuxtLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="flex items-center gap-3 px-2.5 py-2.5 rounded transition-all duration-150 group relative"
        :class="isActive(item.to)
          ? 'bg-purple-600 text-white shadow-md shadow-purple-600/40'
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'"
        :title="isCollapsed && !isMobileOpen ? item.label : undefined"
      >
        <i
          class="fa-solid text-sm shrink-0 transition-colors"
          :class="[item.icon, isActive(item.to) ? 'text-white' : 'text-slate-500 group-hover:text-slate-200']"
          aria-hidden="true"
        />
        <Transition name="sidebar-label">
          <span
            v-if="!isCollapsed || isMobileOpen"
            class="text-sm font-medium truncate whitespace-nowrap leading-none"
          >{{ item.label }}</span>
        </Transition>

        <!-- Tooltip when collapsed (desktop only) -->
        <div
          v-if="isCollapsed && !isMobileOpen"
          class="hidden md:block absolute left-full ml-3 px-2.5 py-1.5 bg-slate-800 text-slate-100 text-xs font-medium rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 shadow-xl border border-slate-700"
        >{{ item.label }}</div>
      </NuxtLink>
    </nav>

    <!-- User footer -->
    <div class="border-t border-slate-800">
      <div
        v-if="!isCollapsed || isMobileOpen"
        class="px-3 py-3 flex items-center gap-2.5"
      >
        <div class="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center shrink-0 shadow">
          <span class="text-white text-xs font-bold">{{ userInitial }}</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[11px] font-medium text-slate-300 truncate leading-tight">{{ user?.email || 'Não autenticado' }}</p>
          <div class="flex items-center gap-1.5 mt-0.5">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
            <span class="text-[10px] text-slate-500">Online</span>
          </div>
        </div>
      </div>
      <div v-else class="px-2 py-3 flex justify-center">
        <div class="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center shrink-0 shadow" :title="user?.email">
          <span class="text-white text-xs font-bold">{{ userInitial }}</span>
        </div>
      </div>
    </div>

  </aside>
</template>

<style scoped>
.sidebar-label-enter-active {
  transition: opacity 0.2s ease, max-width 0.3s ease;
  max-width: 200px;
}
.sidebar-label-leave-active {
  transition: opacity 0.1s ease, max-width 0.2s ease;
  max-width: 200px;
}
.sidebar-label-enter-from,
.sidebar-label-leave-to {
  opacity: 0;
  max-width: 0;
}
</style>
