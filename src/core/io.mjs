/** 文件读写：集中处理编码、目录创建与 JSON 序列化风格。 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function readText(path) {
  return readFileSync(path, "utf8");
}

export function writeText(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

/** 与 Python json.dumps(..., ensure_ascii=False, indent=2) 输出保持一致（无末尾换行）。 */
export function writeJson(path, value) {
  writeText(path, JSON.stringify(value, null, 2));
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
  return path;
}

export function readJson(path) {
  return JSON.parse(readText(path));
}
