import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
  updateOwnProfile: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    storage: {
      from: () => ({
        upload: m.upload,
        remove: m.remove,
        list: m.list,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/avatars/${path}` } }),
      }),
    },
  },
}))
vi.mock('./profiles', () => ({ updateOwnProfile: m.updateOwnProfile }))

import { removeAvatar, replaceAvatar } from './avatars'

const PATH = 'u1/avatar.jpg'
const OLD_URL = `https://x.supabase.co/storage/v1/object/public/avatars/${PATH}?v=1`
const newBlob = new Blob(['new'], { type: 'image/jpeg' })

const respond = (status: number, body = 'old') =>
  vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, blob: async () => new Blob([body]) })

describe('replaceAvatar', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    m.upload.mockResolvedValue({ error: null })
    m.remove.mockResolvedValue({ error: null })
    m.list.mockResolvedValue({ data: [{ name: 'avatar.jpg' }, { name: 'avatar.png' }] })
    m.updateOwnProfile.mockResolvedValue({ id: 'u1' })
    vi.stubGlobal('fetch', respond(200))
  })

  it('uploads to {uid}/avatar.jpg, saves a versioned URL, then tidies other files', async () => {
    await replaceAvatar('u1', newBlob, OLD_URL)
    expect(m.upload).toHaveBeenCalledTimes(1)
    expect(m.upload).toHaveBeenCalledWith(PATH, newBlob, expect.objectContaining({ contentType: 'image/jpeg', upsert: true }))
    const url = m.updateOwnProfile.mock.calls[0][1].avatar_url as string
    expect(url).toMatch(/\/avatars\/u1\/avatar\.jpg\?v=\d+$/)
    expect(m.remove).toHaveBeenCalledWith(['u1/avatar.png']) // the stray file, never the new avatar
  })

  it('puts the previous image back if the profile update fails', async () => {
    m.updateOwnProfile.mockRejectedValue(new Error('rls says no'))
    await expect(replaceAvatar('u1', newBlob, OLD_URL)).rejects.toThrow('rls says no')
    expect(m.upload).toHaveBeenCalledTimes(2)
    const restored = m.upload.mock.calls[1][1] as Blob
    expect(await restored.text()).toBe('old')
    expect(m.remove).not.toHaveBeenCalled()
  })

  it('removes the new file if the profile update fails and there was no previous photo', async () => {
    m.updateOwnProfile.mockRejectedValue(new Error('boom'))
    await expect(replaceAvatar('u1', newBlob, null)).rejects.toThrow('boom')
    expect(fetch).not.toHaveBeenCalled()
    expect(m.upload).toHaveBeenCalledTimes(1)
    expect(m.remove).toHaveBeenCalledWith([PATH])
  })

  it('treats a missing old file (404) as no previous photo', async () => {
    vi.stubGlobal('fetch', respond(404))
    m.updateOwnProfile.mockRejectedValue(new Error('boom'))
    await expect(replaceAvatar('u1', newBlob, OLD_URL)).rejects.toThrow('boom')
    expect(m.remove).toHaveBeenCalledWith([PATH])
  })

  it('does not touch storage when the old photo cannot be read for backup', async () => {
    vi.stubGlobal('fetch', respond(500))
    await expect(replaceAvatar('u1', newBlob, OLD_URL)).rejects.toThrow(/prepare/i)
    expect(m.upload).not.toHaveBeenCalled()
  })

  it('surfaces the original error even if the rollback also fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    m.updateOwnProfile.mockRejectedValue(new Error('profile failed'))
    m.upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: new Error('restore failed') })
    await expect(replaceAvatar('u1', newBlob, OLD_URL)).rejects.toThrow('profile failed')
  })

  it('does not save anything if the upload itself fails', async () => {
    m.upload.mockResolvedValue({ error: new Error('too big') })
    await expect(replaceAvatar('u1', newBlob, null)).rejects.toThrow('too big')
    expect(m.updateOwnProfile).not.toHaveBeenCalled()
  })

  it('a failed tidy-up does not fail the save', async () => {
    m.list.mockRejectedValue(new Error('list failed'))
    await expect(replaceAvatar('u1', newBlob, null)).resolves.toBeDefined()
  })
})

describe('removeAvatar', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    m.remove.mockResolvedValue({ error: null })
    m.list.mockResolvedValue({ data: [{ name: 'avatar.jpg' }] })
  })

  it('clears the profile first, then deletes the files', async () => {
    m.updateOwnProfile.mockResolvedValue({ id: 'u1' })
    await removeAvatar('u1')
    expect(m.updateOwnProfile).toHaveBeenCalledWith('u1', { avatar_url: null })
    expect(m.remove).toHaveBeenCalledWith([PATH])
  })

  it('leaves the files alone if the profile update fails', async () => {
    m.updateOwnProfile.mockRejectedValue(new Error('nope'))
    await expect(removeAvatar('u1')).rejects.toThrow('nope')
    expect(m.remove).not.toHaveBeenCalled()
  })
})
