export enum MoveDirection {
  UP = 'top',
  DOWN = 'down',
  LEFT = 'left',
  RIGHT = 'right',
  // 自动模式：用于鼠标点击等场景，由 moveCursorToVisible 依据点击行被截位置
  // （顶部被截→滚到视口顶部；底部被截→滚到视口底部）自行决定滚动方向
  AUTO = 'auto'
}
