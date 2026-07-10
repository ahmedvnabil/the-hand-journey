export interface ChapterDef {
  id: string
  index: number
  numeral: string
  title: string
  subtitle: string
  /** Accent color used by UI captions and the hand cursor in that world. */
  accent: string
  /** Ambient chord (Hz) handed to the audio engine. */
  chord: number[]
}

export const CHAPTERS: ChapterDef[] = [
  { id: 'arrival', index: 0, numeral: '١', title: 'البوّابة', subtitle: 'ارفع يدك… النجوم في انتظارك.', accent: '#e8c37a', chord: [110, 165, 220] },
  { id: 'forest', index: 1, numeral: '٢', title: 'الغابة المسحورة', subtitle: 'كل شيء هنا ينمو نحو يدك.', accent: '#8fd18a', chord: [146.8, 220, 293.7] },
  { id: 'ocean', index: 2, numeral: '٣', title: 'المحيط', subtitle: 'القمر يضيء الماء، ويدك تصنع الموج.', accent: '#7ab8e8', chord: [98, 146.8, 196] },
  { id: 'egypt', index: 3, numeral: '٤', title: 'مصر القديمة', subtitle: 'الرمال تتذكّر ما نسيته الحجارة.', accent: '#e8b45a', chord: [130.8, 174.6, 261.6] },
  { id: 'space', index: 4, numeral: '٥', title: 'الفضاء', subtitle: 'أمسك كوكبًا… برفق.', accent: '#b58ae8', chord: [87.3, 130.8, 174.6] },
  { id: 'memory', index: 5, numeral: '٦', title: 'بيت الذكريات', subtitle: 'اقرص ما يطير… فهو لك منذ البداية.', accent: '#e8a58a', chord: [123.5, 185, 246.9] },
  { id: 'lab', index: 6, numeral: '٧', title: 'مختبر المستقبل', subtitle: 'المعلومات تحب أن تُمسَك باليد.', accent: '#7ae8d8', chord: [164.8, 246.9, 329.6] },
  { id: 'refugee', index: 7, numeral: '٨', title: 'العبور', subtitle: 'كل باب تفتحه، طرقه إنسان قبلك.', accent: '#cfc8bc', chord: [103.8, 155.6, 207.7] },
  { id: 'city', index: 8, numeral: '٩', title: 'مدينة المستقبل', subtitle: 'المدينة تعيد ترتيب نفسها حول كفّك.', accent: '#e87a9e', chord: [116.5, 174.6, 233.1] },
  { id: 'finale', index: 9, numeral: '١٠', title: 'الكون الأخير', subtitle: 'كل العوالم التي لمستَها… معًا.', accent: '#f0e6c8', chord: [110, 164.8, 220, 277.2] },
]

export const chapterById = (id: string): ChapterDef => {
  const chapter = CHAPTERS.find((c) => c.id === id)
  if (!chapter) throw new Error(`Unknown chapter: ${id}`)
  return chapter
}
