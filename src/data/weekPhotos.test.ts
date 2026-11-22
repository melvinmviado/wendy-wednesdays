import { beforeEach, describe, expect, it, vi } from 'vitest'
import { removeWeekPhoto, uploadWeekPhoto } from './weeklyResults'
import { updateOwnProfile } from './profiles'

// Storage and table calls are logged in order so the tests can check the sequence.
const s = vi.hoisted(() => ({
  log: [] as string[],
  files: [] as string[],
  uploadError: null as unknown,
  upsertError: null as unknown,
  profileRow: null as unknown,
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (path: string) => {
          s.log.push(`upload ${path}`)
          if (!s.uploadError) s.files.push(path)
          return Promise.resolve({ error: s.uploadError })
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${path}` } }),
        list: (folder: string) => {
          s.log.push(`list ${folder}`)
          return Promise.resolve({ data: s.files.filter((f) => f.startsWith(folder + '/')).map((f) => ({ name: f.split('/')[1] })) })
        },
        remove: (paths: string[]) => {
          s.log.push(`remove ${paths.join(',')}`)
          s.files = s.files.filter((f) => !paths.includes(f))
          return Promise.resolve({ error: null })
        },
      }),
    },
    from: (table: string) => ({
      upsert: (row: Record<string, unknown>) => {
        s.log.push(`save ${table} ${String(row.podium_photo_url)}`)
        return Promise.resolve({ error: s.upsertError })
      },
      update: () => ({ eq: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: s.profileRow, error: null }) }) }) }),
    }),
  },
}))

const jpeg = (bytes = 10) => new File([new Uint8Array(bytes)], 'IMG_1234.HEIC.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  s.log = []
  s.files = ['week-3/old.jpg']
  s.uploadError = null
  s.upsertError = null
  s.profileRow = null
})

describe('uploadWeekPhoto', () => {
  it('uploads, saves the URL, and only then removes the old photo', async () => {
    const url = await uploadWeekPhoto(3, jpeg())
    expect(s.log[0]).toMatch(/^upload week-3\/\d+\.jpg$/) // extension from the type, not the file name
    expect(s.log[1]).toBe(`save weeks ${url}`)
    expect(s.log[3]).toBe('remove week-3/old.jpg')
    expect(s.files).toHaveLength(1)
    expect(url).toMatch(/^https:\/\/cdn\/week-3\/\d+\.jpg$/)
  })

  it('keeps the old photo when saving the new URL fails', async () => {
    s.upsertError = { message: 'denied' }
    await expect(uploadWeekPhoto(3, jpeg())).rejects.toMatchObject({ message: 'denied' })
    expect(s.files).toContain('week-3/old.jpg')
    expect(s.log.some((l) => l.startsWith('remove'))).toBe(false)
  })

  it('refuses types the bucket would reject, and files over 5 MB, before uploading', async () => {
    const svg = new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })
    await expect(uploadWeekPhoto(3, svg)).rejects.toThrow(/JPEG, PNG or WebP/)
    await expect(uploadWeekPhoto(3, jpeg(5 * 1024 * 1024 + 1))).rejects.toThrow(/5 MB/)
    expect(s.log).toEqual([])
  })

  it('removeWeekPhoto deletes the files and clears the stored URL', async () => {
    await removeWeekPhoto(3)
    expect(s.log).toEqual(['list week-3', 'remove week-3/old.jpg', 'save weeks null'])
  })
})

describe('updateOwnProfile', () => {
  it('throws when no row matched (RLS hid it or it does not exist)', async () => {
    await expect(updateOwnProfile('u1', { display_name: 'Ann' })).rejects.toThrow(/could not be found/)
  })
})
