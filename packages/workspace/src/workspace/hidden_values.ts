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
import { collections } from '@salto-io/lowerdash'
import {
  CORE_ANNOTATIONS, Element, InstanceElement,
  isInstanceElement, isType, Values, isListType,
  TypeElement,
} from '@salto-io/adapter-api'
import {
  transformElement, TransformFunc, transformValues,
} from '@salto-io/adapter-utils'
import _ from 'lodash'
import {
  updateMergedTypes,
} from '../merger'

const isHiddenType = (element: Element): boolean => isType(element)
  && (element.annotations[CORE_ANNOTATIONS.HIDDEN] === true)

export const addHiddenValuesAndHiddenTypes = (
  workspaceElements: ReadonlyArray<Element>,
  stateElements: ReadonlyArray<Element>,
): Element[] => {
  const stateElementsMap = _.keyBy(stateElements, e => e.elemID.getFullName())

  const generateValuesWithHiddenFields = (instance: InstanceElement): Values => {
    const stateElement = stateElementsMap[instance.elemID.getFullName()]
    if (isInstanceElement(stateElement)) {
      const hiddenMap = new collections.map.DefaultMap<string, Values>(() => ({}))
      const createHiddenMapCallback: TransformFunc = ({ value, path, field }) => {
        if (field?.annotations[CORE_ANNOTATIONS.HIDDEN] === true && path !== undefined) {
          hiddenMap.get(path.createParentID().getFullName())[path.name] = value
        }
        return value
      }

      transformElement({
        element: stateElement,
        transformFunc: createHiddenMapCallback,
        strict: true,
      })

      const restoreHiddenValues: TransformFunc = ({ value, path, field }) => {
        if (path !== undefined && !isListType(field?.type) && hiddenMap.has(path.getFullName())) {
          const hidden = hiddenMap.get(path.getFullName())
          return _.merge({}, value, hidden)
        }
        return value
      }
      if (hiddenMap.size === 0) {
        return instance.value
      }
      return transformValues({
        values: instance.value,
        type: stateElement.type, // Use type from state in case the type is hidden
        pathID: instance.elemID,
        transformFunc: restoreHiddenValues,
        strict: false,
      }) as Values
    }
    // Return the original values if the instance isn't part of the state
    return instance.value
  }

  // Addition (hidden) types from state
  const hiddenTypes = stateElements.filter(isHiddenType)

  // Workspace instances after completing:
  // 1. values for hidden fields. (addition)
  // 2. hidden types. (override)
  const instancesWithHiddenValues = workspaceElements.map(elem => {
    if (isInstanceElement(elem)) {
      const valuesAfterHiddenAdded = generateValuesWithHiddenFields(elem)

      // Return new instance after hidden values & types injection
      return new InstanceElement(
        elem.elemID.name,
        elem.type,
        valuesAfterHiddenAdded,
        elem.path,
        elem.annotations
      )
    }
    return elem
  })

  const StateHiddenTypesMap = _.keyBy(
    stateElements.filter(isHiddenType) as TypeElement[],
    o => o.elemID.getFullName()
  )


  const elementsWithUpdatedTypes = updateMergedTypes(
    instancesWithHiddenValues,
    StateHiddenTypesMap
  )

  return elementsWithUpdatedTypes.concat(hiddenTypes)
}

export const removeHiddenValuesForInstance = (instance: InstanceElement):
  InstanceElement => {
  const removeHiddenFieldValue: TransformFunc = ({ value, field }) => {
    if (field?.annotations[CORE_ANNOTATIONS.HIDDEN] === true) {
      return undefined
    }
    return value
  }

  return transformElement({
    element: instance,
    transformFunc: removeHiddenFieldValue,
    strict: false,
  }) || {}
}
