import { useState, TouchEvent } from 'react';

interface SwipeHandlers {
  onTouchStart: (e: TouchEvent<HTMLElement>) => void;
  onTouchMove: (e: TouchEvent<HTMLElement>) => void;
  onTouchEnd: () => void;
}

interface UseSwipeProps {
  onSwipeLeft: () => void; // Next
  onSwipeRight: () => void; // Previous
  threshold?: number; // min px to trigger swipe (default 50)
  disabled?: boolean;
}

export const useSwipeNavigation = ({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  disabled = false,
}: UseSwipeProps): SwipeHandlers => {
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchEndY, setTouchEndY] = useState<number | null>(null);

  const onTouchStart = (e: TouchEvent<HTMLElement>) => {
    if (disabled) return;
    setTouchEndX(null);
    setTouchEndY(null);
    setTouchStartX(e.targetTouches[0].clientX);
    setTouchStartY(e.targetTouches[0].clientY);
  };

  const onTouchMove = (e: TouchEvent<HTMLElement>) => {
    if (disabled) return;
    setTouchEndX(e.targetTouches[0].clientX);
    setTouchEndY(e.targetTouches[0].clientY);
  };

  const onTouchEnd = () => {
    if (disabled || touchStartX === null || touchEndX === null) return;

    const diffX = touchStartX - touchEndX;
    const diffY = (touchStartY ?? 0) - (touchEndY ?? 0);

    // Only consider horizontal swipes if horizontal distance is greater than vertical distance
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > threshold) {
      if (diffX > 0) {
        // Swiped Left -> Go Next
        onSwipeLeft();
      } else {
        // Swiped Right -> Go Previous
        onSwipeRight();
      }
    }

    setTouchStartX(null);
    setTouchEndX(null);
    setTouchStartY(null);
    setTouchEndY(null);
  };

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
};
