import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <p className="text-muted-foreground text-sm">页面不存在</p>
      <Link to="/chat" className="text-primary text-sm underline underline-offset-2">
        回到 AI Copilot
      </Link>
    </div>
  )
}
