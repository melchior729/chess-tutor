/** Phone layout: stacked board → eval → moves → openings (see style.css). */
const PHONE_LAYOUT_MQ = "(max-width: 640px)";

export function isPhoneLayout(): boolean {
  return document.documentElement.classList.contains("layout-phone");
}

export function initPhoneLayout(onChange: () => void): void {
  const mq = window.matchMedia(PHONE_LAYOUT_MQ);

  const apply = (): void => {
    document.documentElement.classList.toggle("layout-phone", mq.matches);
    onChange();
  };

  apply();
  mq.addEventListener("change", apply);
}
