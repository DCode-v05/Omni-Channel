export const playAudioBlob = async (blob: Blob): Promise<void> => {
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);

  try {
    await audio.play();
  } finally {
    audio.onended = () => {
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
    };
  }
};

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

export const stopAudioPlayback = () => {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch {
    }
  }
  currentAudio = null;

  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
};

export const playManagedAudioBlob = async (
  blob: Blob,
  opts?: { signal?: AbortSignal; onStart?: () => void; onEnd?: () => void }
): Promise<void> => {
  if (!blob) return;

  stopAudioPlayback();

  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;
  currentUrl = url;

  const cleanup = () => {
    if (currentAudio === audio) currentAudio = null;
    if (currentUrl === url) {
      URL.revokeObjectURL(url);
      currentUrl = null;
    }
  };

  if (opts?.signal?.aborted) {
    cleanup();
    throw new DOMException('Aborted', 'AbortError');
  }

  return await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      stopAudioPlayback();
      reject(new DOMException('Aborted', 'AbortError'));
    };

    opts?.signal?.addEventListener('abort', onAbort, { once: true });

    audio.onended = () => {
      opts?.signal?.removeEventListener('abort', onAbort);
      cleanup();
      opts?.onEnd?.();
      resolve();
    };

    audio.onerror = () => {
      opts?.signal?.removeEventListener('abort', onAbort);
      cleanup();
      reject(new Error('Audio playback failed'));
    };

    Promise.resolve()
      .then(() => opts?.onStart?.())
      .then(() => audio.play())
      .catch((e) => {
        opts?.signal?.removeEventListener('abort', onAbort);
        cleanup();
        reject(e);
      });
  });
};
