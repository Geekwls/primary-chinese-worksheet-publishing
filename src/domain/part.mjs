/** 排版数据模型：排版原子（Part）与已定位块（Block）。 */
import { roundHalfEven } from "../core/format.mjs";

/**
 * 排版原子：可被独立测量与定位的最小排版单元。
 *
 * role 语义：
 *   doc_head  卷头
 *   section   大题标题（keepNext，避免标题孤行）
 *   q_head    题干（keepNext，题干必须与首行作答区同页）
 *   q_body    作答区/内容区
 *   q_tail    题目尾部间距
 *   exp       教师解析页内容
 */
export class Part {
  constructor(pid, html = "", opts = {}) {
    this.pid = pid;
    this.html = html;
    this.cls = opts.cls ?? "";
    this.group = opts.group ?? "";
    this.role = opts.role ?? "q_body";
    this.keepNext = opts.keepNext ?? false;
    this.splittable = opts.splittable ?? false;
    this.label = opts.label ?? "";
    // 生成该 Part 的布局 AST 节点（经 astPart 产出时存在；供测试断言与未来多渲染器消费）
    this.ast = opts.ast ?? null;
  }
}

/** 分页后落到具体页面的块，坐标单位为毫米。 */
export class Block {
  constructor(pid, group, role, cls, x, y, width, height, label = "") {
    this.pid = pid;
    this.group = group;
    this.role = role;
    this.cls = cls;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.label = label;
  }

  asDict() {
    return {
      block_id: this.pid,
      question_id: this.group,
      role: this.role,
      x: roundHalfEven(this.x, 2),
      y: roundHalfEven(this.y, 2),
      width: roundHalfEven(this.width, 2),
      height: roundHalfEven(this.height, 2),
      label: this.label,
    };
  }
}
