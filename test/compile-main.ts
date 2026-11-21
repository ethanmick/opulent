import { execFileSync } from 'node:child_process'
import path from 'node:path'

// Worker threads run plain JavaScript, so the thread tests load dist/.
export default function compileMain(): void {
  execFileSync(path.resolve('node_modules', '.bin', 'tsc'), { stdio: 'inherit' })
}
