import { ControlType } from '../../../../dataset/enum/Control'
import { IValueSet } from '../../../../interface/Control'
import { Draw } from '../../Draw'

export interface IAssociationSyncPayload {
  associationId: string
  value: string | number
  controlType: ControlType
  sourceDraw: Draw
  sourceControlId: string
  multiSelectDelimiter?: string
  valueSets?: IValueSet[]
}

export class AssociationStateManager {
  private static instance: AssociationStateManager
  private associationStates: Map<string, { value: string | number; controlType: ControlType; multiSelectDelimiter?: string; valueSets?: IValueSet[] }> = new Map()
  private syncingAssociationId: string | null = null
  private focusedAssociationId: string | null = null
  private editorDraws: Set<Draw> = new Set()

  private constructor() {}

  public static getInstance(): AssociationStateManager {
    if (AssociationStateManager.instance) {
      return AssociationStateManager.instance
    }
    AssociationStateManager.instance = new AssociationStateManager()
    return AssociationStateManager.instance
  }

  public registerEditor(draw: Draw): void {
    this.editorDraws.add(draw)
  }

  public unregisterEditor(draw: Draw): void {
    this.editorDraws.delete(draw)
  }

  public setFocusedAssociation(associationId: string | null): void {
    this.focusedAssociationId = associationId
  }

  public getFocusedAssociation(): string | null {
    return this.focusedAssociationId
  }

  public isFocused(associationId: string): boolean {
    return this.focusedAssociationId === associationId
  }

  public getCurrentValue(associationId: string): string | number | undefined {
    return this.associationStates.get(associationId)?.value
  }

  public getMultiSelectDelimiter(associationId: string): string | undefined {
    return this.associationStates.get(associationId)?.multiSelectDelimiter
  }

  public getValueSets(associationId: string): IValueSet[] | undefined {
    return this.associationStates.get(associationId)?.valueSets
  }

  public setValue(
    associationId: string,
    value: string | number,
    controlType: ControlType,
    sourceDraw: Draw,
    sourceControlId: string,
    multiSelectDelimiter?: string,
    valueSets?: IValueSet[]
  ): void {
    if (!associationId || !sourceControlId) return
    if (this.syncingAssociationId === associationId) return

    const state = this.associationStates.get(associationId)
    // 比较 value、multiSelectDelimiter 和 valueSets
    const valueSetsChanged = valueSets && state?.valueSets
      ? JSON.stringify(valueSets) !== JSON.stringify(state.valueSets)
      : valueSets !== state?.valueSets


    if (state?.value === value && state?.multiSelectDelimiter === multiSelectDelimiter && !valueSetsChanged) return


    this.associationStates.set(associationId, { value, controlType, multiSelectDelimiter, valueSets })
    this.syncingAssociationId = associationId
    try {
      this.syncAllEditors(associationId, value, controlType, sourceDraw, sourceControlId, multiSelectDelimiter, valueSets)
    } finally {
      this.syncingAssociationId = null
    }
  }

  private syncAllEditors(
    associationId: string,
    value: string | number,
    controlType: ControlType,
    sourceDraw: Draw,
    sourceControlId: string,
    multiSelectDelimiter?: string,
    valueSets?: IValueSet[]
  ): void {
    this.editorDraws.forEach(draw => {
      draw.getControl().syncAssociationValue(
        associationId,
        value,
        controlType,
        draw === sourceDraw ? sourceControlId : '',
        multiSelectDelimiter,
        valueSets
      )
    })
  }

  public clearAssociation(associationId: string): void {
    this.associationStates.delete(associationId)
  }

  public getAllAssociationIds(): string[] {
    return Array.from(this.associationStates.keys())
  }

  public isSyncing(associationId: string): boolean {
    return this.syncingAssociationId === associationId
  }
}