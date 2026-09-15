import { Draw } from '../draw/Draw'

export class HistoryManager {
  private undoStack: Array<Function> = []
  private redoStack: Array<Function> = []
  private maxRecordCount: number
  private draw: Draw

  constructor(draw: Draw) {
    this.draw = draw
    // 忽略第一次历史记录
    this.maxRecordCount = draw.getOptions().historyMaxRecordCount + 1
  }

  public undo() {
    console.log('[DEBUG history] undo 调用, undoStack长度=', this.undoStack.length,
      '栈顶来源=', (this.undoStack[this.undoStack.length - 1] as any)?.__historySource,
      '待弹出来源=', (this.undoStack[this.undoStack.length - 2] as any)?.__historySource)
    if (this.undoStack.length > 1) {
      const pop = this.undoStack.pop()!
      this.redoStack.push(pop)
      if (this.undoStack.length) {
        console.log('[DEBUG history] undo 执行恢复 fn, 来源=',
          (this.undoStack[this.undoStack.length - 1] as any)?.__historySource)
        this.undoStack[this.undoStack.length - 1]()
        const _el = (this as any).draw?.getElementList?.() || []
        const _break = _el.filter((e: any) => e.value === '\n').length
        const _ctrl = _el.filter((e: any) => e.control).length
        console.log('[DEBUG history] undo 恢复后: elementList长度=', _el.length,
          '换行数=', _break, '控件数=', _ctrl)
      }
    } else {
      console.log('[DEBUG history] undo 未执行（栈长度<=1，无可撤销）')
    }
  }

  public redo() {
    console.log('[DEBUG history] redo 调用, redoStack长度=', this.redoStack.length,
      '待应用来源=', (this.redoStack[this.redoStack.length - 1] as any)?.__historySource)
    if (this.redoStack.length) {
      const pop = this.redoStack.pop()!
      this.undoStack.push(pop)
      console.log('[DEBUG history] redo 执行恢复 fn, 来源=',
        (pop as any)?.__historySource)
      pop()
      const _el = this.draw?.getElementList?.() || []
      const _break = _el.filter((e: any) => e.value === '\n').length
      const _ctrl = _el.filter((e: any) => e.control).length
      console.log('[DEBUG history] redo 恢复后: elementList长度=', _el.length,
        '换行数=', _break, '控件数=', _ctrl)
    }
  }

  public execute(fn: Function) {
    console.log('[DEBUG history] execute 入栈, 来源=',
      (fn as any)?.__historySource, '入栈前栈长=', this.undoStack.length)
    this.undoStack.push(fn)
    if (this.redoStack.length) {
      this.redoStack = []
      console.log('[DEBUG history] execute 清空 redoStack（新操作覆盖重做）')
    }
    while (this.undoStack.length > this.maxRecordCount) {
      this.undoStack.shift()
    }
  }

  public isCanUndo(): boolean {
    return this.undoStack.length > 1
  }

  public getUndoStack(): Array<Function> {
    return this.undoStack
  }

  public getRedoStack(): Array<Function> {
    return this.redoStack
  }

  public isCanRedo(): boolean {
    return !!this.redoStack.length
  }

  public isStackEmpty(): boolean {
    return !this.undoStack.length && !this.redoStack.length
  }

  public recovery() {
    console.log('[DEBUG history] recovery 清空整个撤销栈! 之前 undoStack长度=',
      this.undoStack.length, 'redoStack长度=', this.redoStack.length)
    this.undoStack = []
    this.redoStack = []
  }

  public popUndo() {
    return this.undoStack.pop()
  }
}
