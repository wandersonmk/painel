export default defineNuxtPlugin(() => {
  // Aplica a preferencia antes da montagem dos layouts. Assim, atualizar ou
  // navegar diretamente para uma pagina nao redefine o tema escolhido.
  useTheme().init()
})
