<template>
  <div>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <!-- ClientOnly de propósito: os dois usam <Teleport to="body">, e no SSR
         o Vue casa os nós teleportados por posição — o container do toast
         acabava sendo comparado com o placeholder de outro modal, gerando
         "Hydration node mismatch". Nada aqui precisa de SSR: toast só existe
         depois de uma ação do usuário e o modal do parceiro depende de estado
         de sessão. -->
    <ClientOnly>
      <AppToast />
      <ParceiroBloqueadoModal />
    </ClientOnly>
  </div>
</template>
