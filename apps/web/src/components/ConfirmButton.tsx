import { useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button, type ButtonProps } from './ui';

/** Button that asks for confirmation in a modal before running `onConfirm`. */
export function ConfirmButton({ title, message, confirmLabel = 'Confirm', onConfirm, danger, children, ...btn }: Omit<ButtonProps, 'onClick'> & {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<unknown> | void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button {...btn} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={run}>
              {confirmLabel}
            </Button>
          </>
        }
      >
        <div className="text-sm text-muted">{message}</div>
      </Modal>
    </>
  );
}
