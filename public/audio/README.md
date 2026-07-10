# Audio assets (optional)

The experience ships **fully procedural** — every sound is synthesized in the
Web Audio engine (`lib/audio/AudioEngine.ts`), so this folder can stay empty.

To replace placeholders with real recordings, drop files here and call:

```ts
await ctx.audio.playBuffer('/audio/forest-ambience.ogg', 'ambience', true)
```

Recommended format: OGG/Opus 96kbps for ambience, WAV for short SFX.
