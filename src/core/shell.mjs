/** 子进程工具：统一超时、编码与大缓冲，避免各处 spawn 参数漂移。 */
import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

/** 在 PATH 中查找可执行文件，找不到返回空串。 */
export function onPath(name) {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // 不是可执行文件，继续找
    }
  }
  return "";
}

/**
 * 同步执行命令。Chrome 的 --dump-dom 输出可达数百 KB，
 * 默认 1MB 缓冲在多题量卷子上会截断，因此显式放大。
 */
export function run(cmd, { timeoutMs = 180_000, maxBuffer = 64 * 1024 * 1024 } = {}) {
  const proc = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf8", timeout: timeoutMs, maxBuffer });
  return {
    status: proc.status ?? -1,
    stdout: proc.stdout ?? "",
    stderr: proc.stderr ?? "",
    error: proc.error,
  };
}
