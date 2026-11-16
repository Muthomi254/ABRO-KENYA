import { useEffect } from "react";

type LockedStyles = {
  body: Pick<CSSStyleDeclaration, "position" | "top" | "left" | "right" | "width" | "overflow" | "paddingRight">;
  htmlOverflow: string;
  scrollY: number;
};

let activeLocks = 0;
let lockedStyles: LockedStyles | null = null;

function acquireBodyScrollLock(): void {
  if (activeLocks === 0) {
    const body = document.body.style;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    lockedStyles = {
      body: {
        position: body.position,
        top: body.top,
        left: body.left,
        right: body.right,
        width: body.width,
        overflow: body.overflow,
        paddingRight: body.paddingRight
      },
      htmlOverflow: document.documentElement.style.overflow,
      scrollY: window.scrollY
    };

    body.position = "fixed";
    body.top = `-${lockedStyles.scrollY}px`;
    body.left = "0";
    body.right = "0";
    body.width = "100%";
    body.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.paddingRight = `${scrollbarWidth}px`;
    }
    document.documentElement.style.overflow = "hidden";
  }

  activeLocks += 1;
}

function releaseBodyScrollLock(): void {
  activeLocks = Math.max(0, activeLocks - 1);
  if (activeLocks !== 0 || !lockedStyles) {
    return;
  }

  const { body, htmlOverflow, scrollY } = lockedStyles;
  Object.assign(document.body.style, body);
  document.documentElement.style.overflow = htmlOverflow;
  lockedStyles = null;
  window.scrollTo(0, scrollY);
}

export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked || typeof document === "undefined") {
      return;
    }

    acquireBodyScrollLock();
    return releaseBodyScrollLock;
  }, [locked]);
}
