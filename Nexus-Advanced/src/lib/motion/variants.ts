import type { Variants, Transition } from 'framer-motion';

export const smoothTransition: Transition = {
  duration: 0.35,
  ease: [0.25, 0.46, 0.45, 0.94],
};

export const snappyTransition: Transition = {
  duration: 0.15,
  ease: [0.4, 0, 0.2, 1],
};

export const springTransition: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: smoothTransition },
  exit: { opacity: 0, y: 8, transition: snappyTransition },
};

export const fadeInDown: Variants = {
  hidden: { opacity: 0, y: -12 },
  visible: { opacity: 1, y: 0, transition: smoothTransition },
  exit: { opacity: 0, y: -8, transition: snappyTransition },
};

export const fadeInLeft: Variants = {
  hidden: { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: smoothTransition },
  exit: { opacity: 0, x: -12, transition: snappyTransition },
};

export const fadeInRight: Variants = {
  hidden: { opacity: 0, x: 16 },
  visible: { opacity: 1, x: 0, transition: smoothTransition },
  exit: { opacity: 0, x: 12, transition: snappyTransition },
};

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: smoothTransition },
};

export const cardReveal: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 8 },
  visible: {
    opacity: 1, scale: 1, y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  exit: { opacity: 0, scale: 0.97, transition: snappyTransition },
};

export const panelSlide: Variants = {
  hidden: { opacity: 0, x: 20, width: 0 },
  visible: {
    opacity: 1, x: 0, width: 'auto',
    transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  exit: {
    opacity: 0, x: 20, width: 0,
    transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
  },
};

export const glowPulseRunning: Variants = {
  initial: { opacity: 0.6 },
  animate: {
    opacity: [0.6, 1, 0.6],
    scale: [1, 1.04, 1],
    transition: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' },
  },
};

export const glowPulseError: Variants = {
  initial: { opacity: 0.7 },
  animate: {
    opacity: [0.7, 1, 0.7],
    transition: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' },
  },
};

export const glowPulseRetrying: Variants = {
  initial: { opacity: 0.5 },
  animate: {
    opacity: [0.5, 1, 0.5],
    scale: [1, 1.06, 1],
    transition: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' },
  },
};

export const shimmerLoad: Variants = {
  initial: { x: '-100%' },
  animate: {
    x: '200%',
    transition: { duration: 2, repeat: Infinity, ease: 'linear' },
  },
};

export const executionTraversal: Variants = {
  initial: { pathLength: 0, opacity: 0 },
  animate: {
    pathLength: 1, opacity: 1,
    transition: { duration: 1.5, ease: 'easeInOut' },
  },
};

export const terminalTypeIn: Variants = {
  hidden: { opacity: 0, height: 0 },
  visible: {
    opacity: 1, height: 'auto',
    transition: { duration: 0.12, ease: 'easeOut' },
  },
};

export const notificationSlide: Variants = {
  hidden: { opacity: 0, x: 60, scale: 0.95 },
  visible: {
    opacity: 1, x: 0, scale: 1,
    transition: { type: 'spring', stiffness: 500, damping: 35 },
  },
  exit: {
    opacity: 0, x: 60, scale: 0.95,
    transition: { duration: 0.2, ease: 'easeIn' },
  },
};
