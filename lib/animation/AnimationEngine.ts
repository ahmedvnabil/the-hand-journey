import gsap from 'gsap'

/**
 * Thin GSAP wrapper: every scene's tweens live on a labelled context so a
 * scene switch kills exactly its own animations and nothing else.
 */
export class AnimationEngine {
  private contexts = new Map<string, gsap.Context>()
  reducedMotion = false

  scope(name: string): gsap.Context {
    let ctx = this.contexts.get(name)
    if (!ctx) {
      ctx = gsap.context(() => {})
      this.contexts.set(name, ctx)
    }
    return ctx
  }

  to(scopeName: string, target: gsap.TweenTarget, vars: gsap.TweenVars): gsap.core.Tween {
    let tween!: gsap.core.Tween
    this.scope(scopeName).add(() => {
      tween = gsap.to(target, this.adapt(vars))
    })
    return tween
  }

  fromTo(scopeName: string, target: gsap.TweenTarget, from: gsap.TweenVars, to: gsap.TweenVars): gsap.core.Tween {
    let tween!: gsap.core.Tween
    this.scope(scopeName).add(() => {
      tween = gsap.fromTo(target, from, this.adapt(to))
    })
    return tween
  }

  timeline(scopeName: string, vars?: gsap.TimelineVars): gsap.core.Timeline {
    let tl!: gsap.core.Timeline
    this.scope(scopeName).add(() => {
      tl = gsap.timeline(vars)
    })
    return tl
  }

  /** Reduced motion: keep the state change, drop the journey. */
  private adapt(vars: gsap.TweenVars): gsap.TweenVars {
    if (!this.reducedMotion) return vars
    return { ...vars, duration: Math.min((vars.duration as number) ?? 0.5, 0.15), ease: 'none' }
  }

  killScope(name: string): void {
    this.contexts.get(name)?.revert()
    this.contexts.delete(name)
  }

  dispose(): void {
    for (const ctx of this.contexts.values()) ctx.revert()
    this.contexts.clear()
  }
}
