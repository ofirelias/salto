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
import { EOL } from 'os'
import { replaceContents, exists, readZipFile, rm, rename, generateZipString } from '@salto-io/file'
import { ObjectType, ElemID, isObjectType, BuiltinTypes } from '@salto-io/adapter-api'
import { safeJsonStringify } from '@salto-io/adapter-utils'
import { state as wsState, serialization } from '@salto-io/workspace'
import { hash } from '@salto-io/lowerdash'
import { localState, ZIPPED_STATE_EXTENSION } from '../../../src/local-workspace/state'
import { getAllElements } from '../../common/elements'

const { serialize } = serialization
const { toMD5 } = hash

jest.mock('@salto-io/file', () => ({
  ...jest.requireActual('@salto-io/file'),
  replaceContents: jest.fn().mockImplementation(() => Promise.resolve()),
  readTextFile: jest.fn().mockImplementation((filename: string) => {
    if (filename === 'error') {
      return Promise.resolve('blabl{,.')
    }
    if (filename === 'full' || filename.startsWith('deprecated_file')) {
      return Promise.resolve('[{"elemID":{"adapter":"salesforce","nameParts":["_config"]},"type":{"annotationTypes":{},"annotations":{},"elemID":{"adapter":"salesforce","nameParts":[]},"fields":{},"isSettings":false,"_salto_class":"ObjectType"},"value":{"token":"token","sandbox":false,"username":"test@test","password":"pass"},"_salto_class":"InstanceElement"},{"annotationTypes":{},"annotations":{"LeadConvertSettings":{"account":[{"input":"bla","output":"foo"}]}},"elemID":{"adapter":"salesforce","nameParts":["test"]},"fields":{"name":{"parentID":{"adapter":"salesforce","nameParts":["test"]},"name":"name","type":{"annotationTypes":{},"annotations":{},"elemID":{"adapter":"","nameParts":["string"]},"fields":{},"isSettings":false,"_salto_class":"ObjectType"},"annotations":{"label":"Name","_required":true},"isList":false,"elemID":{"adapter":"salesforce","nameParts":["test","name"]},"_salto_class":"Field"}},"isSettings":false,"_salto_class":"ObjectType"},{"annotationTypes":{},"annotations":{"metadataType":"Settings"},"elemID":{"adapter":"salesforce","nameParts":["settings"]},"fields":{},"isSettings":true,"_salto_class":"ObjectType"}]')
    }
    if (filename === 'mutiple_adapters') {
      return Promise.resolve('[{"annotationTypes":{},"annotations":{"LeadConvertSettings":{"account":[{"input":"bla","output":"foo"}]}},"elemID":{"adapter":"salesforce","nameParts":["test"]},"fields":{"name":{"parentID":{"adapter":"salesforce","nameParts":["test"]},"name":"name","type":{"annotationTypes":{},"annotations":{},"elemID":{"adapter":"","nameParts":["string"]},"fields":{},"isSettings":false,"_salto_class":"ObjectType"},"annotations":{"label":"Name","_required":true},"isList":false,"elemID":{"adapter":"salesforce","nameParts":["test","name"]},"_salto_class":"Field"}},"isSettings":false,"_salto_class":"ObjectType"},{"annotationTypes":{},"annotations":{},"elemID":{"adapter":"hubspot","nameParts":["foo"]},"fields":{},"isSettings":false,"_salto_class":"ObjectType"}]\n{ "salto" :"2020-04-21T09:44:20.824Z", "hubspot":"2020-04-21T09:44:20.824Z"}')
    }
    return Promise.resolve('[]')
  }),
  readZipFile: jest.fn().mockImplementation((filename: string) => {
    if (filename === 'error.jsonl.zip') {
      return Promise.resolve('blabl{,.')
    }
    if (filename === 'full.jsonl.zip') {
      return Promise.resolve('[{"elemID":{"adapter":"salesforce","nameParts":["_config"]},"type":{"annotationTypes":{},"annotations":{},"elemID":{"adapter":"salesforce","nameParts":[]},"fields":{},"isSettings":false,"_salto_class":"ObjectType"},"value":{"token":"token","sandbox":false,"username":"test@test","password":"pass"},"_salto_class":"InstanceElement"},{"annotationTypes":{},"annotations":{"LeadConvertSettings":{"account":[{"input":"bla","output":"foo"}]}},"elemID":{"adapter":"salesforce","nameParts":["test"]},"fields":{"name":{"parentID":{"adapter":"salesforce","nameParts":["test"]},"name":"name","type":{"annotationTypes":{},"annotations":{},"elemID":{"adapter":"","nameParts":["string"]},"fields":{},"isSettings":false,"_salto_class":"ObjectType"},"annotations":{"label":"Name","_required":true},"isList":false,"elemID":{"adapter":"salesforce","nameParts":["test","name"]},"_salto_class":"Field"}},"isSettings":false,"_salto_class":"ObjectType"},{"annotationTypes":{},"annotations":{"metadataType":"Settings"},"elemID":{"adapter":"salesforce","nameParts":["settings"]},"fields":{},"isSettings":true,"_salto_class":"ObjectType"}]')
    }
    if (filename === 'mutiple_adapters.jsonl.zip') {
      return Promise.resolve('[{"annotationTypes":{},"annotations":{"LeadConvertSettings":{"account":[{"input":"bla","output":"foo"}]}},"elemID":{"adapter":"salesforce","nameParts":["test"]},"fields":{"name":{"parentID":{"adapter":"salesforce","nameParts":["test"]},"name":"name","type":{"annotationTypes":{},"annotations":{},"elemID":{"adapter":"","nameParts":["string"]},"fields":{},"isSettings":false,"_salto_class":"ObjectType"},"annotations":{"label":"Name","_required":true},"isList":false,"elemID":{"adapter":"salesforce","nameParts":["test","name"]},"_salto_class":"Field"}},"isSettings":false,"_salto_class":"ObjectType"},{"annotationTypes":{},"annotations":{},"elemID":{"adapter":"hubspot","nameParts":["foo"]},"fields":{},"isSettings":false,"_salto_class":"ObjectType"}]\n{ "salto" :"2020-04-21T09:44:20.824Z", "hubspot":"2020-04-21T09:44:20.824Z"}')
    }
    return Promise.resolve('[]')
  }),
  rm: jest.fn().mockImplementation(),
  rename: jest.fn().mockImplementation(),
  mkdirp: jest.fn().mockImplementation(),
  exists: jest.fn().mockImplementation((filename: string) => {
    if (filename.startsWith('deprecated_file')) {
      return Promise.resolve(filename.endsWith('jsonl'))
    }
    if (filename.endsWith('zip') && !filename.startsWith('empty')) {
      return Promise.resolve(true)
    }
    return Promise.resolve(false)
  }),
}))

