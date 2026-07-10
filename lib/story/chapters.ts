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
  { id: 'arrival', index: 0, numeral: 'I', title: 'Arrival', subtitle: 'Raise your hand. The dark is listening.', accent: '#e8c37a', chord: [110, 165, 220] },
  { id: 'forest', index: 1, numeral: 'II', title: 'The Forest', subtitle: 'Everything here grows toward you.', accent: '#8fd18a', chord: [146.8, 220, 293.7] },
  { id: 'ocean', index: 2, numeral: 'III', title: 'The Ocean', subtitle: 'The moon keeps the water honest.', accent: '#7ab8e8', chord: [98, 146.8, 196] },
  { id: 'egypt', index: 3, numeral: 'IV', title: 'Ancient Egypt', subtitle: 'Sand remembers what stone forgets.', accent: '#e8b45a', chord: [130.8, 174.6, 261.6] },
  { id: 'space', index: 4, numeral: 'V', title: 'Space', subtitle: 'Hold a planet. Gently.', accent: '#b58ae8', chord: [87.3, 130.8, 174.6] },
  { id: 'memory', index: 5, numeral: 'VI', title: 'Human Memory', subtitle: 'Catch what drifts. It was always yours.', accent: '#e8a58a', chord: [123.5, 185, 246.9] },
  { id: 'lab', index: 6, numeral: 'VII', title: 'Innovation Lab', subtitle: 'Information wants to be held.', accent: '#7ae8d8', chord: [164.8, 246.9, 329.6] },
  { id: 'refugee', index: 7, numeral: 'VIII', title: 'The Crossing', subtitle: 'Every door you open, someone once knocked on.', accent: '#cfc8bc', chord: [103.8, 155.6, 207.7] },
  { id: 'city', index: 8, numeral: 'IX', title: 'Future City', subtitle: 'The city rearranges itself around your palm.', accent: '#e87a9e', chord: [116.5, 174.6, 233.1] },
  { id: 'finale', index: 9, numeral: 'X', title: 'The Final Universe', subtitle: 'Every world you touched, at once.', accent: '#f0e6c8', chord: [110, 164.8, 220, 277.2] },
]

export const chapterById = (id: string): ChapterDef => {
  const chapter = CHAPTERS.find((c) => c.id === id)
  if (!chapter) throw new Error(`Unknown chapter: ${id}`)
  return chapter
}
