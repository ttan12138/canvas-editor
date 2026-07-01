import { ControlType } from '../../../../dataset/enum/Control'
import { Draw } from '../../Draw'

export interface IAssociationSyncPayload {
  associationId: string
  value: string | number
  controlType: ControlType
  sourceDraw: Draw
  sourceControlId: string
}

export class AssociationStateManager {
  private static instance: AssociationStateManager
  private associationStates: Map<string, { value: string | number; controlType: ControlType }> = new Map()
  private syncingAssociationId: string | null = null
  private editorDraws: Set<Draw> = new Set()

  private constructor() {}

  public static getInstance(): AssociationStateManager {
    if (!AssociationStateManager.instance) {
      AssociationStateManager.instance = new AssociationStateManager()
    }
    return AssociationStateManager.instance
  }

  public registerEditor(draw: Draw): void {
    this.editorDraws.add(draw)
  }

  public unregisterEditor(draw: Draw): void {
    this.editorDraws.delete(draw)
  }

  public getCurrentValue(associationId: string): string | number | undefined {
    return this.associationStates.get(associationId)?.value
  }

  public setValue(
    associationId: string,
    value: string | number,
    controlType: ControlType,
    sourceDraw: Draw,
    sourceControlId: string
  ): void {
    if (!associationId || !sourceControlId) return
    if (this.syncingAssociationId === associationId) return

    const state = this.associationStates.get(associationId)
    if (state?.value === value) return

    this.associationStates.set(associationId, { value, controlType })
    this.syncingAssociationId = associationId
    try {
      this.syncAllEditors(associationId, value, controlType, sourceDraw, sourceControlId)
    } finally {
      this.syncingAssociationId = null
    }
  }

  private syncAllEditors(
    associationId: string,
    value: string | number,
    controlType: ControlType,
    sourceDraw: Draw,
    sourceControlId: string
  ): void {
    this.editorDraws.forEach(draw => {
      draw.getControl().syncAssociationValue(
        associationId,
        value,
        controlType,
        draw === sourceDraw ? sourceControlId : ''
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
