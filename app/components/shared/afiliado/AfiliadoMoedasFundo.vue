<script setup lang="ts">
/**
 * Fundo decorativo do cadastro de afiliado (pedido do dono, 09/10/2026):
 * moedas de ouro caindo do topo e um brilho dourado suave no rodapé da tela,
 * onde as moedas somem. (O dono não quis monte de ouro nem cédulas.)
 *
 * Só visual: pointer-events none, z-index abaixo do conteúdo, nada externo
 * (SVG e CSS inline). As moedas são montadas só no cliente (flag `montado`),
 * então o SSR não entrega nada sorteado e não há risco de hydration mismatch.
 *
 * - Moedas: 3 camadas por moeda, todas animando só transform/opacity
 *   (queda · balanço · giro 3D em rotateY com espessura de verdade).
 * - Aba oculta: animações pausadas (visibilitychange).
 * - prefers-reduced-motion: poucas moedas paradas + o brilho, sem animação.
 * - Celular (< 640 px): 8 moedas.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

const montado = ref(false)
const pausado = ref(false)

function aoMudarVisibilidade() {
  pausado.value = document.hidden
}

onMounted(() => {
  pausado.value = document.hidden
  document.addEventListener('visibilitychange', aoMudarVisibilidade)
  montado.value = true
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', aoMudarVisibilidade)
})

// Sorteio com semente fixa: o desenho sai sempre igual.
function sorteador(semente: number) {
  let s = semente >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const f1 = (n: number) => n.toFixed(1)
const f2 = (n: number) => n.toFixed(2)

const TOTAL_MOEDAS = 18
const MOEDAS_NO_CELULAR = 8
const MOEDAS_PARADAS = 5 // as que ficam na tela com prefers-reduced-motion

const moedas = (() => {
  const r = sorteador(20261009)
  return Array.from({ length: TOTAL_MOEDAS }, (_, i) => {
    const prof = r() // 0 = longe, 1 = perto
    const tam = Math.round(16 + prof * 30) // 16 a 46 px
    const dur = 15 - prof * 6 + r() * 2 // as de longe caem mais devagar
    // Sequência áurea: espalha bem na horizontal, inclusive as 8 do celular.
    const x = 3 + ((i * 0.618034 + r() * 0.08) % 1) * 94
    const desfoque = prof < 0.22 ? 1.6 : prof < 0.4 ? 0.7 : 0
    return {
      id: i,
      extra: i >= MOEDAS_NO_CELULAR,
      parada: i < MOEDAS_PARADAS,
      desfocada: desfoque > 0,
      estilo: {
        'left': `${f2(x)}%`,
        '--tam': `${tam}px`,
        '--dur': `${f2(dur)}s`,
        '--atraso': `${f2(-r() * dur)}s`,
        '--balanco': `${f1(6 + prof * 18)}px`,
        '--balanco-dur': `${f2(2.6 + r() * 2.2)}s`,
        '--giro-dur': `${f2(2.2 + r() * 2.4)}s`,
        '--giro-sentido': r() < 0.5 ? 'normal' : 'reverse',
        '--incl': `${f1((r() * 2 - 1) * 28)}deg`,
        '--opac': f2(0.5 + prof * 0.5),
        '--desfoque': `${desfoque}px`,
        '--y': `${f1(10 + r() * 55)}vh`,
      } as Record<string, string>,
    }
  })
})()
</script>

<template>
  <div class="afm-raiz" :class="{ 'afm-pausado': pausado }" aria-hidden="true">
    <template v-if="montado">
      <!-- Peças reaproveitadas pelos <use> abaixo. Não pode ser display:none
           (alguns navegadores deixam de pintar os gradientes). -->
      <svg class="afm-defs" width="0" height="0" focusable="false">
        <defs>
          <linearGradient id="afm-g-aro" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#fff0a3" />
            <stop offset=".3" stop-color="#f2c14e" />
            <stop offset=".62" stop-color="#b37712" />
            <stop offset=".85" stop-color="#e5ae35" />
            <stop offset="1" stop-color="#fbe08a" />
          </linearGradient>
          <radialGradient id="afm-g-miolo" cx=".38" cy=".32" r=".75">
            <stop offset="0" stop-color="#fff8d2" />
            <stop offset=".25" stop-color="#ffe27a" />
            <stop offset=".6" stop-color="#f0b52e" />
            <stop offset="1" stop-color="#b97c12" />
          </radialGradient>
          <linearGradient id="afm-g-cifrao" gradientUnits="userSpaceOnUse" x1="0" y1="28" x2="0" y2="72">
            <stop offset="0" stop-color="#f9d25c" />
            <stop offset="1" stop-color="#c58711" />
          </linearGradient>
          <radialGradient id="afm-g-brilho">
            <stop offset="0" stop-color="#fff" stop-opacity=".65" />
            <stop offset="1" stop-color="#fff" stop-opacity="0" />
          </radialGradient>

          <!-- "$" em traço (coordenadas 0–100) -->
          <g id="afm-cifrao" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <path d="M60.5 38.5C58.5 34.8 54.8 33 50 33C44.2 33 40 36 40 41C40 46.6 45 48.2 50 49.6C55.4 51.1 60.5 53 60.5 59C60.5 64.2 56 67 50 67C45 67 41.2 65 39.4 61.2" stroke-width="6" />
            <path d="M50 27.5V72.5" stroke-width="4.4" />
          </g>

          <!-- Face da moeda (0–100): aro serrilhado, miolo, "$" em relevo, brilho -->
          <g id="afm-face">
            <circle cx="50" cy="50" r="49.5" fill="url(#afm-g-aro)" />
            <circle cx="50" cy="50" r="45.6" fill="none" stroke="#8a5606" stroke-opacity=".5" stroke-width="2.6" stroke-dasharray="1.3 2.1" />
            <circle cx="50" cy="50" r="41.5" fill="url(#afm-g-miolo)" />
            <circle cx="50" cy="50" r="41.5" fill="none" stroke="#94600a" stroke-opacity=".65" stroke-width="1.6" />
            <circle cx="50" cy="50" r="39.2" fill="none" stroke="#fff3b0" stroke-opacity=".5" stroke-width="1" />
            <use href="#afm-cifrao" stroke="#8a5704" stroke-opacity=".5" transform="translate(1.1 1.5)" />
            <use href="#afm-cifrao" stroke="#fff8d6" stroke-opacity=".75" transform="translate(-.7 -.8)" />
            <use href="#afm-cifrao" stroke="url(#afm-g-cifrao)" />
            <ellipse cx="35" cy="29" rx="22" ry="11" transform="rotate(-32 35 29)" fill="url(#afm-g-brilho)" />
          </g>
        </defs>
      </svg>

      <!-- Moedas caindo (fixas na janela, atrás dos cartões) -->
      <div class="afm-ceu">
        <div
          v-for="m in moedas"
          :key="m.id"
          class="afm-queda"
          :class="{ 'afm-extra': m.extra, 'afm-parada': m.parada, 'afm-desfocada': m.desfocada }"
          :style="m.estilo"
        >
          <div class="afm-balanco">
            <div class="afm-giro">
              <span class="afm-aro" style="--k: -0.33" />
              <span class="afm-aro" style="--k: 0" />
              <span class="afm-aro" style="--k: 0.33" />
              <svg class="afm-face afm-frente" viewBox="0 0 100 100" focusable="false"><use href="#afm-face" /></svg>
              <svg class="afm-face afm-verso" viewBox="0 0 100 100" focusable="false"><use href="#afm-face" /></svg>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Brilho dourado no rodapé da tela (sem objetos). Vem depois das moedas,
         então elas "afundam" nele enquanto somem. -->
    <div class="afm-horizonte" />
  </div>
</template>

<style scoped>
.afm-defs {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

/* ------------------------------------------------------------ moedas caindo */
.afm-ceu {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.afm-queda {
  --t: calc(var(--tam) * 0.09); /* espessura */
  position: absolute;
  top: 0;
  width: var(--tam);
  height: var(--tam);
  margin-left: calc(var(--tam) / -2);
  animation-name: afm-cair;
  animation-duration: var(--dur);
  animation-delay: var(--atraso);
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform, opacity;
}

.afm-balanco {
  width: 100%;
  height: 100%;
  opacity: var(--opac);
  perspective: 600px;
  animation-name: afm-balancar;
  animation-duration: var(--balanco-dur);
  animation-delay: var(--atraso);
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-direction: alternate;
}

.afm-desfocada .afm-balanco {
  filter: blur(var(--desfoque));
}

.afm-giro {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  animation-name: afm-girar;
  animation-duration: var(--giro-dur);
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-direction: var(--giro-sentido);
}

.afm-aro {
  position: absolute;
  inset: 1%;
  border-radius: 50%;
  background: radial-gradient(circle, #d39b2a 0%, #a8700f 62%, #7a4806 100%);
  transform: translateZ(calc(var(--t) * var(--k)));
}

.afm-face {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.afm-frente {
  transform: translateZ(calc(var(--t) / 2));
}

.afm-verso {
  transform: rotateY(180deg) translateZ(calc(var(--t) / 2));
}

/* Some a partir de ~3/4 da tela, onde começa o brilho do rodapé. */
@keyframes afm-cair {
  0% {
    transform: translate3d(0, -14vh, 0);
    opacity: 0;
  }
  7% {
    opacity: 1;
  }
  76% {
    opacity: 1;
  }
  100% {
    transform: translate3d(0, 102vh, 0);
    opacity: 0;
  }
}

@keyframes afm-balancar {
  from {
    transform: translateX(calc(var(--balanco) * -1)) rotate(-9deg);
  }
  to {
    transform: translateX(var(--balanco)) rotate(9deg);
  }
}

/* ease-in-out em cada meia-volta: a moeda fica mais tempo de frente e vira
   rápido quando passa de lado. */
@keyframes afm-girar {
  0% {
    transform: rotateX(var(--incl)) rotateY(0deg);
  }
  50% {
    transform: rotateX(var(--incl)) rotateY(180deg);
  }
  100% {
    transform: rotateX(var(--incl)) rotateY(360deg);
  }
}

/* ------------------------------------------------------ brilho do rodapé */
.afm-horizonte {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 36vh;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse 38% 34% at 50% 100%, rgba(253, 224, 138, 0.14), transparent 72%),
    radial-gradient(ellipse 70% 90% at 50% 100%, rgba(251, 191, 36, 0.13), rgba(245, 158, 11, 0.05) 45%, transparent 75%),
    linear-gradient(to top, rgba(251, 191, 36, 0.06), transparent 50%);
}

/* ---------------------------------------------------------- aba escondida */
.afm-pausado .afm-queda,
.afm-pausado .afm-balanco,
.afm-pausado .afm-giro {
  animation-play-state: paused;
}

/* ---------------------------------------------------------------- celular */
@media (max-width: 639.98px) {
  .afm-extra {
    display: none;
  }
}

/* ------------------------------------------------------ menos movimento */
@media (prefers-reduced-motion: reduce) {
  .afm-queda,
  .afm-balanco,
  .afm-giro {
    animation: none !important;
  }

  .afm-queda {
    display: none;
  }

  .afm-queda.afm-parada {
    display: block;
    top: var(--y);
  }

  .afm-giro {
    transform: rotateX(var(--incl)) rotateY(28deg);
  }
}
</style>
