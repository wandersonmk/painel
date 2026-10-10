import type { Config } from 'tailwindcss'

// Identidade visual do painel (09/10/2026, pedido do dono): as mesmas cores da
// página de planejamento da Rede de Conexões. Em vez de mexer tela por tela,
// as paletas `slate`/`gray` (neutros) e `purple` (destaque) foram trocadas por
// tons com um leve viés roxo — todas as telas que já usam essas classes mudam
// juntas, no claro e no escuro.
//   claro:  fundo #faf9fd · linhas #e6e2f2 · texto #1b1827 · apoio #645e7d · destaque #6d28d9
//   escuro: fundo #12101a · cartões #1b1827 · linhas #2d2942 · apoio #a39dba · destaque #a98bfa
const neutro = {
  50: '#faf9fd',
  100: '#f3f1f9',
  200: '#e6e2f2',
  300: '#d4cfe5',
  400: '#a39dba',
  500: '#645e7d',
  600: '#4f4968',
  700: '#3b3653',
  800: '#2d2942',
  900: '#1b1827',
  950: '#12101a',
}

const destaque = {
  50: '#f6f2fe',
  100: '#f1ebfd',
  200: '#e3d7fc',
  300: '#cbb6fb',
  400: '#a98bfa',
  500: '#8b5cf6',
  600: '#6d28d9',
  700: '#5b21b6',
  800: '#4c1d95',
  900: '#3b1675',
  950: '#261f3d',
}

export default {
  darkMode: 'class',
  content: [
    './app/**/*.{vue,ts,js}',
    './components/**/*.{vue,ts,js}',
    './pages/**/*.{vue,ts,js}',
    './layouts/**/*.{vue,ts,js}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Source Sans 3"', '"Segoe UI"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Sora', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', '"Cascadia Mono"', 'Consolas', 'monospace'],
      },
      borderRadius: {
        md: '0.625rem',
        lg: '0.75rem',
        xl: '0.875rem',
      },
      colors: {
        slate: neutro,
        gray: neutro,
        purple: destaque,
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: 'hsl(var(--card))',
        border: 'hsl(var(--border))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
      },
      animation: {
        blob: 'blob 7s infinite',
        gradient: 'gradient 6s ease infinite',
      },
      keyframes: {
        blob: {
          '0%, 100%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
        },
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
    },
  },
} satisfies Config
