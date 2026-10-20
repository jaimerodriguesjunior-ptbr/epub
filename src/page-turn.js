// These two small adaptations target StPageFlip 2.0.7, pinned in package.json.
// Keep vendor internals here so an eventual library upgrade can review them together.
export function configurePageTurner(flip, visible) {
  const renderer = flip.getRender();
  const draw = renderer.drawFrame.bind(renderer);
  renderer.drawFrame = () => { if (visible()) draw(); };

  const controller = flip.getFlipController();
  const stop = controller.stopMove.bind(controller);
  controller.stopMove = () => {
    const calculation = controller.calc;
    if (flip.getOrientation() !== 'portrait' || flip.getState() !== 'user_fold' || !calculation || calculation.getDirection() !== 0) return stop();
    const position = calculation.getPosition();
    const bounds = flip.getBoundsRect();
    // The upstream threshold requires dragging past the left edge of a single page.
    // A touch reader should complete the turn once the finger crosses its midpoint.
    const complete = position.x <= bounds.pageWidth / 2;
    controller.animateFlippingTo(position, {
      x: complete ? -bounds.pageWidth : bounds.pageWidth,
      y: calculation.getCorner() === 'bottom' ? bounds.height : 0,
    }, complete);
  };
}
