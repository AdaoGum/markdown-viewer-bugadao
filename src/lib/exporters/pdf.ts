import { backgroundOf, withOffscreenRender } from './dom'
import type { ExportContext } from '../core/types'

// Printable width in CSS px for each paper size (portrait), used to lay out
// the page before it is rasterised.
const PAPER_MM: Record<string, [number, number]> = {
  a3: [297, 420],
  a4: [210, 297],
  a5: [148, 210],
  letter: [215.9, 279.4],
  legal: [215.9, 355.6],
}
const PX_PER_MM = 96 / 25.4

export async function toPdf(context: ExportContext): Promise<Blob> {
  const { default: html2pdf } = await import('html2pdf.js')
  const { pageSize, orientation, margin, scale } = context.options
  const [w, h] = PAPER_MM[pageSize] ?? PAPER_MM.a4
  const pageWidthMm = orientation === 'landscape' ? h : w
  const width = Math.round((pageWidthMm - margin * 2) * PX_PER_MM)

  return withOffscreenRender(context, { width, padding: 0 }, async (element) => {
    const worker = html2pdf()
      .set({
        margin,
        filename: `${context.filename}.pdf`,
        image: { type: 'jpeg', quality: 0.96 },
        enableLinks: true,
        html2canvas: { scale, useCORS: true, backgroundColor: backgroundOf(element), logging: false },
        jsPDF: { unit: 'mm', format: pageSize, orientation },
        pagebreak: {
          mode: ['css', 'legacy'],
          avoid: ['pre', 'blockquote', 'tr', 'img', 'h1', 'h2', 'h3', 'h4', 'li'],
        },
        // pagebreak is supported by html2pdf but missing from its typings.
      } as Parameters<InstanceType<typeof html2pdf.Worker>['set']>[0])
      .from(element)

    const pdf = await worker.toPdf().get('pdf')
    pdf.setProperties({
      title: context.title,
      author: context.options.author ?? '',
      creator: 'Markdown Viewer Bugadão',
    })
    return pdf.output('blob') as Blob
  })
}