describe('local state', () => {
  const mockElement = getAllElements().find(isObjectType) as ObjectType
  const replaceContentMock = replaceContents as jest.Mock
  const readZipFileMock = readZipFile as unknown as jest.Mock

  describe('empty state', () => {
    let state: wsState.State
    beforeEach(() => {
      state = localState('empty')
    })

    it('should return a hash of an empty string', async () => {
      const stateHash = await state.getHash()
      // c642ef3bd1563150551c7acc3e4ed5fb is the md5 digest of an empty state ('[]\n{}\n[]')
      expect(stateHash).toEqual('c642ef3bd1563150551c7acc3e4ed5fb')
    })

    it('should return an empty array if there is no saved state', async () => {
      const result = await state.getAll()
      expect(result.length).toBe(0)
    })

    it('should override state successfully, retrieve it and get the same result', async () => {
      const newElem = new ObjectType({ elemID: new ElemID('mock_adapter', 'new') })
      state.set(newElem)
      await state.override([mockElement])
      const retrievedState = await state.getAll()
      expect(retrievedState.length).toBe(1)
      const retrievedStateObjectType = retrievedState[0] as ObjectType
      expect(retrievedStateObjectType.isEqual(mockElement)).toBe(true)
    })

    it('should set state successfully, retrieve it and get the same result', async () => {
      await state.set(mockElement)
      const retrievedState = await state.getAll()
      expect(retrievedState.length).toBe(1)
      const retrievedStateObjectType = retrievedState[0] as ObjectType
      expect(retrievedStateObjectType.isEqual(mockElement)).toBe(true)
    })

    it('should update state', async () => {
      await state.set(mockElement)
      const clone = mockElement.clone()
      const newField = Object.values(mockElement.fields)[0]
      newField.name = 'new_field'
      clone.fields.newfield = newField
      state.set(clone)

      const fromState = await state.get(mockElement.elemID) as ObjectType
      expect(fromState.fields.newfield).toBeDefined()
    })

    it('should add to state', async () => {
      await state.set(mockElement)
      const newElem = new ObjectType({ elemID: new ElemID('mock_adapter', 'new') })
      state.set(newElem)

      const fromState = await state.getAll()
      expect(fromState.length).toBe(2)
      expect(fromState[1].elemID.name).toBe('new')
    })

    it('should remove from state', async () => {
      await state.set(mockElement)
      let fromState = await state.getAll()
      expect(fromState.length).toBe(1)

      await state.remove(mockElement.elemID)
      fromState = await state.getAll()
      expect(fromState.length).toBe(0)
    })
  })

  it('should read valid state file', async () => {
    const state = localState('full')
    const elements = await state.getAll()
    expect(elements).toHaveLength(2)
  })

  it('should throw an error if the state nacl file is not valid', async () => {
    const state = localState('error')
    await expect(state.getAll()).rejects.toThrow()
  })

  const findReplaceContentCall = (filename: string): unknown[] =>
    replaceContentMock.mock.calls.find(c => c[0] === filename)

  it('should write file on flush', async () => {
    const state = localState('on-flush')
    await state.set(mockElement)
    await state.flush()
    const onFlush = findReplaceContentCall('on-flush.jsonl.zip')
    expect(onFlush).toBeDefined()
    expect(onFlush[1]).toEqual(await generateZipString([
      serialize([mockElement]),
      safeJsonStringify({}),
      safeJsonStringify([]),
    ].join(EOL)))
  })

  describe('deprecated state file', () => {
    let state: wsState.State

    beforeEach(() => {
      state = localState('deprecated_file')
      state.getAll() // force read file
    })

    it('should read deprecated file and delete it on write', async () => {
      await state.flush()
      const mockRm = rm as jest.Mock
      const onFlush = findReplaceContentCall('deprecated_file.jsonl.zip')
      expect(onFlush).toBeDefined()
      expect(mockRm).toHaveBeenCalledTimes(1)
      expect(mockRm).toHaveBeenCalledWith('deprecated_file.jsonl')
      mockRm.mockClear()
    })
  })

  it('shouldn\'t write file if state was not loaded on flush', async () => {
    const state = localState('not-flush')
    await state.flush()
    expect(findReplaceContentCall('not-flush')).toBeUndefined()
  })

  describe('getUpdateDate', () => {
    const mockExists = exists as jest.Mock
    const saltoModificationDate = new Date(2010, 10, 10)
    const hubspotModificationDate = new Date(2011, 10, 10)
    const mockStateStr = [
      safeJsonStringify([]),
      safeJsonStringify({ salto: saltoModificationDate, hubspot: hubspotModificationDate }),
    ].join(EOL)

    it('should return an empty object when the state does not exist', async () => {
      mockExists.mockResolvedValueOnce(false)
      const state = localState('filename')
      const date = await state.getServicesUpdateDates()
      expect(date).toEqual({})
    })
    it('should return empty object when the updated date is not set', async () => {
      mockExists.mockResolvedValueOnce(true)
      const state = localState('filename')
      const date = await state.getServicesUpdateDates()
      expect(date).toEqual({})
    })
    it('should return the modification date of the state', async () => {
      mockExists.mockResolvedValueOnce(true)
      readZipFileMock.mockResolvedValueOnce(mockStateStr)
      const state = localState('filename')
      const date = await state.getServicesUpdateDates()
      expect(date.salto).toEqual(saltoModificationDate)
      expect(date.hubspot).toEqual(hubspotModificationDate)
    })
    it('should update modification date on override', async () => {
      mockExists.mockResolvedValueOnce(true)
      readZipFileMock.mockResolvedValueOnce(mockStateStr)
      const now = new Date(2013, 6, 4).getTime()
      jest.spyOn(Date, 'now').mockImplementationOnce(() => now)
      const state = localState('filename')

      const beforeOverrideDate = await state.getServicesUpdateDates()
      expect(beforeOverrideDate.salto).toEqual(saltoModificationDate)
      expect(beforeOverrideDate.hubspot).toEqual(hubspotModificationDate)
      await state.override([mockElement])
      const overrideDate = await state.getServicesUpdateDates()
      expect(overrideDate.salto.getTime()).toBe(now)
      expect(beforeOverrideDate.hubspot).toEqual(hubspotModificationDate)
    })
    it('should not update modification date on set/remove', async () => {
      mockExists.mockResolvedValueOnce(true)
      readZipFileMock.mockResolvedValueOnce(mockStateStr)
      const state = localState('filename')

      await state.set(mockElement)
      const overrideDate = await state.getServicesUpdateDates()
      expect(overrideDate.salto).toEqual(saltoModificationDate)
      expect(overrideDate.hubspot).toEqual(hubspotModificationDate)
      await state.remove(mockElement.elemID)
      expect(overrideDate.salto).toEqual(saltoModificationDate)
      expect(overrideDate.hubspot).toEqual(hubspotModificationDate)
    })
    it('should ignore built in types in set ops', async () => {
      mockExists.mockResolvedValueOnce(true)
      const state = localState('empty')
      await state.set(BuiltinTypes.STRING)
      const overrideDate = await state.getServicesUpdateDates()
      expect(overrideDate).toEqual({})
    })
  })

  describe('clear', () => {
    const mockRm = rm as jest.Mock
    it('should delete state file', async () => {
      const state = localState('on-delete')
      await state.clear()
      expect(mockRm).toHaveBeenCalledTimes(1)
      expect(mockRm).toHaveBeenCalledWith(`on-delete${ZIPPED_STATE_EXTENSION}`)
      mockRm.mockClear()
    })
  })

  describe('rename', () => {
    const mockRename = rename as jest.Mock
    const filePath = '/base/old'

    it('should rename state file', async () => {
      const state = localState(filePath)
      await state.rename('new')
      expect(mockRename).toHaveBeenCalledTimes(1)
      expect(mockRename).toHaveBeenCalledWith(filePath + ZIPPED_STATE_EXTENSION, `/base/new${ZIPPED_STATE_EXTENSION}`)
    })
  })

  describe('exsitingAdapters', () => {
    it('should return empty list on empty state', async () => {
      const state = localState('empty')
      const adapters = await state.existingServices()
      expect(adapters).toHaveLength(0)
    })
    it('should return all adapters in a full state', async () => {
      const state = localState('mutiple_adapters')
      const adapters = await state.existingServices()
      expect(adapters).toEqual(['salto', 'hubspot'])
    })
  })

  describe('getHash', () => {
    it('should call toMd5', async () => {
      const state = localState('empty-state')
      await state.set(mockElement)
      const stateHash = await state.getHash()
      expect(stateHash).toEqual(toMD5([
        serialize([mockElement]),
        safeJsonStringify({}),
        safeJsonStringify([]),
      ].join(EOL)))
    })
  })
})
