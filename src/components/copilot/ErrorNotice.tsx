import { AppError, describeError } from '@/api/errors'
import { cn } from '@/lib/cn'

/**
 * 统一错误展示。
 *
 * 展示三样东西：给运营看的中文说明、给工程看的错误码、以及 request id ——
 * 后者能直接拿去 ai-copilot-api 的日志里搜，两边是同一个值（见 lib/request-id.ts）。
 *
 * PRD §10.7.2：技术实现细节不得直接展示给运营用户。所以后端原始 message 只作为
 * 次要信息小字展示，主文案走 describeError()。
 */
export function ErrorNotice({
  error,
  className,
  onRetry,
}: {
  error: unknown
  className?: string
  onRetry?: () => void
}) {
  const appError = error instanceof AppError ? error : null

  return (
    <div
      role="alert"
      className={cn(
        'border-destructive/30 bg-destructive/5 rounded-md border px-3 py-2 text-sm',
        className,
      )}
    >
      <p className="text-destructive">{describeError(error)}</p>

      {appError && (
        <p className="text-muted-foreground mt-1 font-mono text-xs">
          {appError.code}
          {appError.message ? ` · ${appError.message}` : ''}
          {appError.requestId ? ` · ${appError.requestId}` : ''}
        </p>
      )}

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-primary mt-2 text-xs underline underline-offset-2"
        >
          重试
        </button>
      )}
    </div>
  )
}
