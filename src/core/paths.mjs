/** Skill 内部路径解析。所有资产路径只在这里出现一次。 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)); // <root>/src/core

export const SKILL_ROOT = resolve(HERE, "..", "..");
export const ASSETS = join(SKILL_ROOT, "assets");
export const DESIGN_SYSTEM_DIR = join(ASSETS, "design-system");
export const TOKENS_DIR = join(ASSETS, "tokens");
export const PROFILES_DIR = join(ASSETS, "profiles");
export const DOC_PROFILES_DIR = join(PROFILES_DIR, "documents");
export const SCENARIOS_DIR = join(PROFILES_DIR, "scenarios");
export const PRINTER_PROFILES_DIR = join(PROFILES_DIR, "printers");
export const CSS_DIR = join(ASSETS, "css");
export const SCHEMAS_DIR = join(ASSETS, "schemas");
