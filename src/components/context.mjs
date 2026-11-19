/**
 * 组件上下文：一次渲染的"世界状态"。
 *
 * 学生卷与教师卷各用一个独立 Ctx —— 这样两轨之间不可能共享可变状态，
 * 从根上避免"教师卷把学生卷题号带偏"这类问题。
 */
export class Ctx {
  constructor(profile, docProfile, variant = "student", lineCapacity = 40) {
    this.profile = profile;
    this.docProfile = docProfile;
    this.variant = variant;
    /** 每行可容纳的字数，用于预估教师卷答案需要占几行。 */
    this.lineCapacity = Math.max(8, Math.trunc(lineCapacity));
    this.warnings = [];
    this._seq = 0;
    this._sub = 0;
  }

  get isTeacher() {
    return this.variant === "teacher";
  }

  nextNo() {
    this._seq += 1;
    return this._seq;
  }

  resetNo() {
    this._seq = 0;
  }

  resetSub() {
    this._sub = 0;
  }

  nextSub() {
    this._sub += 1;
    return this._sub;
  }
}
