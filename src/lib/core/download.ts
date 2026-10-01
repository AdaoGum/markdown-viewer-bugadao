/** Triggers a browser download for a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking synchronously cancels the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** Makes a string safe to use as a file name on every OS. */
export function sanitizeFilename(name: string, fallback = 'document'): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[<>:"/\|?*\u0000-\u001F]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 120)
  return cleaned || fallback
}
