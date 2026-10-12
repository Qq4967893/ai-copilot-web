import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// 传输层模块 —— 唯一碰 fetch 的地方。只允许 src/api 内部和 src/features 直接 import。
// 注意 @/api/types 和 @/api/events 不在此列：它们是纯类型模块，组件用来标注 props
// 是正常的，不构成分层违规。
const TRANSPORT = [
  '@/api/client',
  '@/api/sse',
  '@/api/conversations',
  '@/api/feedback',
  '@/api/health',
]

const RELATIVE = {
  group: ['../*'],
  message: '用 @/ 绝对路径，不要 ../ 跨目录引用',
}

// no-restricted-imports 在后面的 config 对象里会整条覆盖前面的，所以每个目录级
// 规则都得把全局的 RELATIVE 一起带上。
const restrict = (...groups) => ({
  'no-restricted-imports': ['error', { patterns: [RELATIVE, ...groups] }],
})

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      // 下划线前缀表示「签名需要这个位置，但用不上」—— mock 函数里很常见。
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      ...restrict(),
    },
  },
  {
    // 路由页不直接调传输层，走 features/ 的 hook。
    files: ['src/routes/**/*.{ts,tsx}'],
    rules: restrict({
      group: TRANSPORT,
      message: 'routes 不直接调传输层，走 features/ 的 hook（见 README 分层规则）',
    }),
  },
  {
    // components 是纯展示层。
    files: ['src/components/**/*.{ts,tsx}'],
    rules: restrict(
      {
        group: TRANSPORT,
        message: 'components 不碰传输层，数据由 props 传入（见 README 分层规则）',
      },
      {
        group: ['@/features/*', '@/features/**'],
        message: 'components 不依赖 features（见 README 分层规则）',
      },
    ),
  },
  {
    // lib 是最底层，只能被别人依赖。@/api/types 和 @/api/events 是纯类型，不算依赖。
    files: ['src/lib/**/*.{ts,tsx}'],
    rules: restrict({
      group: [
        ...TRANSPORT,
        '@/features/*',
        '@/features/**',
        '@/components/*',
        '@/components/**',
        '@/routes/*',
        '@/routes/**',
      ],
      message: 'lib 是最底层，不能反向依赖上层（见 README 分层规则）',
    }),
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: restrict({
      group: ['@/routes/*', '@/routes/**'],
      message: 'features 不依赖 routes（见 README 分层规则）',
    }),
  },
  {
    files: ['vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
)
