import { AlertCircle } from 'lucide-react';

interface AiErrorBoxProps {
  title: string;
  message: string;
}

/** Error panel of the AI dialogs — title plus the provider's message. */
export function AiErrorBox({ title, message }: AiErrorBoxProps) {
  return (
    <div
      role="alert"
      className="flex gap-2.5 rounded-control border border-destructive/30 border-solid bg-destructive/5 p-3 text-sm"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0 space-y-1">
        <p className="font-medium text-destructive">{title}</p>
        <p className="max-h-32 overflow-auto break-words text-muted-foreground text-xs">
          {message}
        </p>
      </div>
    </div>
  );
}
