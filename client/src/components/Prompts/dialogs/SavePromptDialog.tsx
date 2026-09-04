import React, { useCallback } from 'react';
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  useToastContext,
} from '@librechat/client';
import CreatePromptForm from '../forms/CreatePromptForm';
import { useLocalize } from '~/hooks';

const MAX_NAME_WORDS = 8;
const MAX_NAME_LENGTH = 60;

const suggestPromptName = (text: string): string => {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return '';
  }
  const name = cleaned.split(' ').slice(0, MAX_NAME_WORDS).join(' ');
  return name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH - 3)}...` : name;
};

interface SavePromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageText: string;
}

export default function SavePromptDialog({
  open,
  onOpenChange,
  messageText,
}: SavePromptDialogProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();

  const handleSuccess = useCallback(() => {
    onOpenChange(false);
    showToast({ message: localize('com_ui_prompt_saved') });
  }, [onOpenChange, showToast, localize]);

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="w-11/12 max-w-3xl">
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_ui_save_prompt')}</OGDialogTitle>
        </OGDialogHeader>
        {/* Padding keeps the name field's floating label and focus rings from clipping */}
        <div className="max-h-[75vh] overflow-y-auto px-1 pt-3">
          <CreatePromptForm
            isDialog
            prefillAsDirty
            defaultValues={{
              name: suggestPromptName(messageText),
              prompt: messageText,
              type: 'text',
              oneliner: undefined,
              command: undefined,
            }}
            onSuccess={handleSuccess}
          />
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}