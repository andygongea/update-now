export function debounce(func: (...args: any[]) => any, wait: number) {
  let timeout: NodeJS.Timeout;
  return function (...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
