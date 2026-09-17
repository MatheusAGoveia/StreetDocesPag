import { useLayoutEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function useExperienceMotion(onSceneChange: (index: number) => void) {
  useLayoutEffect(() => {
    const mm = gsap.matchMedia();

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo('.manifesto-title span:nth-child(1)', { xPercent: -15 }, { xPercent: 0, ease: 'none', scrollTrigger: { trigger: '.manifesto-scene', start: 'top bottom', end: 'bottom 35%', scrub: 1 } });
      gsap.fromTo('.manifesto-title span:nth-child(2)', { xPercent: 14 }, { xPercent: 0, ease: 'none', scrollTrigger: { trigger: '.manifesto-scene', start: 'top bottom', end: 'bottom 35%', scrub: 1 } });
      gsap.fromTo('.manifesto-title span:nth-child(3)', { xPercent: -8 }, { xPercent: 0, ease: 'none', scrollTrigger: { trigger: '.manifesto-scene', start: 'top bottom', end: 'bottom 35%', scrub: 1 } });
      gsap.fromTo('.manifesto-photo', { yPercent: 18, rotation: -8 }, { yPercent: -19, rotation: 5, ease: 'none', scrollTrigger: { trigger: '.manifesto-scene', start: 'top bottom', end: 'bottom top', scrub: 1 } });
      gsap.to('.manifesto-note-star', { rotation: 270, ease: 'none', scrollTrigger: { trigger: '.manifesto-scene', start: 'top bottom', end: 'bottom top', scrub: 1 } });
      gsap.fromTo('.manifesto-wave', { yPercent: 35 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.manifesto-scene', start: 'bottom bottom', end: 'bottom 20%', scrub: 1 } });
      gsap.fromTo('.shop-wave', { yPercent: 50, scaleY: .7 }, { yPercent: 0, scaleY: 1, ease: 'none', scrollTrigger: { trigger: '.shop-section', start: 'top bottom', end: 'top 25%', scrub: 1 } });
      gsap.fromTo('.shop-exit-wave', { yPercent: 70 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.shop-section', start: 'bottom bottom', end: 'bottom 20%', scrub: 1 } });
      gsap.fromTo('.epilogue-photo img', { scale: 1, yPercent: 8 }, { scale: 1.25, yPercent: -8, ease: 'none', scrollTrigger: { trigger: '.epilogue-scene', start: 'top bottom', end: 'bottom top', scrub: 1 } });
      gsap.fromTo('.epilogue-star', { rotation: -70, scale: .7 }, { rotation: 50, scale: 1.2, ease: 'none', scrollTrigger: { trigger: '.epilogue-scene', start: 'top bottom', end: 'bottom top', scrub: 1 } });
      gsap.fromTo('.shop-aside h2', { yPercent: 12 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.shop-section', start: 'top bottom', end: 'top 20%', scrub: 1 } });
    });

    function sequenceTimeline(scrollDistance: () => number) {
      const frames = gsap.utils.toArray<HTMLElement>('.taste-frame');
      const photos = frames.map((frame) => frame.querySelector('img') as HTMLImageElement);
      const copies = gsap.utils.toArray<HTMLElement>('.taste-copy');
      gsap.set(frames.slice(1), { clipPath: 'inset(0 100% 0 0)' });
      gsap.set(copies.slice(1), { autoAlpha: 0, y: 45, pointerEvents: 'none' });
      gsap.set('.taste-progress-fill', { scaleX: 0, transformOrigin: 'left center' });
      gsap.set('.taste-outro-wave', { yPercent: 101, autoAlpha: 1 });
      const timeline = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: '.taste-sequence',
          start: 'top top',
          end: () => `+=${scrollDistance()}`,
          pin: true,
          scrub: .8,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => onSceneChange(self.progress < .32 ? 0 : self.progress < .66 ? 1 : 2),
        },
      });
      timeline.to(photos[0], { scale: 1.28, duration: 1.05 }, 0)
        .to('.taste-visual-disc', { rotation: 155, scale: 1.35, duration: 3 }, 0)
        .to('.taste-progress-fill', { scaleX: 1, duration: 3 }, 0)
        .to(copies[0], { autoAlpha: 0, y: -42, pointerEvents: 'none', duration: .24 }, .78)
        .to(frames[1], { clipPath: 'inset(0 0% 0 0)', duration: .55 }, .79)
        .fromTo(photos[1], { scale: 1.24 }, { scale: 1, duration: .55 }, .79)
        .to(copies[1], { autoAlpha: 1, y: 0, pointerEvents: 'auto', duration: .28 }, .98)
        .to(photos[1], { scale: 1.18, duration: .85 }, 1.16)
        .to(copies[1], { autoAlpha: 0, y: -42, pointerEvents: 'none', duration: .24 }, 1.78)
        .to(frames[2], { clipPath: 'inset(0 0% 0 0)', duration: .55 }, 1.79)
        .fromTo(photos[2], { scale: 1.24 }, { scale: 1, duration: .55 }, 1.79)
        .to(copies[2], { autoAlpha: 1, y: 0, pointerEvents: 'auto', duration: .28 }, 1.98)
        .to(photos[2], { scale: 1.17, duration: .85 }, 2.16)
        .to('.taste-outro-wave', { yPercent: 0, duration: .38 }, 2.65);
    }

    mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
      const hero = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: '.cinema-hero', start: 'top top', end: () => `+=${Math.round(window.innerHeight * 1.05)}`, pin: true, scrub: .8, anticipatePin: 1, invalidateOnRefresh: true },
      });
      hero.to('.cinema-hero-photo img', { scale: 1.35, xPercent: -7, duration: 1 }, 0)
        .to('.cinema-title', { yPercent: -45, scale: .9, transformOrigin: 'left center', duration: .7 }, .14)
        .to('.cinema-hero-details', { y: -90, autoAlpha: 0, duration: .26 }, .42)
        .to('.cinema-overline', { autoAlpha: 0, duration: .2 }, .48)
        .to('.cinema-title', { autoAlpha: 0, duration: .19 }, .58)
        .fromTo('.cinema-portal', { scale: 0 }, { scale: 34, duration: .38, ease: 'power1.in' }, .62);

      sequenceTimeline(() => Math.round(window.innerHeight * 2.8));

      const stage = document.querySelector<HTMLElement>('.rail-stage')!;
      const track = document.querySelector<HTMLElement>('.rail-track')!;
      const railDistance = () => Math.max(1, track.scrollWidth - stage.clientWidth);
      gsap.to(track, {
        x: () => -railDistance(),
        ease: 'none',
        scrollTrigger: { trigger: '.rail-section', start: 'top top', end: () => `+=${railDistance()}`, pin: true, scrub: 1, anticipatePin: 1, invalidateOnRefresh: true },
      });
    });

    mm.add('(max-width: 899px) and (prefers-reduced-motion: no-preference)', () => {
      gsap.to('.cinema-hero-photo img', { scale: 1.15, yPercent: 8, ease: 'none', scrollTrigger: { trigger: '.cinema-hero', start: 'top top', end: 'bottom top', scrub: 1 } });
      gsap.to('.cinema-title', { yPercent: -18, ease: 'none', scrollTrigger: { trigger: '.cinema-hero', start: 'top top', end: 'bottom top', scrub: 1 } });
      sequenceTimeline(() => Math.round(window.innerHeight * 1.8));
    });

    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh, { once: true });
    document.fonts?.ready.then(refresh);
    return () => {
      window.removeEventListener('load', refresh);
      mm.revert();
    };
  }, [onSceneChange]);
}
