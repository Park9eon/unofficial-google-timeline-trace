export const withTimeout = <T>(promise: Promise<T>, milliseconds: number, message: string, onTimeout?: () => void) => new Promise<T>((resolve, reject) => {
  const timer = window.setTimeout(() => {
    onTimeout?.();
    reject(new Error(message));
  }, milliseconds);
  promise.then((value) => {window.clearTimeout(timer); resolve(value);}, (error) => {window.clearTimeout(timer); reject(error);});
});
