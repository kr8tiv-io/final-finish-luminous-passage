export interface PhotoRevisionHandle {
  photoRevision: string;
  signal: AbortSignal;
}

export interface PhotoRevisionGate {
  advance(): PhotoRevisionHandle;
  current(): string | null;
  isCurrent(photoRevision: string): boolean;
  isActiveTask(signal: AbortSignal): boolean;
  startTask(photoRevision: string): AbortSignal;
  cancelTask(): void;
  dispose(): void;
}

export function createPhotoRevisionGate(): PhotoRevisionGate {
  let sequence = 0;
  let active: PhotoRevisionHandle | null = null;
  let revisionController: AbortController | null = null;
  let taskController: AbortController | null = null;
  let unlinkTask: (() => void) | null = null;

  const cancelTask = () => {
    unlinkTask?.();
    unlinkTask = null;
    taskController?.abort();
    taskController = null;
  };

  return {
    advance() {
      cancelTask();
      revisionController?.abort();
      revisionController = new AbortController();
      active = { photoRevision: `photo-${++sequence}`, signal: revisionController.signal };
      return active;
    },
    current: () => active?.photoRevision ?? null,
    isCurrent: (photoRevision) => active?.photoRevision === photoRevision && !active.signal.aborted,
    isActiveTask: (signal) => taskController?.signal === signal && !signal.aborted,
    startTask(photoRevision) {
      cancelTask();
      taskController = new AbortController();
      if (!active || active.photoRevision !== photoRevision || active.signal.aborted) {
        taskController.abort();
        return taskController.signal;
      }
      const controller = taskController;
      const revisionSignal = active.signal;
      const abort = () => controller.abort();
      revisionSignal.addEventListener('abort', abort, { once: true });
      unlinkTask = () => revisionSignal.removeEventListener('abort', abort);
      return controller.signal;
    },
    cancelTask,
    dispose() {
      cancelTask();
      revisionController?.abort();
      revisionController = null;
      active = null;
    },
  };
}
