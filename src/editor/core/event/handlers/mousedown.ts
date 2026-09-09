import { ImageDisplay } from '../../../dataset/enum/Common'
import { EditorMode } from '../../../dataset/enum/Editor'
import { ElementType } from '../../../dataset/enum/Element'
import { MouseEventButton } from '../../../dataset/enum/Event'
import { MoveDirection } from '../../../dataset/enum/Observer'
import { ControlComponent } from '../../../dataset/enum/Control'
import { ControlType } from '../../../dataset/enum/Control'
import { IPreviewerDrawOption } from '../../../interface/Previewer'
import { deepClone } from '../../../utils'
import { isMod } from '../../../utils/hotkey'
import { CheckboxControl } from '../../draw/control/checkbox/CheckboxControl'
import { RadioControl } from '../../draw/control/radio/RadioControl'
import { CanvasEvent } from '../CanvasEvent'
import { IElement } from '../../../interface/Element'
import { Draw } from '../../draw/Draw'
import { GlobalEvent } from '../GlobalEvent'

export function setRangeCache(host: CanvasEvent) {
  const draw = host.getDraw()
  const position = draw.getPosition()
  const rangeManager = draw.getRange()
  // 缓存选区上下文信息
  host.isAllowDrag = true
  host.cacheRange = deepClone(rangeManager.getRange())
  host.cacheElementList = draw.getElementList()
  host.cachePositionList = position.getPositionList()
  host.cachePositionContext = position.getPositionContext()
}

export function hitCheckbox(element: IElement, draw: Draw) {
  const { checkbox, control } = element
  // 复选框不在控件内独立控制
  if (!control) {
    draw.getCheckboxParticle().setSelect(element)
  } else {
    const codes = control?.code ? control.code.split(',') : []
    if (checkbox?.value) {
      const codeIndex = codes.findIndex(c => c === checkbox.code)
      codes.splice(codeIndex, 1)
    } else {
      if (checkbox?.code) {
        codes.push(checkbox.code)
      }
    }
    const activeControl = draw.getControl().getActiveControl()
    if (activeControl instanceof CheckboxControl) {
      activeControl.setSelect(codes)
    }
  }
}

export function hitRadio(element: IElement, draw: Draw) {
  const { radio, control } = element
  // 单选框不在控件内独立控制
  if (!control) {
    draw.getRadioParticle().setSelect(element)
  } else {
    const codes = radio?.code ? [radio.code] : []
    const activeControl = draw.getControl().getActiveControl()
    if (activeControl instanceof RadioControl) {
      activeControl.setSelect(codes)
    }
  }
}

