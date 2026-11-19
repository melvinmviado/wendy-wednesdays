export interface CropArea {
  x: number
  y: number
  width: number
  height: number
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that image'))
    img.src = src
  })

/** Draws the chosen crop area onto a square canvas and returns it as a JPEG. */
export async function getCroppedBlob(
  imageSrc: string,
  area: CropArea,
  size = 1080,
  quality = 0.85
): Promise<Blob> {
  const img = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Image editing is not supported in this browser')

  // Dark backdrop so transparent PNGs do not export as black through JPEG
  ctx.fillStyle = '#181414'
  ctx.fillRect(0, 0, size, size)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, size, size)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not create the cropped image'))),
      'image/jpeg',
      quality
    )
  })
}
