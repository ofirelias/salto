/*
*                      Copyright 2020 Salto Labs Ltd.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with
* the License.  You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
import {
  AdditionDiff, ModificationDiff, RemovalDiff, ActionName,
} from '@salto-io/dag'
import {
  ObjectType, InstanceElement, Field, PrimitiveType, isInstanceElement, isObjectType, isField,
} from './elements'
import { ElemID } from './element_id'
import { Values, Value } from './values'

export { ActionName }

export type ChangeDataType = ObjectType | InstanceElement | Field | PrimitiveType
export type AdditionChange<T> = AdditionDiff<T>
export type ModificationChange<T> = ModificationDiff<T>
export type RemovalChange<T> = RemovalDiff<T>
export type Change<T = ChangeDataType> =
  AdditionChange<T> | ModificationChange<T> | RemovalChange<T>

export const isModificationChange = <T>(change: Change<T>): change is ModificationChange<T> =>
  change.action === 'modify'
export const isRemovalChange = <T>(change: Change<T>): change is RemovalChange<T> =>
  change.action === 'remove'
export const isAdditionChange = <T>(change: Change<T>): change is AdditionChange<T> =>
  change.action === 'add'
export const isAdditionOrModificationChange = <T>(
  change: Change<T>
): change is AdditionChange<T> | ModificationChange<T> => (
    isAdditionChange(change) || isModificationChange(change)
  )
export const isAdditionOrRemovalChange = <T>(
  change: Change<T>
): change is AdditionChange<T> | RemovalChange<T> => (
    isAdditionChange(change) || isRemovalChange(change)
  )

export const getChangeElement = <T>(change: Change<T>): T =>
  (change.action === 'remove' ? change.data.before : change.data.after)

export const isInstanceChange = (change: Change): change is Change<InstanceElement> => (
  isInstanceElement(getChangeElement(change))
)

export const isObjectTypeChange = (change: Change): change is Change<ObjectType> => (
  isObjectType(getChangeElement(change))
)

export const isFieldChange = (change: Change): change is Change<Field> => (
  isField(getChangeElement(change))
)

export type DetailedChange<T = ChangeDataType | Values | Value> =
  Change<T> & {
    id: ElemID
    path?: string[]
  }

export type ChangeParams = { before?: ChangeDataType; after?: ChangeDataType }

export const toChange = ({ before, after }: ChangeParams): Change => {
  if (before !== undefined && after !== undefined) {
    return { action: 'modify', data: { before, after } }
  }
  if (before !== undefined) {
    return { action: 'remove', data: { before } }
  }
  if (after !== undefined) {
    return { action: 'add', data: { after } }
  }
  throw new Error('Must provide before or after')
}
