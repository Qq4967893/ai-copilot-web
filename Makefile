.PHONY: install dev lint fmt typecheck test test-live build check

install:
	pnpm install

dev:
	pnpm dev

lint:
	pnpm exec eslint .
	pnpm exec prettier --check .

fmt:
	pnpm exec prettier --write .
	pnpm exec eslint . --fix

typecheck:
	pnpm exec tsc --noEmit

test:
	pnpm exec vitest run

# 对接真实 ai-copilot-api 的联调用例，默认不跑（CI 里没有后端）。
test-live:
	COPILOT_LIVE_API=$${COPILOT_LIVE_API:-http://127.0.0.1:8082} pnpm exec vitest run tests/integration

build:
	pnpm exec vite build

# 技术设计 §27.1 的 CI 五步：install / lint / typecheck / test / build
check: lint typecheck test build
