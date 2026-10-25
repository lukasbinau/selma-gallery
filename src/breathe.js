// Let the browser paint a frame (and handle a click) between two slices of
// work; the timer carries on where rAF stalls (a background tab). Used by the
// gallery and "I din stue" to build their scenes without long tasks.
export const breathe = () =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, 50);
    requestAnimationFrame(() =>
      setTimeout(() => {
        clearTimeout(timer);
        resolve();
      }, 0),
    );
  });