export function mousedown(evt: MouseEvent, host: CanvasEvent) {
  const draw = host.getDraw()
  let isReadonly = draw.isReadonly()
  const rangeManager = draw.getRange()
  const position = draw.getPosition()
  // 存在选区时忽略右键点击
  const range = rangeManager.getRange()
  if (
    evt.button === MouseEventButton.RIGHT &&
    (range.isCrossRowCol || !rangeManager.getIsCollapsed())
  ) {
    // 关闭弹窗类控件，避免下拉列表与右键菜单同时显示
    draw.getControl().destroyControl({ isEmitEvent: false })
    return
  }
  // 是否是选区拖拽
  if (!host.isAllowDrag) {
    if (!isReadonly && range.startIndex !== range.endIndex) {
      const isPointInRange = rangeManager.getIsPointInRange(
        evt.offsetX,
        evt.offsetY
      )
      if (isPointInRange) {
        setRangeCache(host)
        return
      }
    }
  }
  const target = evt.target as HTMLDivElement
  const pageIndex = target.dataset.index
  // 设置pageNo
  if (pageIndex) {
    draw.setPageNo(Number(pageIndex))
  }
  host.isAllowSelection = true
  // 记录按下时的 client 坐标，供 mousemove 判定单纯点击
  host.mouseDownClientX = evt.clientX
  host.mouseDownClientY = evt.clientY
  // 缓存旧上下文信息
  const oldPositionContext = deepClone(position.getPositionContext())
  const positionResult = position.adjustPositionContext({
    x: evt.offsetX,
    y: evt.offsetY
  })
  if (!positionResult) return
  const {
    index,
    isDirectHit,
    isCheckbox,
    isRadio,
    isImage,
    isLabel,
    isTable,
    tdValueIndex,
    hitLineStartIndex
  } = positionResult
  const elementList = draw.getElementList()
  const positionList = position.getPositionList()
  const positionIndex = isTable ? tdValueIndex! : index
  // 记录选区开始位置
  host.mouseDownStartPosition = {
    ...positionResult,
    index: positionIndex,
    x: evt.offsetX,
    y: evt.offsetY
  }
  const curElement = elementList[positionIndex]
  // 绘制
  const isDirectHitImage = !!(isDirectHit && isImage)
  const isDirectHitCheckbox = !!(isDirectHit && isCheckbox)
  const isDirectHitRadio = !!(isDirectHit && isRadio)
  const isDirectHitLabel = !!(isDirectHit && isLabel)
  if (~index) {
    let startIndex = positionIndex
    let endIndex = positionIndex
    // shift激活时进行选区处理
    if (evt.shiftKey) {
      const { startIndex: oldStartIndex } = rangeManager.getRange()
      if (~oldStartIndex) {
        const newPositionContext = position.getPositionContext()
        if (newPositionContext.tdId === oldPositionContext.tdId) {
          if (positionIndex > oldStartIndex) {
            startIndex = oldStartIndex
          } else {
            endIndex = oldStartIndex
          }
        }
      }
    }
    rangeManager.setRange(startIndex, endIndex)
    position.setCursorPosition(positionList[positionIndex])
    // 多编辑器实例：让其他编辑器隐藏光标。
    // 焦点交给 drawCursor 的 setTimeout 异步聚焦（在浏览器默认焦点处理之后再聚焦，
    // 否则在 mousedown 中同步 focus 会被覆盖，导致 textarea 无法真正获得焦点、无法录入）
    GlobalEvent.blurOtherEditors(draw.getContainer())
    // 右键点击时关闭弹窗类控件，避免下拉列表与右键菜单同时显示
    if (evt.button === MouseEventButton.RIGHT) {
      draw.getControl().destroyControl({ isEmitEvent: false })
    }
    // 更新只读状态
    isReadonly = draw.isReadonly()
    // 复选框
    if (isDirectHitCheckbox && !isReadonly) {
      hitCheckbox(curElement, draw)
    } else if (isDirectHitRadio && !isReadonly) {
      hitRadio(curElement, draw)
    } else if (
      curElement.controlComponent === ControlComponent.VALUE &&
      (curElement.control?.type === ControlType.CHECKBOX ||
        curElement.control?.type === ControlType.RADIO)
    ) {
      // 向左查找
      let preIndex = positionIndex
      while (preIndex > 0) {
        const preElement = elementList[preIndex]
        if (preElement.controlComponent === ControlComponent.CHECKBOX) {
          hitCheckbox(preElement, draw)
          break
        } else if (preElement.controlComponent === ControlComponent.RADIO) {
          hitRadio(preElement, draw)
          break
        }
        preIndex--
      }
    } else {
      draw.render({
        curIndex: positionIndex,
        // 点击控件/分组等元素时 moveCursor 会改变元素布局，必须用 isCompute:true 重算位置，
        // 否则复用旧 positionList 会让文字绘制在错误坐标，产生"双影/重影"
        isCompute: true,
        isSubmitHistory: false,
        isSetCursor:
          !isDirectHitImage && !isDirectHitCheckbox && !isDirectHitRadio,
        // 鼠标点击：若点击行“只显示一半”（顶部被截或底部被截），自动滚动使其完整展示；
        // 整行已完整可见则不滚动。具体方向由 moveCursorToVisible 的 AUTO 模式判断。
        isMoveCursorToVisible: true,
        direction: MoveDirection.AUTO
      })
    }
    // 首字需定位到行首，非上一行最后一个字后
    if (hitLineStartIndex) {
      host.getDraw().getCursor().drawCursor({
        hitLineStartIndex,
        isMoveCursorToVisible: false
      })
    }
  }
  // 标签点击事件
    const eventBus = draw.getEventBus()
  if (isDirectHitLabel && eventBus.isSubscribe('labelMousedown')) {
    eventBus.emit('labelMousedown', {
      evt,
      element: curElement
    })
  }
  // 预览工具组件
  const previewer = draw.getPreviewer()
  previewer.clearResizer()
  if (isDirectHitImage) {
    const previewerDrawOption: IPreviewerDrawOption = {
      // 只读或控件外表单模式禁用拖拽
      dragDisable:
        isReadonly ||
        (!curElement.controlId && draw.getMode() === EditorMode.FORM)
    }
    if (curElement.type === ElementType.LATEX) {
      previewerDrawOption.mime = 'svg'
      previewerDrawOption.srcKey = 'laTexSVG'
    }
    previewer.drawResizer(
      curElement,
      positionList[positionIndex],
      previewerDrawOption
    )
    // 光标事件代理丢失，重新定位
    draw.getCursor().drawCursor({
      isShow: false
    })
    // 点击图片允许拖拽调整位置
    setRangeCache(host)
    // 浮动元素创建镜像图片
    if (
      curElement.imgDisplay === ImageDisplay.SURROUND ||
      curElement.imgDisplay === ImageDisplay.FLOAT_TOP ||
      curElement.imgDisplay === ImageDisplay.FLOAT_BOTTOM
    ) {
      draw.getImageParticle().createFloatImage(curElement)
    }
    // 图片点击事件
    if (eventBus.isSubscribe('imageMousedown')) {
      eventBus.emit('imageMousedown', {
        evt,
        element: curElement
      })
    }
  }
  // 表格工具组件
  const tableTool = draw.getTableTool()
  tableTool.dispose()
  if (isTable && !isReadonly && draw.getMode() !== EditorMode.FORM) {
    tableTool.render()
  }
  // 超链接
  const hyperlinkParticle = draw.getHyperlinkParticle()
  hyperlinkParticle.clearHyperlinkPopup()
  if (curElement.type === ElementType.HYPERLINK) {
    if (isMod(evt)) {
      hyperlinkParticle.openHyperlink(curElement)
    } else {
      hyperlinkParticle.drawHyperlinkPopup(curElement, positionList[positionIndex])
    }
  }
  // 日期控件
  const dateParticle = draw.getDateParticle()
  dateParticle.clearDatePicker()
  if (curElement.type === ElementType.DATE && !isReadonly) {
    dateParticle.renderDatePicker(curElement, positionList[positionIndex])
  }
}
