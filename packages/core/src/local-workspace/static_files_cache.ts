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
import path from 'path'
import { logger } from '@salto-io/logging'
import { readTextFile, exists, mkdirp, replaceContents, rm, rename } from '@salto-io/file'
import { staticFiles } from '@salto-io/workspace'
import { safeJsonStringify } from '@salto-io/adapter-utils'

const log = logger(module)

export const CACHE_FILENAME = 'static-file-cache'

export type StaticFilesCacheState = Record<string, staticFiles.StaticFilesCacheResult>

export const buildLocalStaticFilesCache = (
  cacheDir: string,
  initCacheState?: Promise<StaticFilesCacheState>,
  suffixToRemoveOnRename?: string,
): staticFiles.StaticFilesCache => {
  let currentCacheFile = path.join(cacheDir, CACHE_FILENAME)

  const initCache = async (): Promise<StaticFilesCacheState> =>
    (!(await exists(currentCacheFile)) ? {} : JSON.parse(await readTextFile(currentCacheFile)))

  const cache: Promise<StaticFilesCacheState> = initCacheState || initCache()

  return {
    get: async (filepath: string): Promise<staticFiles.StaticFilesCacheResult> => (
      (await cache)[filepath]
    ),
    put: async (item: staticFiles.StaticFilesCacheResult): Promise<void> => {
      (await cache)[item.filepath] = item
    },
    flush: async () => {
      if (!await exists(cacheDir)) {
        await mkdirp(cacheDir)
      }
      await replaceContents(currentCacheFile, safeJsonStringify((await cache)))
    },
    clear: async () => {
      await rm(currentCacheFile)
    },
    rename: async (name: string) => {
      let newCacheDir = cacheDir
      if (suffixToRemoveOnRename) {
        if (newCacheDir.endsWith(suffixToRemoveOnRename)) {
          newCacheDir = newCacheDir.slice(-suffixToRemoveOnRename.length)
          if (newCacheDir.slice(-1) === path.sep) {
            newCacheDir = newCacheDir.slice(-1)
          }
        } else {
          throw Error('Invalid static_files_cache situation, suffixToRemoveOnRename: '
          + `${suffixToRemoveOnRename} not the tail of ${newCacheDir}`)
        }
      }
      newCacheDir = path.join(path.dirname(newCacheDir), name)
      const newCacheFile = path.join(newCacheDir, CACHE_FILENAME)
      if (await exists(currentCacheFile)) {
        await mkdirp(path.dirname(newCacheFile))
        await rename(currentCacheFile, newCacheFile)
      } else {
        log.debug(`Rename failed. ${currentCacheFile} Does not exists`)
      }
      currentCacheFile = newCacheFile
    },
    clone: () => buildLocalStaticFilesCache(cacheDir, cache),
  }
}
